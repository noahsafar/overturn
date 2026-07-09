import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Inter first (self-hosted via next/font, exposed as a CSS var) so it
        // actually wins; previously -apple-system was listed first and Inter
        // never rendered on macOS.
        sans: [
          "var(--font-inter)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        // Editorial serif for marketing surfaces (landing hero) only.
        display: ["var(--font-display)", "Georgia", "Times New Roman", "serif"],
        mono: ["SF Mono", "JetBrains Mono", "Monaco", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        xs: ["11px", { lineHeight: "16px", letterSpacing: "-0.01em" }],
        sm: ["12px", { lineHeight: "16px", letterSpacing: "-0.01em" }],
        base: ["14px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
        lg: ["16px", { lineHeight: "24px", letterSpacing: "-0.005em" }],
        xl: ["18px", { lineHeight: "28px", letterSpacing: "-0.005em" }],
        "2xl": ["20px", { lineHeight: "28px", letterSpacing: "0em" }],
        "3xl": ["24px", { lineHeight: "32px", letterSpacing: "0em" }],
        "4xl": ["30px", { lineHeight: "36px", letterSpacing: "0em" }],
        "5xl": ["36px", { lineHeight: "40px", letterSpacing: "0em" }],
      },
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        // Neutral ramp tinted toward the brand ink (#0B1F3A from the logo)
        // so headings, buttons, and borders all sit in the same navy family
        // instead of generic cool gray.
        gray: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e3e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e2c44",
          850: "#16253d",
          900: "#0b1f3a",
          950: "#061224",
        },
        success: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 500: "#059669", 600: "#047857", 700: "#065f46" },
        warning: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 500: "#d97706", 600: "#b45309", 700: "#92400e" },
        error: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 500: "#dc2626", 600: "#b91c1c", 700: "#991b1b" },
        ai: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 500: "#22c55e", 600: "#16a34a" },
        brand: { 50: "#f0f9ff", 600: "#0284c7", 700: "#0369a1", 900: "#0b1f3a" },
        // The emerald half of the logo mark — reserved for recovery/money
        // moments so it keeps its punch.
        accent: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        // Navy-tinted so elevation reads as depth, not dirt.
        soft: "0 1px 2px 0 rgb(11 31 58 / 0.05), 0 1px 3px -1px rgb(11 31 58 / 0.05)",
        card: "0 1px 2px rgb(11 31 58 / 0.04), 0 2px 8px -2px rgb(11 31 58 / 0.06)",
        elevated:
          "0 2px 4px rgb(11 31 58 / 0.05), 0 12px 32px -8px rgb(11 31 58 / 0.14)",
      },
    },
  },
  plugins: [],
} satisfies Config;
