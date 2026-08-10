import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to the design tokens, not the other way around: every value
 * below resolves to a CSS variable declared in `@music-rpg/ui/tokens.css`.
 * Components never hardcode a hex value or a pixel size.
 */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    screens: {
      sm: "480px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          raised: "var(--surface-raised)",
          inset: "var(--surface-inset)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          subtle: "var(--ink-subtle)",
          inverse: "var(--ink-inverse)",
        },
        line: {
          subtle: "var(--line-subtle)",
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        // Channel-based so `/opacity` modifiers resolve; see tokens.css.
        ember: {
          DEFAULT: "rgb(var(--ember-rgb) / <alpha-value>)",
          soft: "var(--ember-soft)",
          line: "var(--ember-line)",
        },
        fame: "rgb(var(--fame-rgb) / <alpha-value>)",
        respect: "rgb(var(--respect-rgb) / <alpha-value>)",
        heat: "rgb(var(--heat-rgb) / <alpha-value>)",
        legacy: "rgb(var(--legacy-rgb) / <alpha-value>)",
        positive: "rgb(var(--positive-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "2xs": ["var(--text-2xs)", { lineHeight: "var(--leading-normal)" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-normal)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--leading-normal)" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-normal)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--leading-snug)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--leading-snug)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-tight)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-tight)" }],
        "4xl": ["var(--text-4xl)", { lineHeight: "var(--leading-tight)" }],
        "5xl": ["var(--text-5xl)", { lineHeight: "var(--leading-tight)" }],
      },
      letterSpacing: {
        display: "var(--tracking-display)",
        label: "var(--tracking-label)",
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)",
        20: "var(--space-20)",
        gutter: "var(--gutter)",
        nav: "var(--nav-width)",
        context: "var(--context-width)",
        player: "var(--player-height)",
        "mobile-nav": "var(--mobile-nav-height)",
        "mobile-player": "var(--mobile-player-height)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        low: "var(--shadow-low)",
        mid: "var(--shadow-mid)",
        high: "var(--shadow-high)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        pulse: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        "rise-in": "rise-in var(--motion-slow) var(--ease-out) both",
        "fade-in": "fade-in var(--motion-base) var(--ease-out) both",
        pulse: "pulse 1.6s var(--ease-in-out) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
