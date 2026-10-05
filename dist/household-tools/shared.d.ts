import { type AgendaItem } from '../agenda-core.js';
import { type TodoItem } from '../todo-core.js';
import type { LocalClock } from '../local-clock.js';
import type { Here, Session } from './context.js';
/**
 * The household's agenda as the portal shows it to this person (shared items they may read and the
 * personal ones naming them), in the local frame (`../clock`): `start` and `end` moved so the kit's
 * day logic reads the person's calendar.
 */
export declare function loadAgenda(session: Session, here: Here, clock: LocalClock): Promise<AgendaItem[]>;
/** The to-do list as the portal shows it to this person: shared items they may read and their personal ones. Absolute times. */
export declare function loadTodos(session: Session, here: Here): Promise<TodoItem[]>;
/** An agenda item in the reader's language. Call inside `render`. */
export declare function agendaLine(item: AgendaItem, when: string): string;
/** A to-do's words in the reader's language. Call inside `render`. */
export declare const todoText: (item: TodoItem) => {
    title: string;
    detail?: string;
    done?: string;
    cancel?: string;
};
/** Clips and tidies free text from the assistant to what the rules accept. */
export declare const clip: (s: string | undefined, max: number) => string;
/** Lowercase, accents off, for matching names the person said ("Nana" ~ "nana"). */
export declare const fold: (s: string) => string;
/**
 * The one record whose id or name matches `wanted`: exact id, then exact name, then a unique name
 * that starts with or contains it. `undefined` when none; `'ambiguous'` with the candidates.
 */
export declare function pick<T>(items: T[], wanted: string, id: (x: T) => string, name: (x: T) => string): {
    found?: T;
    ambiguous?: T[];
};
/** A FirestoreRest-safe id: a hash of the connection, the tool and the caller's idempotency key, or random. */
export declare function recordId(connectionId: string, tool: string, key?: string): Promise<string>;
/** Whether a create failed because the record already exists (the same idempotency key, retried). */
export declare const alreadyThere: (e: unknown) => boolean;
