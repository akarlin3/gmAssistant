'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Moon, Scroll } from 'lucide-react';

export type UITheme = 'slate' | 'parchment';
export const THEME_STORAGE_KEY = 'gma_ui_theme';

export const THEME_COLORS: Record<UITheme, string> = {
  slate: '#090d16',
  parchment: '#f5efe4',
};

interface ThemeContextValue {
  theme: UITheme;
  setTheme: (next: UITheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'slate',
  setTheme: () => {},
  toggleTheme: () => {},
});

function applyDomTheme(theme: UITheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === 'slate') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const themeColor = THEME_COLORS[theme];
  const metas = document.head.querySelectorAll('meta[name="theme-color"]');
  if (metas.length > 0) {
    metas.forEach((meta) => {
      meta.setAttribute('content', themeColor);
    });
  } else {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = themeColor;
    document.head.appendChild(meta);
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'slate',
}: {
  children: React.ReactNode;
  defaultTheme?: UITheme;
}) {
  const [theme, setThemeState] = useState<UITheme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'slate' || stored === 'parchment') {
        return stored;
      }
    } catch {
      // Ignore storage access errors
    }
    return defaultTheme;
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'slate' || stored === 'parchment') {
        setThemeState(stored);
        applyDomTheme(stored);
        return;
      }
    } catch {
      // Ignore storage access errors
    }
    applyDomTheme(theme);
  }, []);

  useEffect(() => {
    applyDomTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  const setTheme = useCallback((next: UITheme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'slate' ? 'parchment' : 'slate'));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {/* Subtle fixed SVG fractal-noise / paper texture overlay */}
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9999] h-full w-full opacity-[0.025]"
      >
        <filter id="gma-fractal-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="3"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#gma-fractal-noise)" />
      </svg>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeToggleButton({
  className = '',
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isSlate = theme === 'slate';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        isSlate
          ? 'Switch to Warm Parchment theme'
          : 'Switch to Obsidian Slate theme'
      }
      title={
        isSlate
          ? 'Obsidian Slate (Click for Warm Parchment)'
          : 'Warm Parchment (Click for Obsidian Slate)'
      }
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-sans text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] ${className}`}
    >
      {isSlate ? (
        <Moon size={14} className="text-sky-400" />
      ) : (
        <Scroll size={14} className="text-amber-700" />
      )}
      {showLabel && (
        <span>{isSlate ? 'Obsidian Slate' : 'Warm Parchment'}</span>
      )}
    </button>
  );
}
