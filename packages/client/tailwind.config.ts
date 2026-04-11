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
      },
      fontFamily: {
        display: ['Noto Serif', 'Georgia', 'serif'],
        ui: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'round-eight': '8px',
      },
    },
  },
  plugins: [],
} satisfies Config;
