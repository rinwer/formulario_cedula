/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Acento de la identidad "Claro neutro": un taupe/cobre atenuado
        // (no el cobre vivo original) sobre un fondo claro en toda la
        // app. Se mantiene el nombre "cobre" para no tener que renombrar
        // clases en cada componente.
        cobre: {
          50: "#FAF7F4",
          100: "#F1EAE3",
          200: "#E1D2C4",
          300: "#CDB29C",
          400: "#B08F72",
          500: "#9C7A5F",
          600: "#8C6E58",
          700: "#755A47",
          800: "#5F4838",
          900: "#4A382C",
          950: "#2E231B",
        },
      },
    },
  },
  plugins: [],
};
