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
import { addDays, dateFormat, isHhmm, isYmd, weekday, weekdayName } from '../time';
import { useKitT } from './i18n';
import { Checkbox, Chip, Field, inputClass, selectClass } from './ui';
const modeOf = (r) => (r.freq === 'week' ? (r.every === 1 ? 'week' : 'weeks') : r.freq);
/** The next `count` dates of a rule in words, in the active locale: "Thu, Oct 23 · Thu, Oct 30 · Thu, Nov 6". */
export function nextDatesText(rule, today, count = 3, changes) {
    const fmt = dateFormat({ weekday: 'short', month: 'short', day: 'numeric' });
    return eventOccurrences(rule, today, addDays(today, 800), { changes })
        .slice(0, count)
        .map((o) => {
        const [y, m, d] = o.date.split('-').map(Number);
        return fmt.format(new Date(y, m - 1, d)).replace(/[\u202f\u00a0]/g, ' ');
    })
        .join(' · ');
}
/**
 * How an event repeats. `rule.start` is the first day it can happen ("Starting"); the weekday chips,
 * the month choice and "every N" are read from and written to the rule.
 */
export function RulePicker({ rule, onChange, today, label }) {
    const kt = useKitT();
    label ??= kt('schedule.repeats');
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
            { label: kt('schedule.onTheDay', { day: Number(rule.start.slice(8)) }), rule: { freq: 'month', every: rule.every, start: rule.start } },
            ...(w.nth <= 4 ? [{ label: kt('schedule.onTheNth', { nth: w.nth, day: weekdayName(w.weekday) }), rule: { freq: 'month', every: rule.every, start: rule.start, nth: w.nth, weekday: w.weekday } }] : []),
            ...(w.last ? [{ label: kt('schedule.onTheNth', { nth: -1, day: weekdayName(w.weekday) }), rule: { freq: 'month', every: rule.every, start: rule.start, nth: -1, weekday: w.weekday } }] : []),
        ]
        : [];
    return (_jsxs("fieldset", { className: "space-y-3 rounded-2xl border border-line p-4", children: [_jsx("legend", { className: "px-1 text-sm font-medium text-ink-soft", children: label }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Chip, { active: mode === 'week', onClick: () => setMode('week'), children: kt('schedule.modeWeek') }), _jsx(Chip, { active: mode === 'weeks', onClick: () => setMode('weeks'), children: kt('schedule.modeWeeks') }), _jsx(Chip, { active: mode === 'month', onClick: () => setMode('month'), children: kt('schedule.modeMonth') }), _jsx(Chip, { active: mode === 'year', onClick: () => setMode('year'), children: kt('schedule.modeYear') })] }), (mode === 'weeks' || mode === 'month') && (_jsxs("label", { className: "flex items-center gap-2 text-base text-ink-soft", children: [_jsx("span", { children: kt('schedule.pickerEvery') }), _jsx("select", { className: `${selectClass} w-auto tabular-nums`, "aria-label": mode === 'weeks' ? kt('schedule.howManyWeeks') : kt('schedule.howManyMonths'), value: rule.every, onChange: (e) => onChange({ ...rule, every: Number(e.target.value) }), children: (mode === 'weeks' ? [2, 3, 4, 5, 6, 8] : [1, 2, 3, 4, 6]).map((n) => (_jsx("option", { value: n, children: n }, n))) }), _jsx("span", { children: kt('schedule.pickerUnit', { unit: mode === 'weeks' ? 'weeks' : 'months', n: rule.every }) })] })), rule.freq === 'week' && (_jsx("div", { className: "flex flex-wrap gap-1.5", role: "group", "aria-label": kt('schedule.onDays'), children: [0, 1, 2, 3, 4, 5, 6].map((d) => (_jsx(Chip, { active: days.includes(d), onClick: () => toggleDay(d), label: weekdayName(d), children: weekdayName(d, { short: true }) }, d))) })), rule.freq === 'month' && (_jsx("div", { className: "flex flex-wrap gap-2", role: "group", "aria-label": kt('schedule.whichDay'), children: monthChoices.map((c) => (_jsx(Chip, { active: (c.rule.nth ?? null) === (rule.nth ?? null), onClick: () => onChange(c.rule), children: c.label }, c.label))) })), _jsx(Field, { label: rule.freq === 'year' ? kt('schedule.on') : kt('schedule.starting'), hint: kt('schedule.ruleHint', { rule: describeRule(rule), dates: nextDatesText(rule, rule.start > today ? rule.start : today) || kt('schedule.none') }), children: _jsx("input", { id: `${id}-start`, className: inputClass, type: "date", value: rule.start, onChange: (e) => setStart(e.target.value) }) })] }));
}
const samePrep = (a, b) => a.daysBefore === b.daysBefore && a.time === b.time;
/**
 * Something to do before each occurrence: off until ticked, then what, when (the evening before,
 * the morning of, or N days before at a time) and whether to send a reminder then.
 */
export function PrepPicker({ prep, onChange, placeholder, suggestedTitle = '' }) {
    const kt = useKitT();
    placeholder ??= kt('schedule.prepPlaceholder');
    const preset = prep ? PREP_PRESETS.find((p) => samePrep(p.offset, prep.offset)) : undefined;
    const set = (patch) => prep && onChange({ ...prep, ...patch });
    return (_jsxs("fieldset", { className: "space-y-3 rounded-2xl border border-line p-4", children: [_jsx("legend", { className: "px-1 text-sm font-medium text-ink-soft", children: kt('schedule.prepLegend') }), _jsx(Checkbox, { checked: !!prep, onChange: (on) => onChange(on ? { title: suggestedTitle, offset: PREP_PRESETS[0].offset, remind: true } : null), children: kt('schedule.prepToggle') }), prep && (_jsxs(_Fragment, { children: [_jsx(Field, { label: kt('schedule.prepWhat'), children: _jsx("input", { className: inputClass, value: prep.title, maxLength: PREP_TITLE_MAX, placeholder: placeholder, onChange: (e) => set({ title: e.target.value }) }) }), _jsxs("div", { className: "flex flex-wrap gap-2", role: "group", "aria-label": kt('schedule.prepWhenLabel'), children: [PREP_PRESETS.map((p) => (_jsx(Chip, { active: preset === p, onClick: () => set({ offset: p.offset }), children: p.label }, `${p.offset.daysBefore}-${p.offset.time}`))), _jsx(Chip, { active: !preset, onClick: () => set({ offset: { daysBefore: 2, time: prep.offset.time } }), children: kt('schedule.daysBefore') })] }), _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [!preset && (_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-ink-soft", children: kt('schedule.daysBefore') }), _jsx("select", { className: `${selectClass} w-auto tabular-nums`, value: prep.offset.daysBefore, onChange: (e) => set({ offset: { ...prep.offset, daysBefore: Number(e.target.value) } }), children: Array.from({ length: MAX_PREP_DAYS + 1 }, (_, n) => (_jsx("option", { value: n, children: n === 0 ? kt('schedule.sameDay') : n }, n))) })] })), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1.5 block text-sm font-medium text-ink-soft", children: kt('schedule.by') }), _jsx("input", { className: `${inputClass} w-auto`, type: "time", value: prep.offset.time, onChange: (e) => isHhmm(e.target.value) && set({ offset: { ...prep.offset, time: e.target.value } }) })] })] }), _jsxs("p", { className: "text-sm text-muted", children: [describePrep(prep.offset), "."] }), _jsx(Checkbox, { checked: prep.remind, onChange: (remind) => set({ remind }), children: kt('schedule.prepRemind') })] }))] }));
}
