import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const parts = pkg.version.split(".").map((n) => Number(n) || 0);
const versionCode = parts[0] * 1_000_000 + parts[1] * 10_000 + (parts[2] ?? 0);
const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${pkg.version}"`);
writeFileSync(gradlePath, gradle);
console.log(`synced android versionCode ${versionCode} versionName ${pkg.version}`);
