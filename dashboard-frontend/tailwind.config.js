/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ── Paleta semántica — cambiar aquí cambia TODO el dashboard ──────────
      colors: {
        bg:      'rgb(var(--theme-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--theme-surface-rgb) / <alpha-value>)',
        border:  'rgb(var(--theme-line-rgb) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--theme-primary-rgb, 29 78 216) / <alpha-value>)',
          light:   'rgb(var(--theme-primary-light-rgb, 59 130 246) / <alpha-value>)',
          dark:    'rgb(var(--theme-primary-dark-rgb, 30 58 138) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--theme-text-rgb, 30 41 59) / <alpha-value>)',
          muted:   'rgb(var(--theme-text-muted-rgb, 100 116 139) / <alpha-value>)',
          light:   'rgb(var(--theme-text-light-rgb, 148 163 184) / <alpha-value>)',
        },
        noise: {
          low:    '#16a34a',   // verde — Leq < -30 dBFS
          medium: '#d97706',   // amarillo — -30 a -20 dBFS
          high:   '#dc2626',   // rojo — > -20 dBFS
        },
      },
      fontFamily: {
        // Titulos: DM Sans (geométrica, institucional pero moderna)
        // Cuerpo: Source Sans 3 (legible, reportes técnicos)
        sans: ['"Source Sans 3"', 'sans-serif'],
        display: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
