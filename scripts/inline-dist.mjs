import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const inlined = html
  .replace(
    /<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/,
    (_m, file) => `<script type="module">${readFileSync(`dist/assets/${file}`, "utf8")}</script>`,
  )
  .replace(
    /<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/,
    (_m, file) => `<style>${readFileSync(`dist/assets/${file}`, "utf8")}</style>`,
  );

writeFileSync("dist/annex.html", inlined);
console.log(`wrote dist/annex.html (${inlined.length} bytes)`);
