import { type EventPrep, type EventRule, type OccurrenceChanges } from '../schedule';
import { type Ymd } from '../time';
/** The next `count` dates of a rule in words, in the active locale: "Thu, Oct 23 · Thu, Oct 30 · Thu, Nov 6". */
export declare function nextDatesText(rule: EventRule, today: Ymd, count?: number, changes?: OccurrenceChanges | null): string;
/**
 * How an event repeats. `rule.start` is the first day it can happen ("Starting"); the weekday chips,
 * the month choice and "every N" are read from and written to the rule.
 */
export declare function RulePicker({ rule, onChange, today, label }: {
    rule: EventRule;
    onChange: (rule: EventRule) => void;
    today: Ymd;
    label?: string;
}): import("react").JSX.Element;
/**
 * Something to do before each occurrence: off until ticked, then what, when (the evening before,
 * the morning of, or N days before at a time) and whether to send a reminder then.
 */
export declare function PrepPicker({ prep, onChange, placeholder, suggestedTitle }: {
    prep: EventPrep | null;
    onChange: (prep: EventPrep | null) => void;
    placeholder?: string;
    /** The title a newly ticked one starts with. */
    suggestedTitle?: string;
}): import("react").JSX.Element;
