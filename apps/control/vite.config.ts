import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const SERVER = process.env.MAHO_SERVER_ORIGIN ?? "http://localhost:3000";

export default defineConfig({
  plugins: [vue()],
  base: "/control/",
  build: {
    outDir: "../server/public/control",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/ws": {
        target: SERVER,
        ws: true,
      },
      "/dev": {
        target: SERVER,
        changeOrigin: true,
      },
      "/health": {
        target: SERVER,
        changeOrigin: true,
      },
    },
  },
});