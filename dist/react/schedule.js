import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Pickers for event schedules (`@huishouden/pwa-kit/schedule`): `RulePicker` for how an event
 * repeats ("Every Thursday", "Every other Friday", "The third Tuesday of every month") with the
 * next few dates shown as it changes, and `PrepPicker` for something to do before each occurrence
 * ("Take the garbage out, the evening before at 7 PM"). Calm: one row of choices at a time, and the
 * schedule read back in words.
 */
import { useId } from 'react';
import { describePrep, describeRule, eventOccurrences, MAX_PREP_DAYS, PREP_PRESETS, PREP_TITLE_MAX, weekdayOfMonth, } from '../schedule';
import { addDays, isHhmm, isYmd, ordinal, WEEKDAYS, weekday } from '../time';
import { Checkbox, Chip, Field, inputClass, selectClass } from './ui';
const modeOf = (r) => (r.freq === 'week' ? (r.every === 1 ? 'week' : 'weeks') : r.freq);
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
/** The next `count` dates of a rule in words: "Thu, Oct 23 · Thu, Oct 30 · Thu, Nov 6". */
export function nextDatesText(rule, today, count = 3, changes) {
    const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return eventOccurrences(rule, today, addDays(today, 800), { changes })
        .slice(0, count)
        .map((o) => {
        const [y, m, d] = o.date.split('-').map(Number);
        return fmt.format(new Date(y, m - 1, d));
    })
        .join(' · ');
}
/**
 * How an event repeats. `rule.start` is the first day it can happen ("Starting"); the weekday chips,
 * the month choice and "every N" are read from and written to the rule.
 */
export function RulePicker({ rule, onChange, today, label = 'Repeats' }) {
    const id = useId();
    const mode = modeOf(rule);
    const days = rule.freq === 'week' && rule.days?.length ? rule.days : [weekday(rule.start)];
    const w = weekdayOfMonth(rule.start);
    const setMode = (m) => {
        const start = rule.start;
        if (m === 'week')
            onChange({ freq: 'week', every: 1, start, ...(rule.freq === 'week' && rule.days ? { days: rule.days } : {}) });
        else if (m === 'weeks')
            onChange({ freq: 'week', every: rule.freq === 'week' && rule.every > 1 ? rule.every : 2, start });
        else if (m === 'month')
            onChange({ freq: 'month', every: rule.freq === 'month' ? rule.every : 1, start });
        else
            onChange({ freq: 'year', every: 1, start });
    };
    const toggleDay = (d) => {
        const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
        if (next.length === 0)
            return;
        onChange({ ...rule, days: next });
    };
    const setStart = (start) => {
        if (!isYmd(start))
            return;
        if (rule.freq === 'week') {
            // One weekday follows the start; several stay as picked.
            const { days: _d, ...rest } = rule;
            onChange(days.length > 1 ? { ...rule, start } : { ...rest, start });
        }
        else if (rule.freq === 'month' && rule.nth !== undefined) {
            const x = weekdayOfMonth(start);
            onChange({ ...rule, start, nth: rule.nth === -1 && x.last ? -1 : Math.min(x.nth, 4), weekday: x.weekday });
        }
        else
            onChange({ ...rule, start });
    };
    const monthChoices = rule.freq === 'month'
        ? [
            { label: `On the ${ordinalDay(rule.start)}`, rule: { freq: 'month', every: rule.every, start: rule.start } },
            ...(w.nth <= 4 ? [{ label: `On the ${ORDINALS[w.nth]} ${WEEKDAYS[w.weekday]}`, rule: { freq: 'month', every: rule.every, start: rule.start, nth: w.nth, weekday: w.weekday } }] : []),
            ...(w.last ? [{ label: `On the last ${WEEKDAYS[w.weekday]}`, rule: { freq: 'month', every: rule.every, start: rule.start, nth: -1, weekday: w.weekday } }] : []),
        ]
        : [];
    return (_jsxs("fieldset", { className: "space-y-3 rounded-2xl border border-stone-200 p-4 dark:border-forest-600", children: [_jsx("legend", { className: "px-1 text-sm font-medium text-stone-700 dark:text-stone-200", children: label }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Chip, { active: mode === 'week', onClick: () => setMode('week'), children: "Every week" }), _jsx(Chip, { active: mode === 'weeks', onClick: () => setMode('weeks'), children: "Every few weeks" }), _jsx(Chip, { active: mode === 'month', onClick: () => setMode('month'), children: "Every month" }), _jsx(Chip, { active: mode === 'year', onClick: () => setMode('year'), children: "Every year" })] }), (mode === 'weeks' || mode === 'month') && (_jsxs("label", { className: "flex items-center gap-2 text-base text-stone-700 dark:text-stone-200", children: [_jsx("span", { children: "Every" }), _jsx("select", { className: `${selectClass} w-auto tabular-nums`, "aria-label": mode === 'weeks' ? 'How many weeks' : 'How many months', value: rule.every, onChange: (e) => onChange({ ...rule, every: Number(e.target.value) }), children: (mode === 'weeks' ? [2, 3, 4, 5, 6, 8] : [1, 2, 3, 4, 6]).map((n) => (_jsx("option", { value: n, children: n }, n))) }), _jsx("span", { children: mode === 'weeks' ? 'weeks' : rule.every === 1 ? 'month' : 'months' })] })), rule.freq === 'week' && (_jsx("div", { className: "flex flex-wrap gap-1.5", role: "group", "aria-label": "On", children: WEEKDAYS.map((name, d) => (_jsx(Chip, { active: days.includes(d), onClick: () => toggleDay(d), label: name, children: name.slice(0, 3) }, name))) })), rule.freq === 'month' && (_jsx("div", { className: "flex flex-wrap gap-2", role: "group", "aria-label": "Which day", children: monthChoices.map((c) => (_jsx(Chip, { active: (c.rule.nth ?? null) === (rule.nth ?? null), onClick: () => onChange(c.rule), children: c.label }, c.label))) })), _jsx(Field, { label: rule.freq === 'year' ? 'On' : 'Starting', hint: `${describeRule(rule)}. Next: ${nextDatesText(rule, rule.start > today ? rule.start : today) || 'none'}.`, children: _jsx("input", { id: `${id}-start`, className: inputClass, type: "date", value: rule.start, onChange: (e) => setStart(e.target.value) }) })] }));
}
const ordinalDay = (day) => ordinal(Number(day.slice(8)));
const samePrep = (a, b) => a.daysBefore === b.daysBefore && a.time === b.time;
/**
 * Something to do before each occurrence: off until ticked, then what, when (the evening before,
 * the morning of, or N days before at a time) and whether to send a reminder then.
 */
