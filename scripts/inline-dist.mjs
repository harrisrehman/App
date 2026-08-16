import { readFileSync, writeFileSync } from "node:fs";

let html = readFileSync("dist/index.html", "utf8");
html = html
  .replace(
    /<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/,
    (_m, file) => `<script>${readFileSync(`dist/assets/${file}`, "utf8")}</script>`,
  )
  .replace(
    /<script type="module" src="\.\/assets\/([^"]+)"><\/script>/,
    (_m, file) => `<script>${readFileSync(`dist/assets/${file}`, "utf8")}</script>`,
  )
  .replace(
    /<script src="\.\/assets\/([^"]+)"><\/script>/,
    (_m, file) => `<script>${readFileSync(`dist/assets/${file}`, "utf8")}</script>`,
  )
  .replace(
    /<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/,
    (_m, file) => `<style>${readFileSync(`dist/assets/${file}`, "utf8")}</style>`,
  )
  .replace(
    /<link rel="stylesheet" href="\.\/assets\/([^"]+)">/,
    (_m, file) => `<style>${readFileSync(`dist/assets/${file}`, "utf8")}</style>`,
  );

const scripts = [];
html = html.replace(/<script>[\s\S]*?<\/script>/g, (block) => {
  scripts.push(block);
  return "";
});
if (scripts.length && html.includes("</body>")) {
  html = html.replace("</body>", `${scripts.join("\n")}\n  </body>`);
}

writeFileSync("dist/annex.html", html);
writeFileSync("dist/index.html", html);
console.log(`wrote dist/annex.html and dist/index.html (${html.length} bytes)`);
