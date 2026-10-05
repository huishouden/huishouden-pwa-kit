import { z } from 'zod';
export declare const healthPeople: import("./registry.js").ToolDef<{
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthMedicines: import("./registry.js").ToolDef<{
    person: z.ZodString;
    include_stopped: z.ZodOptional<z.ZodBoolean>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthHistory: import("./registry.js").ToolDef<{
    person: z.ZodString;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    medicine: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthDue: import("./registry.js").ToolDef<{
    person: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthLogDose: import("./registry.js").ToolDef<{
    person: z.ZodString;
    medicine: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<{
        skipped: "skipped";
        given: "given";
    }>>;
    dose_time: z.ZodOptional<z.ZodString>;
    given_at: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
    confirm: z.ZodOptional<z.ZodBoolean>;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthAddMedicine: import("./registry.js").ToolDef<{
    name: z.ZodString;
    strength: z.ZodOptional<z.ZodString>;
    dose: z.ZodOptional<z.ZodString>;
    dose_amount: z.ZodOptional<z.ZodNumber>;
    dose_unit: z.ZodOptional<z.ZodString>;
    as_needed: z.ZodOptional<z.ZodBoolean>;
    times: z.ZodOptional<z.ZodArray<z.ZodString>>;
    every_days: z.ZodOptional<z.ZodNumber>;
    weekdays: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        sunday: "sunday";
        monday: "monday";
        tuesday: "tuesday";
        wednesday: "wednesday";
        thursday: "thursday";
        friday: "friday";
        saturday: "saturday";
    }>>>;
    min_hours: z.ZodOptional<z.ZodNumber>;
    max_per_day: z.ZodOptional<z.ZodNumber>;
    with_food: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    prescriber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pharmacy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    refills: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supply: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reminders: z.ZodOptional<z.ZodBoolean>;
    escalate_minutes: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person: z.ZodString;
    idempotency_key: z.ZodOptional<z.ZodString>;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthUpdateMedicine: import("./registry.js").ToolDef<{
    name: z.ZodOptional<z.ZodString>;
    stop: z.ZodOptional<z.ZodBoolean>;
    restart: z.ZodOptional<z.ZodBoolean>;
    refill_ordered: z.ZodOptional<z.ZodBoolean>;
    strength: z.ZodOptional<z.ZodString>;
    dose: z.ZodOptional<z.ZodString>;
    dose_amount: z.ZodOptional<z.ZodNumber>;
    dose_unit: z.ZodOptional<z.ZodString>;
    as_needed: z.ZodOptional<z.ZodBoolean>;
    times: z.ZodOptional<z.ZodArray<z.ZodString>>;
    every_days: z.ZodOptional<z.ZodNumber>;
    weekdays: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        sunday: "sunday";
        monday: "monday";
        tuesday: "tuesday";
        wednesday: "wednesday";
        thursday: "thursday";
        friday: "friday";
        saturday: "saturday";
    }>>>;
    min_hours: z.ZodOptional<z.ZodNumber>;
    max_per_day: z.ZodOptional<z.ZodNumber>;
    with_food: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    prescriber: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pharmacy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    refills: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supply: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reminders: z.ZodOptional<z.ZodBoolean>;
    escalate_minutes: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    person: z.ZodString;
    medicine: z.ZodString;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
export declare const healthDoctorList: import("./registry.js").ToolDef<{
    person: z.ZodString;
    household: z.ZodOptional<z.ZodString>;
    lang: z.ZodOptional<z.ZodEnum<{
        en: "en";
        es: "es";
        nl: "nl";
    }>>;
    time_zone: z.ZodOptional<z.ZodString>;
}>;
