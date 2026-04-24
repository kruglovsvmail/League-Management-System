/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
     colors: {
        orange: 'rgb(var(--orange) / <alpha-value>)',
        'orange-hover': 'rgb(var(--orange-hover) / <alpha-value>)',
        graphite: 'rgb(var(--graphite) / <alpha-value>)',
        'graphite-light': 'rgb(var(--graphite-light) / <alpha-value>)',
        'graphite-dark': 'rgb(var(--graphite-dark) / <alpha-value>)',
        'gray-light': 'rgb(var(--gray-light) / <alpha-value>)',
        'gray-bg-light': 'rgb(var(--gray-bg-light) / <alpha-value>)',
        'status-pending': 'rgb(var(--status-pending) / <alpha-value>)',
        'status-accepted': 'rgb(var(--status-accepted) / <alpha-value>)',
        'status-rejected': 'rgb(var(--status-rejected) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        xxl: 'var(--radius-xxl)',
        pill: 'var(--radius-pill)',
        circle: 'var(--radius-circle)',
      },
      keyframes: {
        'zoom-in': {
          '0%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(120%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out': {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(120%)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        }
      },
      animation: {
        'zoom-in': 'zoom-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-in': 'slide-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-out': 'slide-out 0.3s forwards',
        shimmer: 'shimmer 1.5s infinite linear',
      }
    },
  },
  plugins: [],
}