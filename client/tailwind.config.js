/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light defaults; dark via `dark:` variants
        bg: '#f7f8fa',
        surface: '#ffffff',
        elevated: '#eef0f4',
        border: '#dde1e8',
        borderSoft: '#e6e9ef',
        text: '#1a1f29',
        textMuted: '#5e6877',
        textFaint: '#8b95a5',
        accent: '#5b8def',
        accentHover: '#6d9bf7',
        warning: '#e8a86a',
        danger: '#f0716a',
        success: '#5fcf95',
        // Dark variants
        'bg-dark': '#0e1116',
        'surface-dark': '#161a21',
        'elevated-dark': '#1d222b',
        'border-dark': '#262c36',
        'borderSoft-dark': '#1f242d',
        'text-dark': '#e6e9ef',
        'textMuted-dark': '#8b95a5',
        'textFaint-dark': '#5a6374',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
