/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'page-bg': '#c3b091',
        'page-dark': '#b09f7a',
        'card-bg': '#f5f0e8',
        'card-border': '#d4c9b4',
        'text-primary': '#3d3229',
        'text-secondary': '#8b7d6b',
        'accent-attack': '#c0392b',
        'accent-heal': '#27ae60',
        'accent-shield': '#2980b9',
        'accent-equip': '#c98910',
        'accent-buff': '#8e44ad',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 12px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 6px 24px rgba(0, 0, 0, 0.12)',
        'card-glow': '0 0 12px rgba(29, 123, 203, 0.2)',
      },
      keyframes: {
        'scale-in': {
        '0%': { opacity: 0, transform: 'scale(0.92) translateY(10px)' },
        '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
