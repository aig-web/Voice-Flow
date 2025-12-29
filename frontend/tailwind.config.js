/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Use CSS variables for theme-aware colors
        "primary": "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-content": "var(--primary-content)",
        "background-light": "var(--background-light)",
        "surface-light": "var(--surface-light)",
        "surface-hover": "var(--surface-hover)",
        "surface-active": "var(--surface-active)",
        "text-main": "var(--text-main)",
        "text-muted": "var(--text-muted)",
        "text-body": "var(--text-body)",
        "border-light": "var(--border-light)",
      },
      fontFamily: {
        "display": ["Spline Sans", "system-ui", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "1.5rem",
        "xl": "2rem",
        "2xl": "3rem",
        "full": "9999px"
      },
      boxShadow: {
        "glow": "0 0 20px rgba(249, 245, 6, 0.15)",
        "glow-hover": "0 0 30px rgba(249, 245, 6, 0.25)",
        "card": "0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.02)",
        "subtle": "0 2px 10px rgba(0,0,0,0.03)",
        "floating": "0 10px 40px -10px rgba(0,0,0,0.08)"
      }
    },
  },
  plugins: [],
}
