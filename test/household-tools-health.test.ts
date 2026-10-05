import { describe, expect, test } from 'bun:test';
import { runTool, Session, toolNamed } from '../src/household-tools';
import { FirestoreError, Increment, type Doc, type FirestoreRest, type Write } from '../src/firestore-rest';

// Health's writes through the shared tools, on an in-memory Firestore (no rules: those are tested in
// huishouden/connector against the emulator). 13:00 UTC is 08:00 in New York: Nan's morning dose is due.
// The tools run in a UTC process (Workers do; `hh` sets TZ), as LocalClock's frame needs.
process.env.TZ = 'UTC';

const NOW = Date.UTC(2031, 0, 6, 13);
const SAM = 'sam@example.com';
const ALEX = 'alex@example.com';
const H = 'households/h1';
const NAN = `${H}/healthPeople/p1`;
const SLOT = '2031-01-06T08:00';
const DOSE = `${NAN}/doses/m1_2031-01-06T0800`;

type Data = Record<string, unknown>;

/** Enough of FirestoreRest for the tools: documents by path, equality, array-contains and >= filters, atomic commits. */
function memoryDb(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const commits: Write[][] = [];
  const toDoc = (path: string, data: Data): Doc => ({ id: path.split('/').pop()!, path, data });
  const db = {
    get: async (path: string) => (docs.has(path) ? toDoc(path, docs.get(path)!) : null),
    query: async (parent: string, collection: string, { where = [] }: { where?: { field: string; op: string; value: unknown }[] } = {}) => {
      const prefix = `${parent ? `${parent}/` : ''}${collection}/`;
      return [...docs.entries()]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .filter(([, d]) =>
          where.every((w) =>
            w.op === 'EQUAL' ? d[w.field] === w.value : w.op === 'ARRAY_CONTAINS' ? Array.isArray(d[w.field]) && (d[w.field] as unknown[]).includes(w.value) : w.op === 'GREATER_THAN_OR_EQUAL' ? (d[w.field] as number) >= (w.value as number) : true,
          ),
        )
        .map(([p, d]) => toDoc(p, d));
    },
    commit: async (writes: Write[]) => {
      for (const w of writes) if ('create' in w && docs.has(w.path)) throw new FirestoreError('already-exists', w.path);
      commits.push(writes);
      for (const w of writes) {
        if ('delete' in w) docs.delete(w.path);
        else if ('create' in w) docs.set(w.path, w.create);
        else if ('set' in w) docs.set(w.path, w.set);
        else if ('merge' in w) {
          const merged: Data = { ...(docs.get(w.path) ?? {}) };
          for (const [k, v] of Object.entries(w.merge)) merged[k] = v instanceof Increment ? (Number(merged[k] ?? 0) + v.by) : v;
          docs.set(w.path, merged);
        }
      }
    },
  } as unknown as FirestoreRest;
  return { db, docs, commits };
}

function household(extra: Record<string, Data> = {}) {
  return memoryDb({
    [H]: { name: 'Home', members: [SAM, ALEX], joined: [SAM, ALEX], roles: { [ALEX]: 'helper' }, createdAt: 1 },
    [NAN]: { name: 'Nan', carers: [SAM, ALEX], readers: [SAM, ALEX] },
    [`${NAN}/meds/m1`]: { personId: 'p1', name: 'Examplamine', strength: '10 mg', dose: '1 tablet', asNeeded: false, times: ['08:00', '20:00'], everyDays: 1, startDate: '2031-01-01', createdAt: 1, by: SAM },
    ...extra,
  });
}

const as = (email: string, db: FirestoreRest) => new Session({ uid: email, email, connectionId: `hh-${email}`, timeZone: 'America/New_York' }, db, 'https://example.web.app', () => NOW);
const run = (email: string, db: FirestoreRest, tool: string, args: Record<string, unknown>) => runTool(as(email, db), toolNamed(tool)!, args);

