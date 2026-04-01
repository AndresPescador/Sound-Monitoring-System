/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ── Paleta semántica — cambiar aquí cambia TODO el dashboard ──────────
      colors: {
        bg:      '#ffffff',
        surface: '#f8fafc',
        border:  '#e2e8f0',
        primary: {
          DEFAULT: '#1d4ed8',
          light:   '#3b82f6',
          dark:    '#1e3a8a',
        },
        text: {
          DEFAULT: '#1e293b',
          muted:   '#64748b',
          light:   '#94a3b8',
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
