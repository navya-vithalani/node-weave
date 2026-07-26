/**
 * Theme system for NodeWeave accent colors.
 * Each theme defines CSS variable values that get set on :root.
 */

export const THEMES = {
  orange: { accent: '#e8b84d', hover: '#f6ca69', r: 232, g: 184, b: 77 },
  purple: { accent: '#a78bfa', hover: '#c4b5fd', r: 167, g: 139, b: 250 },
  blue:   { accent: '#60a5fa', hover: '#93c5fd', r: 96,  g: 165, b: 250 },
  green:  { accent: '#34d399', hover: '#6ee7b7', r: 52,  g: 211, b: 153 },
  pink:   { accent: '#f472b6', hover: '#f9a8d4', r: 244, g: 114, b: 182 },
  red:    { accent: '#f87171', hover: '#fca5a5', r: 248, g: 113, b: 113 },
} as const;

export type ThemeName = keyof typeof THEMES;

const STORAGE_KEY = 'nodeweave-theme';

export function applyTheme(name: ThemeName) {
  const theme = THEMES[name];
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-hover', theme.hover);
  root.style.setProperty('--accent-r', String(theme.r));
  root.style.setProperty('--accent-g', String(theme.g));
  root.style.setProperty('--accent-b', String(theme.b));
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* noop */ }
}

export function loadSavedTheme(): ThemeName | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in THEMES) return saved as ThemeName;
  } catch { /* noop */ }
  return null;
}
