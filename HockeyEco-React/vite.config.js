import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Это позволит тебе открывать сайт не только по localhost, 
    // но и по IP твоего компьютера в локальной сети
    host: true, 
    port: 5173,
  },
})