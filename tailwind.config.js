/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "Avenir Next", "Segoe UI", "sans-serif"],
        heading: ['"Source Serif Pro"', "Georgia", "serif"],
        title: ['"Bebas Neue"', "Impact", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
      },
      maxWidth: {
        page: "1814px",
      },
    },
  },
  plugins: [],
};
