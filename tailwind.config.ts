import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef9ff',
          100: '#d7f1ff',
          200: '#b0e5ff',
          300: '#7cd4ff',
          400: '#45beff',
          500: '#16a3ff',
          600: '#0f7fdb',
          700: '#0f65ad',
          800: '#114f86',
          900: '#113f69'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0,0,0,0.08)',
        glow: '0 0 20px rgba(22,163,255,0.6)'
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-in forwards',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'slide-in-left': 'slideInLeft 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
}

export default config

