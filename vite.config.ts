import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/game.js",
      },
    },
  },
  plugins: [
    {
      name: "classic-script",
      transformIndexHtml(html) {
        return html
          .replaceAll(`type="module" crossorigin `, "")
          .replaceAll(`type="module" `, "")
          .replaceAll(" crossorigin", "");
      },
    },
  ],
});
