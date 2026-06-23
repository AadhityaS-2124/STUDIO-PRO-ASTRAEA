import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

interface CanvasTheme {
    timelineBg: string;
    rulerBg: string;
    rulerText: string;
    gridLine: string;
    trackBg: string;
    trackHeaderBg: string;
    trackHeaderText: string;
    playheadColor: string;
}

interface ThemeState {
    mode: ThemeMode;
    canvasTheme: CanvasTheme;
    toggleTheme: () => void;
    setMode: (mode: ThemeMode) => void;
}

const themes: Record<ThemeMode, CanvasTheme> = {
    light: {
        timelineBg: '#ffffff',
        rulerBg: '#f0f0f0',
        rulerText: '#333333',
        gridLine: '#e0e0e0',
        trackBg: '#f5f5f5',
        trackHeaderBg: '#e0e0e0',
        trackHeaderText: '#333333',
        playheadColor: '#ff0000'
    },
    dark: {
        timelineBg: '#050811',
        rulerBg: '#0a0e17',
        rulerText: '#908fa0',
        gridLine: '#464554',
        trackBg: '#0f131d',
        trackHeaderBg: '#0a0e17',
        trackHeaderText: '#dfe2f0',
        playheadColor: '#ffb4ab'
    }
};

export const useThemeStore = create<ThemeState>((set) => ({
    mode: 'dark', // Default to dark
    canvasTheme: themes.dark,
    toggleTheme: () => set((state) => {
        const newMode = state.mode === 'light' ? 'dark' : 'light';
        return { mode: newMode, canvasTheme: themes[newMode] };
    }),
    setMode: (mode) => set({ mode, canvasTheme: themes[mode] })
}));
