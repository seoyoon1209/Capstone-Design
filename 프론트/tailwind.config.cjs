/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 커스텀 색상이 필요하면 여기에 추가하세요
      },
    },
  },
  plugins: [],
}
