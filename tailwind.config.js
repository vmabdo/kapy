/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ── Colors ──────────────────────────────────────────────
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ── Semantic status tokens ─────────────────────────
        success: {
          DEFAULT: "hsl(var(--success))",
          light: "hsl(var(--success-light))",
          border: "hsl(var(--success-border))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          light: "hsl(var(--warning-light))",
          border: "hsl(var(--warning-border))",
        },
        // ── Kapy Pharma Brand Scale ──────────────────────
        brand: {
          50:  "hsl(212, 100%, 97%)",
          100: "hsl(212, 96%, 92%)",
          200: "hsl(212, 90%, 83%)",
          300: "hsl(212, 86%, 72%)",
          400: "hsl(212, 82%, 58%)",
          500: "hsl(212, 82%, 46%)",
          600: "hsl(212, 82%, 38%)",
          700: "hsl(212, 82%, 30%)",
          800: "hsl(212, 80%, 22%)",
          900: "hsl(212, 76%, 16%)",
        },
        // ── Teal/Emerald accent scale ────────────────────
        teal: {
          50:  "hsl(172, 80%, 96%)",
          100: "hsl(172, 72%, 88%)",
          200: "hsl(172, 72%, 74%)",
          300: "hsl(172, 72%, 58%)",
          400: "hsl(172, 72%, 46%)",
          500: "hsl(172, 72%, 38%)",
          600: "hsl(172, 72%, 30%)",
          700: "hsl(172, 68%, 24%)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      // ── Border Radius ────────────────────────────────────
      borderRadius: {
        sm:   "calc(var(--radius) - 4px)",  /* 8px  */
        md:   "calc(var(--radius) - 2px)",  /* 10px */
        lg:   "var(--radius)",              /* 12px */
        xl:   "var(--radius-xl)",           /* 16px */
        "2xl": "var(--radius-2xl)",         /* 24px */
      },

      // ── Box Shadow ──────────────────────────────────────
      boxShadow: {
        "xs":           "var(--shadow-xs)",
        "sm":           "var(--shadow-sm)",
        "card":         "var(--shadow-card)",
        "card-hover":   "var(--shadow-card-hover)",
        "sidebar":      "var(--shadow-sidebar)",
        "primary":      "var(--shadow-primary)",
      },

      // ── Typography ──────────────────────────────────────
      fontFamily: {
        // Tajawal as the premium Arabic UI font
        tajawal: ["var(--font-tajawal)", "Segoe UI", "Tahoma", "Arial", "sans-serif"],
        // sans will default to tajawal for RTL contexts
        sans: ["var(--font-tajawal)", "ui-sans-serif", "system-ui", "sans-serif"],
        arabic: ["var(--font-tajawal)", "Segoe UI", "Tahoma", "Arial", "sans-serif"],
        // Monospace kept for invoice numbers / codes
        mono: ["ui-monospace", "Menlo", "Monaco", "Cascadia Code", "monospace"],
      },

      // ── Keyframes ───────────────────────────────────────
      keyframes: {
        // Shadcn accordions
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        // General fade-in for elements
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        // Slide in from right (RTL friendly)
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        // Slide up (modals, toasts)
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          to:   { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Shimmer skeleton
        "shimmer": {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
        // Pulse glow for primary elements
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(212 82% 46% / 0.4)" },
          "50%":       { boxShadow: "0 0 0 8px hsl(212 82% 46% / 0)" },
        },
        // Soft bounce for notification dots
        "bounce-soft": {
          "0%, 100%": { transform: "scale(1)" },
          "50%":       { transform: "scale(1.2)" },
        },
        // Scale in for modals
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
      },

      // ── Animation utilities ──────────────────────────────
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        "fade-in":         "fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right":  "slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up":        "slide-up 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
        "shimmer":         "shimmer 1.6s ease-in-out infinite",
        "pulse-glow":      "pulse-glow 2.2s ease-in-out infinite",
        "bounce-soft":     "bounce-soft 2s ease-in-out infinite",
        "scale-in":        "scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
