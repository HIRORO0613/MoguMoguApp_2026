/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ANA ブランドカラー
        mogu: {
          50:  '#e8eef9',
          100: '#c3d0f0',
          200: '#9ab2e6',
          300: '#7193dc',
          400: '#4875d2',
          500: '#233F9A',   // ANA Deep Blue (primary)
          600: '#1c3380',
          700: '#152666',
        },
        'ana-sky': {
          50:  '#e0f7fe',
          100: '#b3ecfb',
          400: '#26c5f4',
          500: '#00B5F0',   // ANA Sky Blue (accent)
          600: '#0099cc',
        },
      },
      fontFamily: {
        sans: ['Noto Sans JP', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
