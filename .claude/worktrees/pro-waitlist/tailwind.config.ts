import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          DEFAULT: '#f5ecd7',
          soft: '#faf3e0',
          deep: '#ebdfc2',
        },
        ink: {
          DEFAULT: '#1a1410',
          soft: '#52443a',
          mute: '#8a7a6a',
          faint: '#b3a48f',
        },
        crimson: {
          DEFAULT: '#9a1d2e',
          deep: '#6e1d24',
          soft: '#c44456',
        },
        brass: {
          DEFAULT: '#a87f2e',
          soft: '#c9a05c',
          deep: '#7a5a1e',
        },
        rule: '#d8c9a5',
        moss: '#3d5a2a',
        wine: '#5c1f3d',
      },
      fontFamily: {
        display: ['var(--font-cinzel)', 'Cinzel', 'Georgia', 'serif'],
        serif: ['var(--font-garamond)', '"EB Garamond"', 'Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        page: '0 1px 2px rgba(58, 38, 16, 0.08), 0 4px 12px rgba(58, 38, 16, 0.06)',
        card: '0 1px 2px rgba(58, 38, 16, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
