import { z } from 'zod';
import { withLang } from '../i18n.js';
import { FirestoreError } from '../firestore-rest.js';
import { UserError } from './context.js';
import { t } from './i18n.js';
/** Every tool takes these: which household (the one the apps open by default) and the answer's language and time zone. */
export const common = {
    household: z.string().min(1).max(100).optional().describe('Household id or name, from `households`. Leave out for the one the apps open.'),
    lang: z.enum(['en', 'es', 'nl']).optional().describe("Answer language. Leave out to use the person's Huishouden language."),
    time_zone: z.string().max(64).optional().describe('IANA time zone such as "America/New_York". Leave out to use the one in their profile.'),
};
export const idempotency = {
    idempotency_key: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,64}$/)
        .optional()
        .describe('Any unique string for this one change. A retry with the same key does nothing new and answers the same.'),
};
export function defineTool(def) {
    return def;
}
/** Text in the person's language: `fn` runs with the kit's language switched (it must not await). */
export const render = (lang, fn) => withLang(lang, fn);
/** Health answers end with the one-line not-medical-advice note, in the person's language. */
export function withHealthNote(result, lang, health = false) {
    return health ? { ...result, text: `${result.text}\n\n_${render(lang, () => t('health.note'))}_` } : result;
}
/** What a failure tells the assistant, in the person's language; nothing about the data. */
export function failureText(e, lang) {
    return render(lang, () => {
        if (e instanceof UserError)
            return t(e.key, e.vars);
        if (e instanceof FirestoreError) {
            if (e.code === 'permission-denied')
                return t('error.denied');
            if (e.code === 'unavailable')
                return t('error.unavailable');
        }
        return t('error.unknown');
    });
}
