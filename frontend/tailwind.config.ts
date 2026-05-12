import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0066cc",
        "primary-focus": "#0071e3",
        "primary-on-dark": "#2997ff",
        ink: "#1d1d1f",
        "ink-muted-80": "#333333",
        "ink-muted-48": "#7a7a7a",
        canvas: "#ffffff",
        parchment: "#f5f5f7",
        pearl: "#fafafc",
        hairline: "#e0e0e0",
        "divider-soft": "#f0f0f0",
        "surface-black": "#000000",
        "tile-dark": "#272729",
      },
      fontFamily: {
        display: ["SF Pro Display", "system-ui", "sans-serif"],
        text: ["SF Pro Text", "system-ui", "sans-serif"],
      },
      fontSize: {
        "hero": ["56px", { lineHeight: "1.07", letterSpacing: "-0.28px", fontWeight: "600" }],
        "display-lg": ["40px", { lineHeight: "1.10", letterSpacing: "0px", fontWeight: "600" }],
        "display-md": ["34px", { lineHeight: "1.47", letterSpacing: "-0.374px", fontWeight: "600" }],
        "lead": ["28px", { lineHeight: "1.14", letterSpacing: "0.196px", fontWeight: "400" }],
        "tagline": ["21px", { lineHeight: "1.19", letterSpacing: "0.231px", fontWeight: "600" }],
        "body-strong": ["17px", { lineHeight: "1.24", letterSpacing: "-0.374px", fontWeight: "600" }],
        "body": ["17px", { lineHeight: "1.47", letterSpacing: "-0.374px", fontWeight: "400" }],
        "caption": ["14px", { lineHeight: "1.43", letterSpacing: "-0.224px", fontWeight: "400" }],
        "caption-strong": ["14px", { lineHeight: "1.29", letterSpacing: "-0.224px", fontWeight: "600" }],
        "btn-large": ["18px", { lineHeight: "1.0", letterSpacing: "0px", fontWeight: "300" }],
        "btn-utility": ["14px", { lineHeight: "1.29", letterSpacing: "-0.224px", fontWeight: "400" }],
        "fine-print": ["12px", { lineHeight: "1.0", letterSpacing: "-0.12px", fontWeight: "400" }],
        "nav-link": ["12px", { lineHeight: "1.0", letterSpacing: "-0.12px", fontWeight: "400" }],
      },
      borderRadius: {
        xs: "5px",
        sm: "8px",
        md: "11px",
        lg: "18px",
        pill: "9999px",
      },
      spacing: {
        xxs: "4px",
        xs: "8px",
        sm: "12px",
        md: "17px",
        lg: "24px",
        xl: "32px",
        xxl: "48px",
        section: "80px",
      },
    },
  },
  plugins: [],
};
export default config;
