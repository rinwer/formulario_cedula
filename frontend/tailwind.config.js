/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Colores corporativos de Temwok (navy #103255 como color primario
        // de la app). Se mantiene el nombre "cobre" para no tener que
        // renombrar clases en cada componente; el 600 es el navy exacto de
        // la guia de marca.
        cobre: {
          50: "#F3F7FC",
          100: "#E2EDF8",
          200: "#C1D8F0",
          300: "#8CB7E4",
          400: "#3E8BDB",
          500: "#1F60A3",
          600: "#103255",
          700: "#0D2743",
          800: "#091D31",
          900: "#061422",
          950: "#040B13",
        },
        // Rojo de acento de la marca, para impacto/CTA puntual (no se usa
        // para errores: esos siguen con el rojo semantico de Tailwind).
        temwokRojo: "#E30535",
        // Azul cielo de la marca, para contraste/fondos secundarios.
        temwokCielo: "#AFDFF7",
      },
    },
  },
  plugins: [],
};