describe('health_log_dose', () => {
  test("marks the dose due now, signed by the person, without the assistant's mark", async () => {
    const { db, docs } = household();
    const call = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine' });
    expect(call.result.data).toMatchObject({ written: true, slot: SLOT, status: 'given' });
    expect(docs.get(DOSE)).toEqual({ personId: 'p1', medId: 'm1', slot: SLOT, at: NOW, status: 'given', by: SAM, createdAt: NOW });
  });

  test('a second give soon after asks first (the double-dose guard); confirmed, it marks the next dose time', async () => {
    const { db, commits } = household({ [DOSE]: { personId: 'p1', medId: 'm1', slot: SLOT, at: NOW - 600_000, status: 'given', by: SAM, createdAt: NOW - 600_000 } });
    const asked = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine' });
    expect(asked.result.data).toMatchObject({ written: false, needs_confirmation: true });
    expect(commits).toEqual([]);
    const confirmed = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', confirm: true });
    expect(confirmed.result.data).toMatchObject({ written: true, slot: '2031-01-06T20:00' });
  });

  test('turning a given dose into a skipped one asks first', async () => {
    const { db, docs, commits } = household({ [DOSE]: { personId: 'p1', medId: 'm1', slot: SLOT, at: NOW - 600_000, status: 'given', by: SAM, createdAt: NOW - 600_000 } });
    const asked = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '08:00', status: 'skipped' });
    expect(asked.result.data).toMatchObject({ written: false, needs_confirmation: true });
    expect(asked.result.text).toContain('was marked given at 7:50 AM');
    expect(commits).toEqual([]);
    await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '08:00', status: 'skipped', confirm: true });
    expect(docs.get(DOSE)).toMatchObject({ status: 'skipped', by: SAM });
  });

  test("giving a dose someone else gave asks first, naming them", async () => {
    const { db, commits } = household({ [DOSE]: { personId: 'p1', medId: 'm1', slot: SLOT, at: NOW - 600_000, status: 'given', by: ALEX, createdAt: NOW - 600_000 } });
    const asked = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '08:00' });
    expect(asked.result.data).toMatchObject({ written: false, needs_confirmation: true });
    expect(asked.result.text).toContain('was already given');
    expect(commits).toEqual([]);
  });

  test("giving a dose someone else marked skipped is refused, not re-signed", async () => {
    const theirs = { personId: 'p1', medId: 'm1', slot: SLOT, at: NOW - 600_000, status: 'skipped', by: ALEX, createdAt: NOW - 600_000 };
    const { db, docs, commits } = household({ [DOSE]: theirs });
    const call = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '08:00' });
    expect(call.result.text).toContain('Someone else already marked that dose');
    expect(commits).toEqual([]);
    expect(docs.get(DOSE)).toEqual(theirs);
  });

  test("someone else's mark is theirs: nothing is overwritten, confirmed or not", async () => {
    const theirs = { personId: 'p1', medId: 'm1', slot: SLOT, at: NOW - 600_000, status: 'given', by: ALEX, createdAt: NOW - 600_000 };
    for (const args of [{ status: 'skipped' }, { status: 'skipped', confirm: true }, { confirm: true }]) {
      const { db, docs, commits } = household({ [DOSE]: theirs });
      const call = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '08:00', ...args });
      expect(call.result.error).toBe(true);
      expect(call.result.text).toContain('Someone else already marked that dose');
      expect(commits).toEqual([]);
      expect(docs.get(DOSE)).toEqual(theirs);
    }
  });

  test('a named earlier dose time today, and a time that is not one', async () => {
    const { db, docs } = household();
    const call = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '20:00', status: 'skipped' });
    expect(call.result.data).toMatchObject({ written: true, slot: '2031-01-06T20:00', status: 'skipped' });
    expect(docs.has(`${NAN}/doses/m1_2031-01-06T2000`)).toBe(true);
    const bad = await run(SAM, db, 'health_log_dose', { person: 'Nan', medicine: 'Examplamine', dose_time: '09:00' });
    expect(bad.result.error).toBe(true);
  });
});

describe('health_add_medicine and health_update_medicine', () => {
  test("adding writes Health's medicine shape, signed by the person", async () => {
    const { db, docs } = household();
    const call = await run(SAM, db, 'health_add_medicine', { person: 'Nan', name: 'Otheramine', strength: '5 mg', times: ['21:00', '09:00'], weekdays: ['monday', 'thursday'], supply: 30, dose_amount: 1 });
    expect(call.result.error).toBeUndefined();
    const [path, med] = [...docs.entries()].find(([p, d]) => p.startsWith(`${NAN}/meds/`) && d.name === 'Otheramine')!;
    expect(path).toMatch(/^households\/h1\/healthPeople\/p1\/meds\/[A-Za-z0-9]{20}$/);
    expect(med).toMatchObject({ personId: 'p1', strength: '5 mg', asNeeded: false, times: ['09:00', '21:00'], startDate: '2031-01-06', supply: 30, supplyAt: NOW, doseAmount: 1, remind: true, escalateMinutes: 30, createdAt: NOW, by: SAM });
    expect(med.rule).toMatchObject({ freq: 'week', days: [1, 4] });
    expect(med).not.toHaveProperty('everyDays');
    expect(med).not.toHaveProperty('via');
  });

  test('a scheduled medicine needs times; a course cannot end before it starts', async () => {
    const { db } = household();
    expect((await run(SAM, db, 'health_add_medicine', { person: 'Nan', name: 'X' })).result.error).toBe(true);
    expect((await run(SAM, db, 'health_add_medicine', { person: 'Nan', name: 'X', times: ['08:00'], start_date: '2031-01-06', end_date: '2031-01-01' })).result.error).toBe(true);
  });

  test('a helper may mark a refill ordered, whatever else the call carries, and change nothing else', async () => {
    const { db, docs } = household();
    const call = await run(ALEX, db, 'health_update_medicine', { person: 'Nan', medicine: 'Examplamine', refill_ordered: true, lang: 'en', time_zone: 'America/New_York', household: 'h1' });
    expect(call.result.error).toBeUndefined();
    expect(docs.get(`${NAN}/meds/m1`)).toMatchObject({ refillOrderedAt: NOW, updatedAt: NOW, strength: '10 mg', by: SAM });
    const change = await run(ALEX, db, 'health_update_medicine', { person: 'Nan', medicine: 'Examplamine', strength: '20 mg' });
    expect(change.result.error).toBe(true);
    expect(docs.get(`${NAN}/meds/m1`)).toMatchObject({ strength: '10 mg' });
  });

  test('stopping ends it today and keeps the rest', async () => {
    const { db, docs } = household();
    await run(SAM, db, 'health_update_medicine', { person: 'Nan', medicine: 'Examplamine', stop: true });
    expect(docs.get(`${NAN}/meds/m1`)).toMatchObject({ endDate: '2031-01-06', times: ['08:00', '20:00'], strength: '10 mg', createdAt: 1, updatedAt: NOW });
  });
});