export function PrepPicker({ prep, onChange, placeholder = 'Take the garbage out', suggestedTitle = '' }) {
    const preset = prep ? PREP_PRESETS.find((p) => samePrep(p.offset, prep.offset)) : undefined;
    const set = (patch) => prep && onChange({ ...prep, ...patch });
    return (_jsxs("fieldset", { className: "space-y-3 rounded-2xl border border-stone-200 p-4 dark:border-forest-600", children: [_jsx("legend", { className: "px-1 text-sm font-medium text-stone-700 dark:text-stone-200", children: "Something to do before" }), _jsx(Checkbox, { checked: !!prep, onChange: (on) => onChange(on ? { title: suggestedTitle, offset: PREP_PRESETS[0].offset, remind: true } : null), children: "Something to do before each one" }), prep && (_jsxs(_Fragment, { children: [_jsx(Field, { label: "What to do", children: _jsx("input", { className: inputClass, value: prep.title, maxLength: PREP_TITLE_MAX, placeholder: placeholder, onChange: (e) => set({ title: e.target.value }) }) }), _jsxs("div", { className: "flex flex-wrap gap-2", role: "group", "aria-label": "When", children: [PREP_PRESETS.map((p) => (_jsx(Chip, { active: preset?.label === p.label, onClick: () => set({ offset: p.offset }), children: p.label }, p.label))), _jsx(Chip, { active: !preset, onClick: () => set({ offset: { daysBefore: 2, time: prep.offset.time } }), children: "Days before" })] }), _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [!preset && (_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-200", children: "Days before" }), _jsx("select", { className: `${selectClass} w-auto tabular-nums`, value: prep.offset.daysBefore, onChange: (e) => set({ offset: { ...prep.offset, daysBefore: Number(e.target.value) } }), children: Array.from({ length: MAX_PREP_DAYS + 1 }, (_, n) => (_jsx("option", { value: n, children: n === 0 ? 'Same day' : n }, n))) })] })), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-200", children: "By" }), _jsx("input", { className: `${inputClass} w-auto`, type: "time", value: prep.offset.time, onChange: (e) => isHhmm(e.target.value) && set({ offset: { ...prep.offset, time: e.target.value } }) })] })] }), _jsxs("p", { className: "text-sm text-stone-600 dark:text-stone-300", children: [describePrep(prep.offset), "."] }), _jsx(Checkbox, { checked: prep.remind, onChange: (remind) => set({ remind }), children: "Send a reminder then" })] }))] }));
}
