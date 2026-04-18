import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        accent: 'var(--color-accent)',
        heading: 'var(--color-heading)',
        body: 'var(--color-body)',
        caption: 'var(--color-caption)',
        'sage-bg': 'var(--color-sage-bg)',
        'toggle-track-off': 'var(--color-toggle-track-off)',
        'toggle-track-off-border': 'var(--color-toggle-track-off-border)',
      },
      fontFamily: {
        display: ['Noto Serif', 'Georgia', 'serif'],
        ui: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'round-eight': '8px',
        card: '12px',
      },
      fontSize: {
        'label-caps': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.08em' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
