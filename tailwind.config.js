/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./client/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563EB",
        bgWhite: "#FFFFFF",
        lightGray: "#F1F5F9",
        availableGreen: "#22C55E",
        occupiedRed: "#EF4444",
        darkNavy: "#0F172A",
        laserCyan: "#06B6D4",
        laserEmerald: "#10B981",
        laserViolet: "#8B5CF6",
        laserAmber: "#F59E0B",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'laser-blue': '0 0 15px rgba(37, 99, 235, 0.6), 0 0 30px rgba(37, 99, 235, 0.3)',
        'laser-green': '0 0 15px rgba(34, 197, 94, 0.6), 0 0 30px rgba(34, 197, 94, 0.3)',
        'laser-red': '0 0 15px rgba(239, 68, 68, 0.6), 0 0 30px rgba(239, 68, 68, 0.3)',
        'laser-cyan': '0 0 15px rgba(6, 182, 212, 0.6), 0 0 30px rgba(6, 182, 212, 0.3)',
        'card-soft': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'beam': 'beam 2s ease-in-out infinite',
      },
      keyframes: {
        beam: {
          '0%, 100%': { opacity: '0.4', filter: 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.4))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 20px rgba(37, 99, 235, 0.9))' },
        }
      }
    },
  },
  plugins: [],
}
