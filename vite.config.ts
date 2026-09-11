import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Camera access needs a secure context. localhost counts, but to test on a
    // phone run `npm run dev -- --host` and tunnel it over HTTPS.
    host: true,
  },
})
