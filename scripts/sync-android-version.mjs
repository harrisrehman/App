import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const parts = pkg.version.split(".").map((n) => Number(n) || 0);
const versionCode = parts[0] * 1_000_000 + parts[1] * 10_000 + (parts[2] ?? 0);
const displayVersion = pkg.version.replace(/^0\./, "");
const appLabel = `Annex ${displayVersion}`;

const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${pkg.version}"`);
writeFileSync(gradlePath, gradle);

const stringsPath = "android/app/src/main/res/values/strings.xml";
let strings = readFileSync(stringsPath, "utf8");
strings = strings.replace(
  /<string name="app_name">[^<]*<\/string>/,
  `<string name="app_name">${appLabel}</string>`,
);
strings = strings.replace(
  /<string name="title_activity_main">[^<]*<\/string>/,
  `<string name="title_activity_main">${appLabel}</string>`,
);
writeFileSync(stringsPath, strings);

console.log(`synced android versionCode ${versionCode} versionName ${pkg.version} label "${appLabel}"`);
