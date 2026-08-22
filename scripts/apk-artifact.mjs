import { readFileSync } from "node:fs";

export function readPkgVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

export function apkDisplayVersion(version = readPkgVersion()) {
  return version.replace(/^0\./, "");
}

export function apkFileName(version = readPkgVersion()) {
  return `annex-${apkDisplayVersion(version)}.apk`;
}

export function apkDownloadUrl(version = readPkgVersion(), channel = "release") {
  const file = apkFileName(version);
  if (channel === "latest") {
    return `https://github.com/harrisrehman/App/releases/download/latest/${file}`;
  }
  return `https://github.com/harrisrehman/App/releases/download/v${version}/${file}`;
}
