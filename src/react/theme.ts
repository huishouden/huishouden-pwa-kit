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
import { getThemeMode, isDark, onThemeChange, setThemeMode, startTheme, type ThemeMode } from '../theme';

export type { ThemeMode } from '../theme';
export { THEME_LABELS, THEME_MODES, themeLabel } from '../theme';

const subscribe = (notify: () => void) => onThemeChange(notify);
const snapshot = () => `${getThemeMode()}|${isDark() ? 1 : 0}`;
const serverSnapshot = () => 'auto|0';

export function useTheme(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void; dark: boolean } {
  useEffect(() => startTheme(), []);
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [mode, dark] = state.split('|') as [ThemeMode, string];
  const setMode = useCallback((next: ThemeMode) => setThemeMode(next), []);
  return { mode, setMode, dark: dark === '1' };
}
