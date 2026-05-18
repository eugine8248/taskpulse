/** @type {import('tailwindcss').Config} */
// taskpulse — design tokens ported from framedeck.
// Strategy: all colors resolve to CSS variables driven by [data-theme] on <html>.
// We keep legacy taskpulse names (textMuted, textFaint, elevated, danger, …) as
// aliases pointing to the same variables so existing `dark:*-dark` classes still
// resolve (they become no-ops because the var is theme-aware via CSS).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Keep `darkMode: 'class'` so existing `dark:` variants compile. We also set
  // `[data-theme="dark"]` on <html> to drive the CSS variables; both
  // mechanisms point to the same theme via the .dark / [data-theme="dark"]
  // pair in styles.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Canonical framedeck names
        bg: 'var(--c-bg)',
        surface: 'var(--c-surface)',
        'surface-muted': 'var(--c-surface-muted)',
        'border-soft': 'var(--c-border-soft)',
        border: 'var(--c-border)',
        text: 'var(--c-text)',
        'text-2': 'var(--c-text-2)',
        'text-muted': 'var(--c-text-muted)',
        accent: 'var(--c-accent)',
        'accent-hover': 'var(--c-accent-hover)',
        'accent-soft': 'var(--c-accent-soft)',
        'accent-soft-2': 'var(--c-accent-soft-2)',
        success: 'var(--c-success)',
        warning: 'var(--c-warning)',
        error: 'var(--c-error)',

        // Legacy taskpulse names — preserved as aliases so existing
        // dark:bg-bg-dark / dark:text-textMuted-dark etc. continue compiling
        // and resolve to the theme-aware CSS var.
        elevated: 'var(--c-surface-muted)',
        borderSoft: 'var(--c-border-soft)',
        textMuted: 'var(--c-text-2)',
        textFaint: 'var(--c-text-muted)',
        accentHover: 'var(--c-accent-hover)',
        // v2.1 — camelCase aliases for the remaining dash-form tokens that
        // Tailwind 3's @apply parser chokes on when prefixed with a variant
        // (e.g. `hover:bg-surface-muted` fails — `hover:bg-surfaceMuted` works).
        // The bare dash-form classes still work for inline className usage.
        surfaceMuted: 'var(--c-surface-muted)',
        accentSoft: 'var(--c-accent-soft)',
        accentSoft2: 'var(--c-accent-soft-2)',
        text2: 'var(--c-text-2)',
        danger: 'var(--c-error)',

        // Dark-suffix aliases — point to the same vars; with data-theme
        // driving them, the `dark:*-dark` classes become harmless no-ops
        // that still render the correct color in the active theme.
        'bg-dark': 'var(--c-bg)',
        'surface-dark': 'var(--c-surface)',
        'elevated-dark': 'var(--c-surface-muted)',
        'border-dark': 'var(--c-border)',
        'borderSoft-dark': 'var(--c-border-soft)',
        'text-dark': 'var(--c-text)',
        'textMuted-dark': 'var(--c-text-2)',
        'textFaint-dark': 'var(--c-text-muted)',

        // Stock/finance hues (used by TodayPane / FindingsChart). Mapped to
        // semantic tokens so they pick up theme automatically.
        up: 'var(--c-success)',
        down: 'var(--c-error)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '6px', md: '8px', lg: '12px', xl: '16px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(40, 35, 29, 0.04)',
        sm: '0 1px 2px rgba(40, 35, 29, 0.06), 0 1px 3px rgba(40, 35, 29, 0.04)',
        md: '0 4px 12px rgba(40, 35, 29, 0.06), 0 1px 3px rgba(40, 35, 29, 0.04)',
        lg: '0 12px 32px rgba(40, 35, 29, 0.10), 0 2px 6px rgba(40, 35, 29, 0.05)',
      },
    },
  },
  plugins: [],
};
