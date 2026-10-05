import { z } from 'zod';
import { CONTACT_PAY_COLLECTION, CONTACT_PAY_KINDS, cleanContact, cleanContactPay, contactInput, toContact, withContactPay, type Contact, type ContactPay } from '../contact-core.js';
import { FOLLOW_UP_UNITS, REMIND_CHOICES, VISIT_KINDS } from '../visit.js';
import { formatDateLong, formatTime } from '../time.js';
import { t } from './i18n.js';
import { UserError } from './context.js';
import { common, defineTool, idempotency, render, type ToolContext } from './registry.js';
import { clip, fold, pick, recordId } from './shared.js';
import { create } from './home.js';
import { addHealthVisit } from './health-visits.js';

// ---- Appointments: Pet, Baby, Car and Health, each in its app's own collections ----

const APPOINTMENT_APPS = ['pet', 'baby', 'car', 'health'] as const;

export const addAppointment = defineTool({
  name: 'add_appointment',
  title: 'Add an appointment',
  description:
    "Adds an appointment, as this person: `app: \"pet\"` (vet, grooming, boarding), `\"baby\"` (pediatrician, checkups), `\"car\"` (service, inspection) in that app's own list, or `\"health\"` (a doctor's, dentist's, eye, lab, vaccine or therapy visit for someone in Health: a visit in Health, on the calendars of only that person's carers, the person and the admins, reminding their carers the day before and 2 hours before unless `remind_before_minutes` says otherwise). It shows on the household calendar. `private` hides a pet, baby or car appointment from helpers and kids (admins and members only can set it). Health notes are kept from helpers; only admins and members who care for the person can add them.",
  kind: 'write',
  input: {
    ...common,
    ...idempotency,
    app: z.enum(APPOINTMENT_APPS),
    title: z.string().min(1).max(120).describe('"Annual checkup", "Oil change", "Dr. Example, cardiology".'),
    start: z.string().max(40).describe('Local "YYYY-MM-DDTHH:MM" (or "YYYY-MM-DD" when the time is unknown).'),
    duration_minutes: z.number().int().min(5).max(24 * 60).optional().describe('Health only: how long. Default 60.'),
    location: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
    pets: z.array(z.string().max(60)).max(10).optional().describe('Pet: which pets, by name or id. Default all.'),
    pet_kind: z.enum(['vet', 'grooming', 'boarding', 'other']).optional().describe('Pet: default vet.'),
    vehicle: z.string().max(60).optional().describe('Car: which car, by name or id.'),
    person: z.string().max(60).optional().describe('Health: whose appointment, by name or id (required for health).'),
    health_kind: z.enum(VISIT_KINDS).optional().describe('Health: checkup, specialist, dentist, eye, lab (a test), vaccine, therapy or other. Default: guessed from the title.'),
    doctor: z.string().max(120).optional().describe('Health: the doctor or clinic, a household contact by name or id (`contacts_search`).'),
    video_link: z.string().max(500).optional().describe('Health: the https link to join a video visit.'),
    prep: z.array(z.string().max(80)).max(6).optional().describe('Health: what to do or bring before: "Fasting from midnight".'),
    bring_medicine_list: z.boolean().optional().describe("Health: bring the person's printable medicine list."),
    remind_before_minutes: z.array(z.number().int().min(0).max(20160)).max(4).optional().describe(`Health: reminders this many minutes before, to the carers. Default [1440, 120]. Health offers ${REMIND_CHOICES.join(', ')}.`),
    follow_up: z.object({ every: z.number().int().min(1).max(24), unit: z.enum(FOLLOW_UP_UNITS) }).optional().describe('Health: a follow-up due this long after; once the visit is over, "Book a follow-up" goes on the to-do list.'),
    private: z.boolean().optional().describe('Pet, baby, car: only admins and members see it. Default false.'),
  },
  async run(ctx, args) {
    const when = ctx.clock.parse(args.start);
    if (!when) throw new UserError('error.badDate', { value: args.start });
    if (args.private && ctx.here.restricted) throw new UserError('appointment.privateStaffOnly');
    const now = ctx.clock.now();
    const id = await recordId(ctx.session.props.connectionId, 'add_appointment', args.idempotency_key);
    const base = `households/${ctx.here.id}`;
    const title = clip(args.title, 120);
    const location = clip(args.location, 200);
    const notes = clip(args.notes, 500);
    const at = Math.round(when.at);
    const common = { title, at, ...(location ? { location } : {}), ...(notes ? { notes } : {}), private: args.private === true, createdAt: now, by: ctx.session.email, ...ctx.session.via };
    const day = () => (when.allDay ? formatDateLong(ctx.clock.local(at)) : `${formatDateLong(ctx.clock.local(at))} ${formatTime(ctx.clock.local(at))}`);
    let path: string;
    let url: string;
    let who = '';
    if (args.app === 'pet') {
      const pets = (await ctx.session.db.query(base, 'petProfiles')).map((d) => ({ id: d.id, name: String(d.data.name ?? '') }));
      const chosen = args.pets?.length
        ? args.pets.map((p) => {
            const { found } = pick(pets, p, (x) => x.id, (x) => x.name);
            if (!found) throw new UserError('pet.unknown', { name: p, pets: pets.map((x) => x.name).join(', ') });
            return found;
          })
        : pets;
      who = chosen.map((p) => p.name).join(', ');
      path = `${base}/petAppointments/${id}`;
      url = ctx.session.link('pet', '?tab=appointments');
      const repeated = await create(ctx, path, { petIds: [...new Set(chosen.map((p) => p.id))].slice(0, 10), kind: args.pet_kind ?? 'vet', ...common });
      return done(ctx, 'pet', path, id, repeated, title, day, url, who);
    }
    if (args.app === 'baby') {
      path = `${base}/babyAppointments/${id}`;
      url = ctx.session.link('baby', '#appointments');
      const repeated = await create(ctx, path, common);
      return done(ctx, 'baby', path, id, repeated, title, day, url, who);
    }
    if (args.app === 'car') {
      let vehicleId: string | undefined;
      if (args.vehicle) {
        const cars = (await ctx.session.db.query(base, 'carVehicles')).map((d) => ({ id: d.id, name: String(d.data.name ?? '') }));
        const { found } = pick(cars, args.vehicle, (x) => x.id, (x) => x.name);
        if (!found) throw new UserError('car.unknown', { name: args.vehicle, cars: cars.map((c) => c.name).join(', ') || '-' });
        vehicleId = found.id;
        who = found.name;
      }
      path = `${base}/carAppointments/${id}`;
      url = ctx.session.link('car');
      const repeated = await create(ctx, path, { ...(vehicleId ? { vehicleId } : {}), ...common });
      return done(ctx, 'car', path, id, repeated, title, day, url, who);
    }
    // Health: a visit under the person (@huishouden/pwa-kit/visit), published as Health publishes it.
    const added = await addHealthVisit(ctx, id, {
      person: args.person,
      title,
      at,
      allDay: when.allDay,
      minutes: args.duration_minutes,
      location,
      notes,
      kind: args.health_kind,
      doctor: args.doctor,
      videoLink: args.video_link,
      prep: args.prep,
      medList: args.bring_medicine_list,
      remindBefore: args.remind_before_minutes,
      followUp: args.follow_up,
    });
    return render(ctx.lang, () => ({
      text: t('appointment.added', { title, when: day(), who: added.person.name, url: added.url }),
      data: { id, app: 'health', title, url: added.url, repeated: added.repeated, person: added.person.id },
    }));
  },
});

