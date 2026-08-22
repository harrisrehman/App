import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { apkDownloadUrl, apkFileName, readPkgVersion } from "./apk-artifact.mjs";

const versionStr = readPkgVersion();
const tag = `v${versionStr}`;
const apkUrl = apkDownloadUrl(versionStr, "release");
const latestApkUrl = apkDownloadUrl(versionStr, "latest");
const version = {
  name: "FATH",
  version: versionStr,
  build: Date.now(),
  apkUrl,
  apkFile: apkFileName(versionStr),
};

mkdirSync("public", { recursive: true });
writeFileSync("public/version.json", `${JSON.stringify(version, null, 2)}\n`);

const srcPath = "src/version.ts";
const src = readFileSync(srcPath, "utf8").replace(
  /export const APP_VERSION: AppVersion = \{[\s\S]*?\};/,
  `export const APP_VERSION: AppVersion = {\n  name: "FATH",\n  version: "${version.version}",\n  build: ${version.build},\n  apkUrl: "${apkUrl}",\n};`,
);
writeFileSync(srcPath, src);

const configPath = "src/game/config.ts";
let config = readFileSync(configPath, "utf8");
config = config.replace(
  /export const LATEST_APK_URL =\n  "[^"]+";/,
  `export const LATEST_APK_URL =\n  "${latestApkUrl}";`,
);
writeFileSync(configPath, config);

console.log(`wrote version ${version.version} build ${version.build} (${version.apkFile})`);
