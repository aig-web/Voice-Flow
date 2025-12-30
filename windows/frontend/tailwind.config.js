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
        "primary-dark": "var(--primary-dark)",
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
        // Accent colors (same for both themes)
        "accent-blue": "#3B82F6",
        "accent-purple": "#8B5CF6",
        "accent-green": "#10B981",
        "accent-red": "#EF4444",
      },
      fontFamily: {
        "display": ["Inter", "system-ui", "sans-serif"],
        "numbers": ["DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "2xl": "2rem",
        "full": "9999px"
      },
      boxShadow: {
        "glow": "0 0 20px rgba(255, 217, 61, 0.15)",
        "glow-hover": "0 0 30px rgba(255, 217, 61, 0.25)",
        "card": "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
        "card-dark": "0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.3)",
        "subtle": "0 2px 10px rgba(0,0,0,0.05)",
        "floating": "0 10px 40px -10px rgba(0,0,0,0.1)"
      }
    },
  },
  plugins: [],
}
