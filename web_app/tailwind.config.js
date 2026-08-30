/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm chart-paper ground. Not a dashboard black, not a pure white lab.
        paper: '#F5F4EF',
        // "care" — the clinical teal the whole product is keyed to.
        care: {
          50:'#EAF5F2',100:'#CFE9E2',200:'#A3D6CA',300:'#6FBDAD',400:'#3D9F8E',
          500:'#1F8375',600:'#166B60',700:'#12564E',800:'#0F443E',900:'#0B302C',
        },
        // "vital" — the red of a crash cart. Reserved for real risk.
        vital: {
          50:'#FDF1F1',100:'#FADEDE',200:'#F3BCBC',300:'#E89191',400:'#D96565',
          500:'#C4353A',600:'#A72830',700:'#8A1F27',800:'#6E1A20',900:'#521319',
        },
        // Warm greenish slate for text and rules — softer than Tailwind slate.
        ink: {
          50:'#F7F8F7',100:'#EEF1F0',200:'#DFE4E3',300:'#C5CDCB',400:'#96A19E',
          500:'#6C7876',600:'#4E5A58',700:'#3A4543',800:'#26302E',900:'#141C1B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        clinical: '0 1px 2px rgba(16,32,29,.05), 0 10px 30px -18px rgba(16,32,29,.28)',
        'clinical-lg': '0 2px 4px rgba(16,32,29,.05), 0 22px 48px -26px rgba(16,32,29,.35)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.7)',
      },
      animation: {
        'fade-in': 'fadeIn .5s ease-out both',
        'slide-up': 'slideUp .55s cubic-bezier(.2,.7,.3,1) both',
        // Background motion. All of it is decorative and all of it is disabled
        // under prefers-reduced-motion (see index.css).
        'ecg': 'ecg 7s linear infinite',
        'ecg-slow': 'ecg 11s linear infinite',
        'drift': 'drift 60s linear infinite',
        'float-slow': 'floatY 17s ease-in-out infinite',
        'float-slower': 'floatY 26s ease-in-out infinite',
        'vitals': 'vitals 2.4s cubic-bezier(.4,0,.2,1) infinite',
        'ring': 'ring 4s cubic-bezier(.2,.6,.3,1) infinite',
        'sweep': 'sweep 3.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // The trace draws itself left to right, then the whole path fades and
        // restarts — a monitor sweep, not a loading spinner.
        ecg: {
          '0%':   { strokeDashoffset: '2400', opacity: '0' },
          '6%':   { opacity: '1' },
          '82%':  { opacity: '1' },
          '100%': { strokeDashoffset: '0', opacity: '0' },
        },
        drift: { '0%': { backgroundPosition: '0 0' }, '100%': { backgroundPosition: '480px 480px' } },
        floatY: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%':     { transform: 'translateY(-26px) rotate(4deg)' },
        },
        vitals: {
          '0%,100%': { transform: 'scale(1)', opacity: '1' },
          '14%':     { transform: 'scale(1.28)', opacity: '.75' },
          '28%':     { transform: 'scale(1)', opacity: '1' },
          '42%':     { transform: 'scale(1.16)', opacity: '.85' },
        },
        ring: {
          '0%':   { transform: 'scale(.7)', opacity: '.5' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        sweep: {
          '0%':   { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(210%)' },
        },
      },
    },
  },
  plugins: [],
}
