import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        subtle: 'var(--border-subtle)',
        accent: 'var(--accent-primary)',
        parchment: {
          DEFAULT: 'var(--color-parchment)',
          soft: 'var(--color-parchment-soft)',
          deep: 'var(--color-parchment-deep)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          soft: 'var(--color-ink-soft)',
          mute: 'var(--color-ink-mute)',
          faint: 'var(--color-ink-faint)',
        },
        crimson: {
          DEFAULT: 'var(--color-crimson)',
          deep: 'var(--color-crimson-deep)',
          soft: 'var(--color-crimson-soft)',
        },
        brass: {
          DEFAULT: 'var(--color-brass)',
          soft: 'var(--color-brass-soft)',
          deep: 'var(--color-brass-deep)',
        },
        rule: 'var(--color-rule)',
        moss: 'var(--color-moss)',
        wine: 'var(--color-wine)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', '"Cormorant Garamond"', 'Georgia', 'serif'],
        serif: ['var(--font-sans)', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        page: 'var(--shadow-page)',
        card: 'var(--shadow-card)',
        glass: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 4px 20px -2px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
