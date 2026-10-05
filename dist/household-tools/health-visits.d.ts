import { z } from 'zod';
import { FOLLOW_UP_UNITS, VISIT_KINDS, type Visit } from '../visit.js';
import { type ToolContext } from './registry.js';
import { type Person } from './health-data.js';
/**
 * Health's visits (`../visit`), as this person may read and write them: every
 * reader of the person reads them (admins, carers, the person), keepers (admins and member carers)
 * also the notes. `add_appointment` with `app: "health"` adds one here and publishes it as Health
 * would, so it is on the calendars and reminds before anyone opens Health.
 */
/** Admins, and members who are among the person's readers (the rules' healthKeeper). */
export declare function keeps(ctx: ToolContext, p: Person): boolean;
export declare const visitUrl: (ctx: ToolContext, v: Pick<Visit, "id" | "personId">) => string;
export interface HealthVisitArgs {
    person?: string;
    title: string;
    at: number;
    allDay: boolean;
    minutes?: number;
    location?: string;
    notes?: string;
    kind?: (typeof VISIT_KINDS)[number];
    doctor?: string;
    videoLink?: string;
    prep?: string[];
    medList?: boolean;
    remindBefore?: number[];
    followUp?: {
        every: number;
        unit: (typeof FOLLOW_UP_UNITS)[number];
    };
}
/**
 * Adds a visit for someone in Health as this person (`by`, `via: assistant`), its notes when they
 * keep them, and what Health publishes for it: the agenda item and the reminders, for the person's
 * audience. Health's own sync keeps them current after that (same ids).
 */
export declare function addHealthVisit(ctx: ToolContext, id: string, args: HealthVisitArgs): Promise<{
    person: Person;
    visit: Visit;
    url: string;
    repeated: boolean;
}>;
export declare const healthAppointments: import("./registry.js").ToolDef<Readonly<{
    [k: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
}>>;
