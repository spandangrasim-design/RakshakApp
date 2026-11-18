/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // One brand colour (deep indigo-blue). Existing `brand-*` classes keep working.
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dce8ff', 200: '#bdd2ff', 300: '#8fb0ff', 400: '#5d86fa',
          500: '#3b63f0', 600: '#2748d6', 700: '#1f39ad', 800: '#1d3189', 900: '#1b2a6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10)',
        lift: '0 16px 36px -16px rgba(39,72,214,.38)',
        nav: '0 -6px 24px -12px rgba(15,23,42,.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(18px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'grow-x': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        'grow-y': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'slide-up': 'slide-up .4s cubic-bezier(.2,.8,.2,1) both',
        'slide-in-right': 'slide-in-right .3s cubic-bezier(.2,.8,.2,1) both',
        'sheet-up': 'sheet-up .28s cubic-bezier(.2,.8,.2,1) both',
        'scale-in': 'scale-in .2s ease-out both',
        'grow-x': 'grow-x .7s cubic-bezier(.2,.8,.2,1) both',
        'grow-y': 'grow-y .7s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
