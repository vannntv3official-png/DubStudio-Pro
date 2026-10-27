/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#111318',
          subbg: '#1B1E26',
          panel: '#20242E',
          surface: '#2A303D',
          hover: '#343B4A',
          border: '#2E3543',
          accent: '#3B82F6',
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          text: '#F8FAFC',
          muted: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        khmer: ['"Kantumruy Pro"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
