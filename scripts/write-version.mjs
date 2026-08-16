import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = {
  name: "Annex",
  version: pkg.version,
  build: Date.now(),
};

mkdirSync("public", { recursive: true });
writeFileSync("public/version.json", `${JSON.stringify(version, null, 2)}\n`);

const srcPath = "src/version.ts";
const src = readFileSync(srcPath, "utf8").replace(
  /export const APP_VERSION: AppVersion = \{[\s\S]*?\};/,
  `export const APP_VERSION: AppVersion = {\n  name: "Annex",\n  version: "${version.version}",\n  build: ${version.build},\n};`,
);
writeFileSync(srcPath, src);
console.log(`wrote version ${version.version} build ${version.build}`);
