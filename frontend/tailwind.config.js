/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#f4efe6",
          ink: "#1f1a16",
          card: "#fffdf8",
          accent: "#8b1e3f",
          print: "#0f7a3a",
        },
      },
    },
  },
  plugins: [],
};
