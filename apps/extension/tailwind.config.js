/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand colors matching web app
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Sync status colors
        sync: {
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          pending: '#6366f1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Extension popup dimensions
      width: {
        popup: '360px',
      },
      height: {
        popup: '480px',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-sync': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
