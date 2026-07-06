import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        si: {
          bg:"#020617", panel:"#0f172a", border:"#1e293b",
          cyan:"#22d3ee", emerald:"#34d399", violet:"#a78bfa",
          rose:"#fb7185", amber:"#fbbf24",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono","Fira Code","monospace"],
        sans: ["Inter","system-ui","sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "scan": "scan 4s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: { "0%":{ boxShadow:"0 0 5px rgba(34,211,238,0.2)" }, "100%":{ boxShadow:"0 0 25px rgba(34,211,238,0.6),0 0 60px rgba(34,211,238,0.2)" } },
        scan: { "0%":{ transform:"translateY(-100%)" }, "100%":{ transform:"translateY(100%)" } },
        float: { "0%,100%":{ transform:"translateY(0)" }, "50%":{ transform:"translateY(-10px)" } },
      },
    },
  },
  plugins: [],
};
export default config;
