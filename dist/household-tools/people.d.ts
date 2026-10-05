import { z } from 'zod';
export declare const addAppointment: import("./registry.js").ToolDef<{
    app: z.ZodEnum<{
        baby: "baby";
        pet: "pet";
        car: "car";
        health: "health";
    }>;
    title: z.ZodString;
    start: z.ZodString;
    duration_minutes: z.ZodOptional<z.ZodNumber>;
    location: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    pets: z.ZodOptional<z.ZodArray<z.ZodString>>;
    pet_kind: z.ZodOptional<z.ZodEnum<{
        other: "other";
        vet: "vet";
        grooming: "grooming";
        boarding: "boarding";
    }>>;
    vehicle: z.ZodOptional<z.ZodString>;
    person: z.ZodOptional<z.ZodString>;
    private: z.ZodOptional<z.ZodBoolean>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const contactsSearch: import("./registry.js").ToolDef<{
    query: z.ZodOptional<z.ZodString>;
    app: z.ZodOptional<z.ZodEnum<{
        home: "home";
        bills: "bills";
        baby: "baby";
        pet: "pet";
        car: "car";
        tasks: "tasks";
        health: "health";
        groceries: "groceries";
    }>>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const contactsAdd: import("./registry.js").ToolDef<{
    name: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    apps: z.ZodArray<z.ZodEnum<{
        home: "home";
        bills: "bills";
        baby: "baby";
        pet: "pet";
        car: "car";
        tasks: "tasks";
        health: "health";
        groceries: "groceries";
    }>>;
    private: z.ZodOptional<z.ZodBoolean>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
