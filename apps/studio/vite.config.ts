import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

const SERVER = process.env.MAHO_SERVER_ORIGIN ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
  ],
  base: "/",
  build: {
    outDir: "../server/public/studio",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/ws": { target: SERVER, ws: true },
      "/dev": { target: SERVER, changeOrigin: true },
      "/health": { target: SERVER, changeOrigin: true },
    },
  },
});