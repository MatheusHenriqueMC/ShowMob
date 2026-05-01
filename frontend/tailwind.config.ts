import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ["var(--font-orbitron)", "monospace"],
        rajdhani: ["var(--font-rajdhani)", "sans-serif"],
      },
      colors: {
        accent: "#FF4500",
        accent2: "#FF8C00",
        danger: "#ff3355",
        gold: "#FFD700",
        green: "#00cc66",
      },
    },
  },
  plugins: [],
};

export default config;
