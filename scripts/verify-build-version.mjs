import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const dist = JSON.parse(readFileSync("dist/version.json", "utf8")).version;
if (pkg !== dist) {
  console.error(`dist/version.json is ${dist}, expected ${pkg}`);
  process.exit(1);
}

const js = readFileSync("dist/assets/game.js", "utf8");
if (!js.includes(`version:\\"${pkg}\\"`) && !js.includes(`version:"${pkg}"`) && !js.includes(pkg)) {
  console.error(`game.js bundle missing version ${pkg}`);
  process.exit(1);
}

const gradle = readFileSync("android/app/build.gradle", "utf8");
if (!gradle.includes(`def annexVersionName = "${pkg}"`)) {
  console.error(`android/app/build.gradle missing annexVersionName ${pkg}`);
  process.exit(1);
}

const displayVersion = pkg.replace(/^0\./, "");
const appLabel = `Annex ${displayVersion}`;
const cap = JSON.parse(readFileSync("capacitor.config.json", "utf8"));
if (cap.appName !== appLabel) {
  console.error(`capacitor.config.json appName should be "${appLabel}"`);
  process.exit(1);
}

console.log(`verified build ${pkg} (${appLabel})`);
