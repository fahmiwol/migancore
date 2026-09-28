import type { Config } from "tailwindcss";

// Design tokens lifted from Fahmi's UI handoff (2026-06-14).
// See docs/jarvis/03_UI_TECH_SPEC.md and PRIMBON_LEXICON.md.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        glow: "#00E6FF",        // primary glow / CTA
        accent: "#00B7FF",       // secondary / accents
        interactive: "#008CFF",  // interactive states
        data: "#0056CC",         // data / graphs
        panel: "#0A1F33",        // surface — panels
        elevated: "#07121E",     // surface — elevated
        bg: "#03111A",           // background
      },
      borderRadius: { card: "16px", btn: "12px", input: "16px", pill: "999px" },
      boxShadow: {
        card: "0 0 1px rgba(0,230,255,.08), 0 8px 32px rgba(0,230,255,.06)",
        glow: "0 0 12px rgba(0,230,255,.6), 0 0 24px rgba(0,230,255,.35)",
      },
      fontFamily: { display: ["var(--font-orbitron)", "sans-serif"], body: ["var(--font-inter)", "sans-serif"] },
      spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px", 16: "64px", 24: "96px" },
      maxWidth: { content: "1728px" },
    },
  },
  plugins: [],
};
export default config;
