/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'black': {
          DEFAULT: '#000000',
          'soft': '#0a0a0a',
          'light': '#141414',
        },
        'orange': {
          DEFAULT: '#FF6B2C',
          'bright': '#FF8C5A',
        },
        'atelier': {
          DEFAULT: '#fa4c14',
          'bright': '#ff7a3d',
          'dark': '#c93a0a',
          'glow': '#fa4c1433',
        },
        'gray': {
          'darker': '#1a1a1a',
          'dark': '#333333',
          'medium': '#404040',
          'light': '#6a6a6a',
          'lighter': '#b3b3b3',
        },
      },
      fontFamily: {
        'display': ['"Syne"', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        'sans': ['"Inter"', 'system-ui', 'sans-serif'],
        'mono': ['"IBM Plex Mono"', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      animation: {
        'glow-atelier': 'glowAtelier 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        'pulse-atelier': 'pulseAtelier 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        aurora: 'aurora 60s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowAtelier: {
          '0%': { boxShadow: '0 0 10px rgba(250, 76, 20, 0.2), 0 0 20px rgba(250, 76, 20, 0.1)' },
          '100%': { boxShadow: '0 0 20px rgba(250, 76, 20, 0.4), 0 0 40px rgba(250, 76, 20, 0.2)' },
        },
        pulseAtelier: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        aurora: {
          from: { backgroundPosition: '50% 50%, 50% 50%' },
          to: { backgroundPosition: '350% 50%, 350% 50%' },
        },
      },
      backgroundImage: {
        'gradient-atelier': 'linear-gradient(135deg, #fa4c14 0%, #ff7a3d 100%)',
        'gradient-dark': 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
      },
    },
  },
  plugins: [],
}
