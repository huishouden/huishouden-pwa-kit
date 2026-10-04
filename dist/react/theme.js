/**
 * The suite's light/dark choice in React (`@huishouden/pwa-kit/theme`): `mode` is the stored
 * choice (Automatic, Light or Dark), `dark` whether the page is dark now, `setMode` changes it for
 * every app. The app bar's account menu already offers the choice; an app's settings may too.
 *
 * ```tsx
 * const { mode, setMode, dark } = useTheme();
 * ```
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getThemeMode, isDark, onThemeChange, setThemeMode, startTheme } from '../theme';
export { THEME_LABELS, THEME_MODES, themeLabel } from '../theme';
const subscribe = (notify) => onThemeChange(notify);
const snapshot = () => `${getThemeMode()}|${isDark() ? 1 : 0}`;
const serverSnapshot = () => 'auto|0';
export function useTheme() {
    useEffect(() => startTheme(), []);
    const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
    const [mode, dark] = state.split('|');
    const setMode = useCallback((next) => setThemeMode(next), []);
    return { mode, setMode, dark: dark === '1' };
}
