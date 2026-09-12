import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src'),
        },
    },

    server: {
        proxy: {
            "/api": {
                target: "https://u7lpt81uee.onrender.com",
                // target: "http://127.0.0.1:8000", // 로컬 FastAPI
                // target: "https://b9jrg8s8by.onrender.com", // 배포 백엔드(원격)
                changeOrigin: true,
                secure: false,
            },
        },
    },
})