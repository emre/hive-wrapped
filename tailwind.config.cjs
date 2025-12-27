/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hive: {
          red: '#E31337',
          black: '#212529',
          grey: '#e7e7f1',
          'light-grey': '#f0f0f8',
        },
      },
    },
  },
  plugins: [],
};