function done(ctx: ToolContext, app: string, path: string, id: string, repeated: boolean, title: string, day: () => string, url: string, who: string) {
  ctx.touched(app, path.split('/').slice(2).join('/'));
  return render(ctx.lang, () => ({
    text: t('appointment.added', { title, when: day(), who: who || '-', url }),
    data: { id, app, title, url, repeated },
  }));
}

// ---- Contacts: the household's shared address book ----

function contactLine(c: Contact): string {
  const pay = c.pay ? CONTACT_PAY_KINDS.filter((k) => c.pay![k]).map((k) => `${k}: ${c.pay![k]}`) : [];
  const bits = [c.role, c.phone, c.email, c.website, c.address, ...pay].filter(Boolean);
  return `- **${c.name}**${bits.length ? ` · ${bits.join(' · ')}` : ''}${c.apps.length ? ` · ${c.apps.join(', ')}` : ''}${c.private ? ' · 🔒' : ''} · id \`${c.id}\``;
}

export const contactsSearch = defineTool({
  name: 'contacts_search',
  title: 'Search household contacts',
  description:
    "Searches the household's shared contacts (doctors, the vet, the pharmacy, the plumber, the school…) by name, role, phone, email, address or notes. Helpers and kids see only contacts not marked private. For admins and members, each carries how the household pays them (`pay`: zelle, venmo, bank, check, portal) when Bills remembered it; helpers and kids never get pay details.",
  kind: 'read',
  input: {
    ...common,
    query: z.string().max(100).optional().describe('Words to look for. Leave out to list all.'),
    app: z.enum(['tasks', 'groceries', 'pet', 'baby', 'home', 'car', 'bills', 'health']).optional().describe("Only contacts shown in this app."),
  },
  async run(ctx, args) {
    const docs = await ctx.session.openRecords(ctx.here, 'contacts', true);
    ctx.touched('contacts');
    // Pay details are money: read for admins and members only (the rules refuse helpers and kids).
    const pay = new Map<string, ContactPay>();
    if (!ctx.here.restricted) {
      for (const d of await ctx.session.openRecords(ctx.here, CONTACT_PAY_COLLECTION, false)) {
        const p = cleanContactPay(d.data);
        if (p) pay.set(d.id, p);
      }
    }
    const words = fold(args.query ?? '').split(/\s+/).filter(Boolean);
    const all = withContactPay(docs.map((d) => toContact(d.id, d.data)), pay);
    const found = all
      .filter((c) => (!args.app || c.apps.includes(args.app)) && words.every((w) => fold([c.name, c.role, c.phone, c.email, c.website, c.address, c.notes].filter(Boolean).join(' ')).includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return render(ctx.lang, () => ({
      text: [`**${t('contacts.title', { count: found.length })}** · ${ctx.here.name}`, '', ...(found.length ? found.slice(0, 50).map(contactLine) : [t('contacts.none')])].join('\n'),
      data: { household: ctx.here.id, contacts: found.slice(0, 50).map(({ createdAt: _c, updatedAt: _u, by: _b, ...c }) => c) },
    }));
  },
});

export const contactsAdd = defineTool({
  name: 'contacts_add',
  title: 'Add a household contact',
  description:
    "Adds a person or business to the household's shared contacts, as this person, shown in the apps you name (a pediatrician in baby, a vet in pet, a pharmacy or doctor in health…). `private` keeps it from helpers and kids (admins and members only).",
  kind: 'write',
  input: {
    ...common,
    ...idempotency,
    name: z.string().min(1).max(120),
    role: z.string().max(60).optional().describe('"Pediatrician", "Vet", "Pharmacy", "Doctor", "Plumber".'),
    phone: z.string().max(40).optional(),
    email: z.string().max(120).optional(),
    website: z.string().max(300).optional(),
    address: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
    apps: z.array(z.enum(['tasks', 'groceries', 'pet', 'baby', 'home', 'car', 'bills', 'health'])).min(1).max(8).describe('Apps that show it.'),
    private: z.boolean().optional(),
  },
  async run(ctx, args) {
    if (args.private && ctx.here.restricted) throw new UserError('appointment.privateStaffOnly');
    const input = cleanContact(contactInput({ name: args.name, role: args.role, phone: args.phone, email: args.email, website: args.website, address: args.address, notes: args.notes, private: args.private === true }, args.apps, args.apps[0]));
    if (input.website && !/^https?:\/\/.+/i.test(input.website)) throw new UserError('error.badLink');
    const id = await recordId(ctx.session.props.connectionId, 'contacts_add', args.idempotency_key);
    const repeated = await create(ctx, `households/${ctx.here.id}/contacts/${id}`, { ...input, createdAt: ctx.clock.now(), by: ctx.session.email, ...ctx.session.via });
    ctx.touched('contacts', `contacts/${id}`);
    return render(ctx.lang, () => ({ text: t('contacts.added', { name: input.name, apps: input.apps.join(', ') }), data: { id, ...input, repeated } }));
  },
});
