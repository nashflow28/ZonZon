/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        zz: {
          bg: 'var(--zz-bg)',
          surface: 'var(--zz-surface)',
          accent: {
            from: 'var(--zz-accent-from)',
            to: 'var(--zz-accent-to)',
          },
          text: 'var(--zz-text)',
          muted: 'var(--zz-text-muted)',
        },
        // Direction A — couleurs de marque nommées, réutilisables (ex: bg-zbg,
        // text-go, border-zline…). Ajoutées SANS écraser le ramp `slate`
        // existant, pour rester conservateur et ne rien casser ailleurs.
        zbg: 'var(--zz-bg)',
        zcard: 'var(--zz-card)',
        zline: 'var(--zz-line)',
        go: 'var(--zz-go)',
        mango: 'var(--zz-mango)',
        zsky: 'var(--zz-sky)',
        coral: 'var(--zz-coral)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'zz-lg': '0 25px 50px -12px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
};
