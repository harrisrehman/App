import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = {
  name: "Annex",
  version: pkg.version,
  build: Date.now(),
};

mkdirSync("public", { recursive: true });
writeFileSync("public/version.json", `${JSON.stringify(version, null, 2)}\n`);
console.log(`wrote version ${version.version} build ${version.build}`);
