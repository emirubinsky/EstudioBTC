import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        home: resolve(rootDir, "index.html"),
        contacto: resolve(rootDir, "contacto.html"),
        cursosInfo: resolve(rootDir, "cursos-info.html"),
        sobreMi: resolve(rootDir, "sobre-mi.html"),
        articulo01: resolve(rootDir, "articulos/01-que-es-bitcoin.html"),
        articulo02: resolve(rootDir, "articulos/02-por-que-necesitamos-bitcoin.html"),
        articulo03: resolve(rootDir, "articulos/03-comprar-vs-tener-bitcoin.html"),
        articulo04: resolve(rootDir, "articulos/04-que-es-una-billetera-bitcoin.html"),
        articulo05: resolve(rootDir, "articulos/05-alerta-estafa.html"),
        articulo06: resolve(rootDir, "articulos/06-protocolo-personal.html"),
      },
    },
  },
});
