/**
 * Firestore over REST for servers (no Firebase SDK, no DOM), as the signed-in person (their Firebase ID token on every call), so the
 * household's security rules decide every read and write exactly as in the apps. Values come back
 * typed (`{"integerValue": "5"}`) and are decoded into plain JSON; whole numbers are written as
 * integers, as the Firebase SDK does, since the rules check `is int`.
 */
export type Value = {
    nullValue: null;
} | {
    booleanValue: boolean;
} | {
    integerValue: string;
} | {
    doubleValue: number;
} | {
    timestampValue: string;
} | {
    stringValue: string;
} | {
    arrayValue: {
        values?: Value[];
    };
} | {
    mapValue: {
        fields?: Record<string, Value>;
    };
};
export interface Doc {
    id: string;
    /** Path under `documents/`: households/h1/items/i1 */
    path: string;
    data: Record<string, unknown>;
    updateTime?: string;
}
/** `increment(n)`: added on the server, as the SDK's FieldValue. */
export declare class Increment {
    readonly by: number;
    constructor(by: number);
}
export type Code = 'permission-denied' | 'not-found' | 'already-exists' | 'failed-precondition' | 'invalid-argument' | 'unauthenticated' | 'unavailable' | 'unknown';
export declare class FirestoreError extends Error {
    readonly code: Code;
    constructor(code: Code, message: string);
}
export declare function encode(v: unknown): Value;
/** Fields of a document, leaving out `undefined` (as JSON does) and increments (written as transforms). */
export declare function encodeFields(data: Record<string, unknown>): Record<string, Value>;
export declare function decode(value: Value): unknown;
export declare function decodeFields(fields?: Record<string, Value>): Record<string, unknown>;
/** Leaf field paths of a merge, as the SDK's `set(…, { merge: true })` writes them (nested maps merge too). */
export declare function mergePaths(data: Record<string, unknown>, prefix?: string): string[];
/** One write in a commit: a full set, a merge (creating the document if missing), a create that must not overwrite, or a delete. */
export type Write = {
    path: string;
    set: Record<string, unknown>;
} | {
    path: string;
    merge: Record<string, unknown>;
} | {
    path: string;
    create: Record<string, unknown>;
} | {
    path: string;
    delete: true;
};
export interface FieldFilter {
    field: string;
    op: 'EQUAL' | 'ARRAY_CONTAINS' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'IN';
    value: unknown;
}
export interface QueryOptions {
    where?: FieldFilter[];
    orderBy?: {
        field: string;
        direction?: 'ASCENDING' | 'DESCENDING';
    }[];
    limit?: number;
}
/** `fetch`, or a stand-in for tests. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface FirestoreRestOptions {
    projectId: string;
    /** The person's Firebase ID token (`./firebase-auth-rest`), fresh for each call. */
    token: () => Promise<string>;
    /** Default https://firestore.googleapis.com/v1; the emulator's is http://127.0.0.1:8080/v1. */
    baseUrl?: string;
    fetch?: Fetch;
}
export declare class FirestoreRest {
    readonly root: string;
    readonly projectId: string;
    private readonly base;
    private readonly token;
    private readonly fetchImpl;
    constructor({ projectId, token, baseUrl, fetch: fetchImpl }: FirestoreRestOptions);
    private call;
    private docOf;
    /** The document, or null when it doesn't exist. A refused read throws `permission-denied`. */
    get(path: string): Promise<Doc | null>;
    /**
     * Documents of `collection` under `parent` (a document path, or '' for the root) matching every
     * filter. The rules check the query as a whole, so a helper's reads of private-capable
     * collections must ask for `private == false`.
     */
    query(parent: string, collection: string, { where, orderBy, limit }?: QueryOptions): Promise<Doc[]>;
    /** Every write at once, or none: the rules check each as if the app had made it. */
    commit(writes: Write[]): Promise<void>;
}
