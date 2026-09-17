/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,ts,js}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          900: '#07090E',
          800: '#0C0F17',
          700: '#131824',
          600: '#1C2233',
        },
        sonic: {
          green: '#1ED760',
          emerald: '#10B981',
          cyan: '#06B6D4',
          violet: '#8B5CF6',
          rose: '#F43F5E',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};
