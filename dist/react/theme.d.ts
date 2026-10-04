import { type ThemeMode } from '../theme';
export type { ThemeMode } from '../theme';
export { THEME_LABELS, THEME_MODES, themeLabel } from '../theme';
export declare function useTheme(): {
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    dark: boolean;
};
