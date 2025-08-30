import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {defineConfig} from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      // Remove Node.js externalization since we're using inMemoryStore() for browser compatibility
    }
  },
  optimizeDeps: {
    // Allow oauth-callback to be optimized now that we're using browser-compatible inMemoryStore
  }
})