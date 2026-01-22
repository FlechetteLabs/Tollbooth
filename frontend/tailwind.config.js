/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'inspector-bg': '#0f172a',
        'inspector-surface': '#1e293b',
        'inspector-border': '#334155',
        'inspector-text': '#e2e8f0',
        'inspector-muted': '#94a3b8',
        'inspector-accent': '#3b82f6',
        'inspector-success': '#22c55e',
        'inspector-warning': '#f59e0b',
        'inspector-error': '#ef4444',
      },
    },
  },
  plugins: [],
}
