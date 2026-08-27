/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Acento cobre de la identidad "Grafito y cobre": reemplaza al
        // azul generico en botones, enlaces, pestana activa y focus
        // rings, sobre un fondo grafito (zinc) en toda la app.
        cobre: {
          50: "#FDF6F0",
          100: "#F7E4D2",
          200: "#EFCBA8",
          300: "#E4A874",
          400: "#D0813F",
          500: "#BD6B2E",
          600: "#B5602A",
          700: "#954E20",
          800: "#7A3F1B",
          900: "#603116",
          950: "#3D1E0D",
        },
      },
    },
  },
  plugins: [],
};
