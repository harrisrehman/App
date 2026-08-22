import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const parts = pkg.version.split(".").map((n) => Number(n) || 0);
const versionCode = parts[0] * 1_000_000 + parts[1] * 10_000 + (parts[2] ?? 0);
const displayVersion = pkg.version.replace(/^0\./, "");
const appLabel = `Annex ${displayVersion}`;

const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/def annexVersionName = "[^"]+"/, `def annexVersionName = "${pkg.version}"`);
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
writeFileSync(gradlePath, gradle);

const capPath = "capacitor.config.json";
const cap = JSON.parse(readFileSync(capPath, "utf8"));
cap.appName = appLabel;
writeFileSync(capPath, `${JSON.stringify(cap, null, 2)}\n`);

console.log(`synced android versionCode ${versionCode} versionName ${pkg.version} label "${appLabel}"`);
