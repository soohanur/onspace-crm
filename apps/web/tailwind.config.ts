import type { Config } from 'tailwindcss';

// Theme tokens live in app/globals.css as RGB triplets so `bg-x/40` keeps
// working. .dark class on <html> swaps to the Funda dark palette.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: v('--c-primary'),
          hover: v('--c-primary-hover'),
        },
        secondary: v('--c-secondary'),
        neutral: v('--c-neutral'),
        background: v('--c-background'),
        surface: v('--c-surface'),
        'surface-2': v('--c-surface-2'),
        ink: {
          DEFAULT: v('--c-ink'),
          muted: v('--c-ink-muted'),
        },
        border: v('--c-border'),
        success: v('--c-success'),
        successBg: v('--c-success-bg'),
        warning: v('--c-warning'),
        error: v('--c-error'),
        errorBg: v('--c-error-bg'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: ['24px', { lineHeight: '1.2', fontWeight: '700' }],
        h3: ['18px', { lineHeight: '1.3', fontWeight: '700' }],
        body: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        bodysm: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
      },
      boxShadow: {
        e1: '0 1px 3px rgba(5,15,26,0.06)',
        e2: '0 4px 12px rgba(5,15,26,0.08)',
        e3: '0 12px 24px rgba(5,15,26,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
