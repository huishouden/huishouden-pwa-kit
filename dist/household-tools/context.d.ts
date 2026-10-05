import { type Role } from '../role-core.js';
import { type Lang } from '../i18n.js';
import { LocalClock } from '../local-clock.js';
import { FirestoreRest, type Doc } from '../firestore-rest.js';
import { type HouseholdHome } from '../home.js';
/** Who a session acts as, and how (the connector's grant, the `hh` command line's sign-in). */
export interface SessionProps {
    uid: string;
    email: string;
    /**
     * This caller's stable id (the connector's connection, `hh-<uid>` for the command line): with an
     * `idempotency_key` it makes a retried write land on the same record.
     */
    connectionId: string;
    /** The language and time zone the portal's device had at sign-in, until the profile says otherwise. */
    lang?: Lang;
    timeZone?: string;
    /**
     * Marks what this session writes (`via: 'assistant'`, which the rules accept and the apps show);
     * left out, records look as if the person made them in an app.
     */
    via?: 'assistant';
}
export interface Household {
    id: string;
    name: string;
    members: string[];
    joined: string[];
    roles?: Record<string, Role>;
    currency?: string;
    /** Where the household lives (`households/{id}.home`): every member reads it. */
    home?: HouseholdHome;
    createdAt: number;
}
export declare function toHousehold(id: string, d: Record<string, unknown>): Household;
/** The household the apps open (`@huishouden/pwa-kit/household` pickHousehold): joined first, then oldest. */
export declare function pickHousehold(households: Household[], email: string): Household | null;
export interface Profile {
    name?: string;
    lang?: Lang;
    timeZone?: string;
}
export interface AuditEntry {
    tool: string;
    kind: 'read' | 'write';
    ok: boolean;
    app?: string;
    ref?: string;
}
/** A household the person is in, with their role there. */
export interface Here extends Household {
    role: Role;
    /** A helper or kid: reads of private-capable collections ask for `private == false`. */
    restricted: boolean;
}
/** Thrown for anything the person should hear in their language (an unknown pet, no household). */
export declare class UserError extends Error {
    readonly key: string;
    readonly vars: Record<string, string | number>;
    constructor(key: string, vars?: Record<string, string | number>);
}
/**
 * One tool call's view of the world: who is asking (their FirestoreRest access, as them), their clock
 * and language, and their households. Built per request; cheap, since reads happen on demand.
 */
export declare class Session {
    readonly props: SessionProps;
    readonly db: FirestoreRest;
    readonly siteUrl: string;
    private readonly realNow;
    private readonly audit;
    private householdsP;
    private profiles;
    constructor(props: SessionProps, db: FirestoreRest, siteUrl: string, realNow?: () => number, audit?: (household: string, entry: AuditEntry) => void);
    get email(): string;
    /** What every write by this session carries: `{ via: 'assistant' }` for the connector, else nothing. */
    get via(): {
        via?: 'assistant';
    };
    households(): Promise<Household[]>;
    /** The household `id`, or the one the apps open; throws a UserError when there is none. */
    here(id?: string): Promise<Here>;
    profile(householdId: string): Promise<Profile>;
    /** The language to answer in: the call's, the profile's, the one at sign-in, else English. Loaded. */
    lang(householdId: string | undefined, asked?: string): Promise<Lang>;
    clock(householdId: string | undefined, asked?: string): Promise<LocalClock>;
    /** "Sam": the profile's first name, else the email's name part, for `addedBy`. */
    firstName(householdId: string): Promise<string>;
    link(app: string, query?: string): string;
    record(householdId: string, entry: AuditEntry): void;
    /** Reads `collection` under the household, as the person may (helpers and kids only open records). */
    openRecords(here: Here, collection: string, privateCapable: boolean, where?: Parameters<FirestoreRest['query']>[2]): Promise<Doc[]>;
}
export declare const isDenied: (e: unknown) => boolean;
