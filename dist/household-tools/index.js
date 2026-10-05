/**
 * The household's data as one signed-in person, for servers and command lines: every tool the AI
 * connector (huishouden/connector) offers and `hh data` runs, in one place so the two can't drift.
 * Each tool reads and writes Firestore over REST as the person (`../firestore-rest` with their ID
 * token from `../firebase-auth-rest`), so the household's rules decide everything, and answers in
 * their language and time zone with links into the apps.
 *
 * Server-safe: no DOM, no Firebase SDK. Needs `zod` (a peer dependency) for the tools' inputs, and a
 * process in UTC (Workers are; a command line sets `TZ=UTC` first): `../local-clock` moves times
 * into a frame whose UTC fields are the person's wall clock, and the kit formats them as local.
 *
 *   const session = new Session({ uid, email, connectionId }, db, siteUrl);
 *   const call = await runTool(session, toolNamed('today')!, { household: 'Home' });
 *   call.result.text; call.result.data;
 */
import { z } from 'zod';
import { FirebaseAuthError } from '../firebase-auth-rest.js';
import { FirestoreError } from '../firestore-rest.js';
import { UserError } from './context.js';
import { failureText, render, withHealthNote } from './registry.js';
import { t } from './i18n.js';
import { calendar, householdHome, households, today, todos } from './overview.js';
import { groceriesAdd, groceriesCheck, groceriesList, tasksAdd, todoCancel, todoDone } from './lists.js';
import { billsDue } from './money.js';
import { petLogDose, petLogFeeding, petToday } from './pet.js';
import { homeAddEvent, homeUpkeepDue } from './home.js';
import { addAppointment, contactsAdd, contactsSearch } from './people.js';
import { healthAddMedicine, healthDoctorList, healthDue, healthHistory, healthLogDose, healthMedicines, healthPeople, healthUpdateMedicine } from './health.js';
export { Session, UserError } from './context.js';
/** Every tool, in the order clients list them. */
export const TOOLS = [
    households,
    householdHome,
    today,
    calendar,
    todos,
    todoDone,
    todoCancel,
    groceriesList,
    groceriesAdd,
    groceriesCheck,
    tasksAdd,
    billsDue,
    petToday,
    petLogFeeding,
    petLogDose,
    homeUpkeepDue,
    homeAddEvent,
    addAppointment,
    contactsSearch,
    contactsAdd,
    healthPeople,
    healthMedicines,
    healthHistory,
    healthDue,
    healthLogDose,
    healthAddMedicine,
    healthUpdateMedicine,
    healthDoctorList,
];
export const toolNamed = (name) => TOOLS.find((tool) => tool.name === name);
/** The tool's arguments checked against its input schema: the parsed arguments, or what is wrong with them. */
export function checkArgs(tool, raw) {
    const parsed = z.strictObject(tool.input).safeParse(raw);
    if (parsed.success)
        return { ok: true, args: parsed.data };
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(arguments)'}: ${i.message}`) };
}
/**
 * Throws unless this process runs in UTC (summer and winter): every time the tools show and every
 * local day would otherwise be off by the machine's offset, Health's dose times included.
 */
export function assertUtcProcess() {
    if (new Date(Date.UTC(2000, 0, 1)).getTimezoneOffset() !== 0 || new Date(Date.UTC(2000, 6, 1)).getTimezoneOffset() !== 0)
        throw new Error('household-tools needs a UTC process: set TZ=UTC before anything uses a Date');
}
/**
 * Runs `tool` as `session`'s person with already-checked `args` (`checkArgs`, or an MCP server's
 * own validation): the household (`args.household` or the one the apps open), their language and
 * clock, then the tool. Never throws for the person's or the rules' reasons: the result says why.
 */
export async function runTool(session, tool, args, { allow } = {}) {
    assertUtcProcess();
    let lang = 'en';
    let householdId;
    let touched = {};
    try {
        lang = await session.lang(undefined, args.lang);
        if (allow && !(await allow(tool.kind))) {
            const error = new UserError('error.rateLimited');
            return { result: { text: render(lang, () => t('error.rateLimited')), error: true }, lang, touched, error };
        }
        const here = await session.here(args.household);
        householdId = here.id;
        lang = await session.lang(here.id, args.lang);
        const clock = await session.clock(here.id, args.time_zone);
        const result = await tool.run({ session, here, clock, lang, touched: (app, ref) => (touched = { app, ...(ref ? { ref } : {}) }) }, args);
        return { result: withHealthNote(result, lang, tool.health), lang, householdId, touched };
    }
    catch (e) {
        return { result: withHealthNote({ text: failureText(e, lang), error: true }, lang, tool.health), lang, householdId, touched, error: e };
    }
}
/** A short code for what went wrong, never a message (messages may hold names): for logs. */
export const errorCode = (e) => e instanceof UserError ? `user:${e.key}` : e instanceof FirestoreError ? `firestore:${e.code}` : e instanceof FirebaseAuthError ? `auth:${e.kind}` : e instanceof Error ? e.name : 'unknown';
/** The person's Firebase sign-in has ended for good (signed out everywhere, account disabled). */
export const signInEnded = (e) => e instanceof FirebaseAuthError && e.kind === 'revoked';
