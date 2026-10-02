/**
 * Google Identity Services (https://accounts.google.com/gsi/client), loaded once per page and
 * shared by One Tap sign-in (`./auth`) and API access tokens (`./google-token`).
 */
const GSI_SRC = 'https://accounts.google.com/gsi/client';
let loading = null;
/** Google Identity Services once it has loaded; the script tag is added on the first call only. */
export function loadGsi() {
    if (window.google?.accounts)
        return Promise.resolve(window.google.accounts);
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = GSI_SRC;
        script.async = true;
        script.onload = () => (window.google?.accounts ? resolve(window.google.accounts) : reject(new Error('Google Identity Services did not load')));
        script.onerror = () => reject(new Error('Google Identity Services failed to load'));
        document.head.appendChild(script);
    }).catch((e) => {
        // A failed load (offline) can be tried again on the next call.
        loading = null;
        throw e;
    });
    return loading;
}
/** Google Identity Services when it is already loaded, so a tap can open Google's window without waiting. */
export function loadedGsi() {
    return typeof window !== 'undefined' && window.google?.accounts ? window.google.accounts : null;
}
