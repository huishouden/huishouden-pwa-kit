/**
 * Pickers for event schedules (`@huishouden/pwa-kit/schedule`): `RulePicker` for how an event
 * repeats ("Every Thursday", "Every other Friday", "The third Tuesday of every month") with the
 * next few dates shown as it changes, and `PrepPicker` for something to do before each occurrence
 * ("Take the garbage out, the evening before at 7 PM"). Calm: one row of choices at a time, and the
 * schedule read back in words.
 */
import { useId } from 'react';
import {
  describePrep, describeRule, eventOccurrences, MAX_PREP_DAYS, PREP_PRESETS, PREP_TITLE_MAX, weekdayOfMonth,
  type EventPrep, type EventRule, type Nth, type OccurrenceChanges, type PrepOffset,
} from '../schedule';
import { addDays, dateFormat, isHhmm, isYmd, weekday, weekdayName, type Ymd } from '../time';
import { useKitT } from './i18n';
import { Checkbox, Chip, Field, inputClass, selectClass } from './ui';

type Mode = 'week' | 'weeks' | 'month' | 'year';

const modeOf = (r: EventRule): Mode => (r.freq === 'week' ? (r.every === 1 ? 'week' : 'weeks') : r.freq);

/** The next `count` dates of a rule in words, in the active locale: "Thu, Oct 23 · Thu, Oct 30 · Thu, Nov 6". */
export function nextDatesText(rule: EventRule, today: Ymd, count = 3, changes?: OccurrenceChanges | null): string {
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
export function RulePicker({ rule, onChange, today, label }: { rule: EventRule; onChange: (rule: EventRule) => void; today: Ymd; label?: string }) {
  const kt = useKitT();
  label ??= kt('schedule.repeats');
  const id = useId();
  const mode = modeOf(rule);
  const days = rule.freq === 'week' && rule.days?.length ? rule.days : [weekday(rule.start)];
  const w = weekdayOfMonth(rule.start);

  const setMode = (m: Mode) => {
    const start = rule.start;
    if (m === 'week') onChange({ freq: 'week', every: 1, start, ...(rule.freq === 'week' && rule.days ? { days: rule.days } : {}) });
    else if (m === 'weeks') onChange({ freq: 'week', every: rule.freq === 'week' && rule.every > 1 ? rule.every : 2, start });
    else if (m === 'month') onChange({ freq: 'month', every: rule.freq === 'month' ? rule.every : 1, start });
    else onChange({ freq: 'year', every: 1, start });
  };

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    if (next.length === 0) return;
    onChange({ ...rule, days: next });
  };

  const setStart = (start: Ymd) => {
    if (!isYmd(start)) return;
    if (rule.freq === 'week') {
      // One weekday follows the start; several stay as picked.
      const { days: _d, ...rest } = rule;
      onChange(days.length > 1 ? { ...rule, start } : { ...rest, start });
    } else if (rule.freq === 'month' && rule.nth !== undefined) {
      const x = weekdayOfMonth(start);
      onChange({ ...rule, start, nth: rule.nth === -1 && x.last ? -1 : (Math.min(x.nth, 4) as Nth), weekday: x.weekday });
    } else onChange({ ...rule, start });
  };

  const monthChoices: { label: string; rule: EventRule }[] =
    rule.freq === 'month'
      ? [
          { label: kt('schedule.onTheDay', { day: Number(rule.start.slice(8)) }), rule: { freq: 'month', every: rule.every, start: rule.start } },
          ...(w.nth <= 4 ? [{ label: kt('schedule.onTheNth', { nth: w.nth, day: weekdayName(w.weekday) }), rule: { freq: 'month' as const, every: rule.every, start: rule.start, nth: w.nth as Nth, weekday: w.weekday } }] : []),
          ...(w.last ? [{ label: kt('schedule.onTheNth', { nth: -1, day: weekdayName(w.weekday) }), rule: { freq: 'month' as const, every: rule.every, start: rule.start, nth: -1 as Nth, weekday: w.weekday } }] : []),
        ]
      : [];

  return (
    <fieldset className="space-y-3 rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-medium text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <Chip active={mode === 'week'} onClick={() => setMode('week')}>{kt('schedule.modeWeek')}</Chip>
        <Chip active={mode === 'weeks'} onClick={() => setMode('weeks')}>{kt('schedule.modeWeeks')}</Chip>
        <Chip active={mode === 'month'} onClick={() => setMode('month')}>{kt('schedule.modeMonth')}</Chip>
        <Chip active={mode === 'year'} onClick={() => setMode('year')}>{kt('schedule.modeYear')}</Chip>
      </div>

      {(mode === 'weeks' || mode === 'month') && (
        <label className="flex items-center gap-2 text-base text-ink-soft">
          <span>{kt('schedule.pickerEvery')}</span>
          <select
            className={`${selectClass} w-auto tabular-nums`}
            aria-label={mode === 'weeks' ? kt('schedule.howManyWeeks') : kt('schedule.howManyMonths')}
            value={rule.every}
            onChange={(e) => onChange({ ...rule, every: Number(e.target.value) })}
          >
            {(mode === 'weeks' ? [2, 3, 4, 5, 6, 8] : [1, 2, 3, 4, 6]).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>{kt('schedule.pickerUnit', { unit: mode === 'weeks' ? 'weeks' : 'months', n: rule.every })}</span>
        </label>
      )}

      {rule.freq === 'week' && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={kt('schedule.onDays')}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Chip key={d} active={days.includes(d)} onClick={() => toggleDay(d)} label={weekdayName(d)}>
              {weekdayName(d, { short: true })}
            </Chip>
          ))}
        </div>
      )}

      {rule.freq === 'month' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={kt('schedule.whichDay')}>
          {monthChoices.map((c) => (
            <Chip key={c.label} active={(c.rule.nth ?? null) === (rule.nth ?? null)} onClick={() => onChange(c.rule)}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}

      <Field
        label={rule.freq === 'year' ? kt('schedule.on') : kt('schedule.starting')}
        hint={kt('schedule.ruleHint', { rule: describeRule(rule), dates: nextDatesText(rule, rule.start > today ? rule.start : today) || kt('schedule.none') })}
      >
        <input id={`${id}-start`} className={inputClass} type="date" value={rule.start} onChange={(e) => setStart(e.target.value)} />
      </Field>
    </fieldset>
  );
}

const samePrep = (a: PrepOffset, b: PrepOffset) => a.daysBefore === b.daysBefore && a.time === b.time;

/**
 * Something to do before each occurrence: off until ticked, then what, when (the evening before,
 * the morning of, or N days before at a time) and whether to send a reminder then.
 */
export function PrepPicker({ prep, onChange, placeholder, suggestedTitle = '' }: {
  prep: EventPrep | null;
  onChange: (prep: EventPrep | null) => void;
  placeholder?: string;
  /** The title a newly ticked one starts with. */
  suggestedTitle?: string;
}) {
  const kt = useKitT();
  placeholder ??= kt('schedule.prepPlaceholder');
  const preset = prep ? PREP_PRESETS.find((p) => samePrep(p.offset, prep.offset)) : undefined;
  const set = (patch: Partial<EventPrep>) => prep && onChange({ ...prep, ...patch });
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-medium text-ink-soft">{kt('schedule.prepLegend')}</legend>
      <Checkbox checked={!!prep} onChange={(on) => onChange(on ? { title: suggestedTitle, offset: PREP_PRESETS[0].offset, remind: true } : null)}>
        {kt('schedule.prepToggle')}
      </Checkbox>
      {prep && (
        <>
          <Field label={kt('schedule.prepWhat')}>
            <input className={inputClass} value={prep.title} maxLength={PREP_TITLE_MAX} placeholder={placeholder} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label={kt('schedule.prepWhenLabel')}>
            {PREP_PRESETS.map((p) => (
              <Chip key={`${p.offset.daysBefore}-${p.offset.time}`} active={preset === p} onClick={() => set({ offset: p.offset })}>
                {p.label}
              </Chip>
            ))}
            <Chip active={!preset} onClick={() => set({ offset: { daysBefore: 2, time: prep.offset.time } })}>
              {kt('schedule.daysBefore')}
            </Chip>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {!preset && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-soft">{kt('schedule.daysBefore')}</span>
                <select className={`${selectClass} w-auto tabular-nums`} value={prep.offset.daysBefore} onChange={(e) => set({ offset: { ...prep.offset, daysBefore: Number(e.target.value) } })}>
                  {Array.from({ length: MAX_PREP_DAYS + 1 }, (_, n) => (
                    <option key={n} value={n}>{n === 0 ? kt('schedule.sameDay') : n}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">{kt('schedule.by')}</span>
              <input
                className={`${inputClass} w-auto`}
                type="time"
                value={prep.offset.time}
                onChange={(e) => isHhmm(e.target.value) && set({ offset: { ...prep.offset, time: e.target.value } })}
              />
            </label>
          </div>
          <p className="text-sm text-muted">{describePrep(prep.offset)}.</p>
          <Checkbox checked={prep.remind} onChange={(remind) => set({ remind })}>
            {kt('schedule.prepRemind')}
          </Checkbox>
        </>
      )}
    </fieldset>
  );
}
