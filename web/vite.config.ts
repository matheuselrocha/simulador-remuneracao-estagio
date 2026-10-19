import { resolve } from "node:path";
import { defineConfig } from "vite";

const raiz = import.meta.dirname;

export default defineConfig({
  root: raiz,
  // Caminhos relativos: o mesmo dist/ funciona na raiz do domínio ou num
  // subcaminho (GitHub Pages), sem variável de ambiente extra.
  base: "./",
  build: {
    outDir: resolve(raiz, "../dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        simulador: resolve(raiz, "index.html"),
        admin: resolve(raiz, "admin/index.html"),
      },
    },
  },
});
