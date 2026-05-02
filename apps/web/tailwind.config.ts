import type { Config } from 'tailwindcss';

// Crypto Blue design system tokens.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0052FF',
          hover: '#003ECB',
        },
        secondary: '#5B616E',
        neutral: '#8A919E',
        background: '#F9FAFB',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#050F1A',
          muted: '#5B616E',
        },
        border: '#D1D5DB',
        success: '#05B169',
        successBg: '#E6F6EF',
        warning: '#F0AD4E',
        error: '#DF2935',
        errorBg: '#FDECEE',
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
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
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
