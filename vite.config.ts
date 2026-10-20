import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O padrão continua "/" para o servidor local. O workflow do GitHub Pages
  // define VITE_BASE="./" para funcionar em /NOME-DO-REPOSITORIO/.
  base: process.env.VITE_BASE ?? "/",
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: false },
      "/ws": { target: "ws://localhost:8787", ws: true, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
