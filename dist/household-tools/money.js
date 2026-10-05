import { z } from 'zod';
import { daysBetween, longDate } from '../time.js';
import { formatMoney, setCurrency } from '../money.js';
import { t } from './i18n.js';
import { UserError } from './context.js';
import { isDenied } from './context.js';
import { common, defineTool, render } from './registry.js';
const OPEN = ['overdue', 'attention', 'autopay', 'upcoming', 'no-date'];
const ATTENTION_DAYS = 7;
function billState(b, today, newest) {
    if (b.status === 'paid')
        return 'paid';
    if (b.status === 'credit')
        return 'credit';
    const days = b.due ? daysBetween(today, b.due) : null;
    if (b.autopay?.enrolled && days !== null && days < 0)
        return 'autopaid';
    if (b.source === 'email' && newest && b.due && b.due < newest)
        return 'superseded';
    if (days === null)
        return 'no-date';
    if (b.autopay?.enrolled)
        return days < 0 ? 'autopaid' : 'autopay';
    if (days < 0)
        return 'overdue';
    if (days <= ATTENTION_DAYS)
        return 'attention';
    return 'upcoming';
}
const toBill = (id, d) => ({
    id,
    label: String(d.label ?? ''),
    kind: String(d.kind ?? 'other'),
    source: String(d.source ?? 'manual'),
    ...(typeof d.sourceId === 'string' ? { sourceId: d.sourceId } : {}),
    due: typeof d.due === 'string' ? d.due : null,
    amountDue: d.amountDue && typeof d.amountDue === 'object' ? d.amountDue : null,
    status: String(d.status ?? 'unknown'),
    autopay: d.autopay ?? null,
    ...(typeof d.payUrl === 'string' ? { payUrl: d.payUrl } : {}),
    ...(d.dismissed === true ? { dismissed: true } : {}),
});
export const billsDue = defineTool({
    name: 'bills_due',
    title: 'Bills due',
    description: "The household's open bills from Huishouden Bills: overdue, due within `days` (default 30), on autopay, or without a date, with amounts and pay links. Admins and members only (helpers and kids never see money).",
    kind: 'read',
    input: { ...common, days: z.number().int().min(1).max(366).optional().describe('How far ahead. Default 30.') },
    async run(ctx, args) {
        if (ctx.here.restricted)
            throw new UserError('bills.staffOnly');
        let docs;
        try {
            docs = await ctx.session.db.query(`households/${ctx.here.id}`, 'bills');
        }
        catch (e) {
            if (isDenied(e))
                throw new UserError('bills.staffOnly');
            throw e;
        }
        ctx.touched('bills');
        const today = ctx.clock.today();
        const bills = docs.map((d) => toBill(d.id, d.data));
        const newest = new Map();
        for (const b of bills) {
            if (b.source !== 'email' || !b.sourceId || !b.due || b.dismissed)
                continue;
            const cur = newest.get(b.sourceId);
            if (!cur || b.due > cur)
                newest.set(b.sourceId, b.due);
        }
        const horizon = args.days ?? 30;
        const open = bills
            .map((bill) => ({ bill, state: billState(bill, today, bill.sourceId ? newest.get(bill.sourceId) : undefined) }))
            .filter(({ bill, state }) => OPEN.includes(state) && !bill.dismissed && (bill.due === null || daysBetween(today, bill.due) <= horizon))
            .sort((a, b) => (a.bill.due ?? '9999').localeCompare(b.bill.due ?? '9999') || a.bill.label.localeCompare(b.bill.label));
        setCurrency(ctx.here.currency ?? 'USD');
        const url = ctx.session.link('bills');
        return render(ctx.lang, () => ({
            text: [
                `**${t('bills.title', { days: horizon })}** · ${ctx.here.name}`,
                '',
                ...(open.length
                    ? open.map(({ bill, state }) => `- **${bill.label}** · ${bill.amountDue ? formatMoney(bill.amountDue) : t('bills.noAmount')} · ${bill.due ? longDate(bill.due, today) : t('bills.noDate')} · ${t(`bills.state.${state}`)}${bill.payUrl ? ` · [${t('bills.pay')}](${bill.payUrl})` : ''}`)
                    : [t('bills.none')]),
                '',
                t('bills.link', { url }),
            ].join('\n'),
            data: {
                household: ctx.here.id,
                bills: open.map(({ bill, state }) => ({ id: bill.id, label: bill.label, kind: bill.kind, due: bill.due, amount: bill.amountDue, state, autopay: bill.autopay?.enrolled === true, pay_url: bill.payUrl })),
                url,
            },
        }));
    },
});
