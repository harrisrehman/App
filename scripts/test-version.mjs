import { readFileSync, statSync } from "node:fs";

function cmpVer(a, b) {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function isNewer(a, b) {
  const v = cmpVer(a.version, b.version);
  if (v !== 0) return v > 0;
  return a.build > b.build;
}

function shouldRestore(saved, bundled) {
  return isNewer(saved, bundled);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const bundled = { version: "0.4.4", build: 10 };
const savedNewer = { version: "0.4.5", build: 20 };
const savedSame = { version: "0.4.4", build: 10 };
const savedOlder = { version: "0.3.1", build: 1 };
const savedSameVerNewerBuild = { version: "0.4.4", build: 11 };

assert(shouldRestore(savedNewer, bundled), "restore newer semver");
assert(shouldRestore(savedSameVerNewerBuild, bundled), "restore newer build");
assert(!shouldRestore(savedSame, bundled), "skip same version");
assert(!shouldRestore(savedOlder, bundled), "never restore older");
assert(!isNewer(savedOlder, bundled), "older is not newer");
assert(isNewer(bundled, savedOlder), "bundled beats 0.3.1");

const theme = statSync("src/assets/theme.ogg");
assert(theme.size > 10000, "theme audio missing");
const magic = readFileSync("src/assets/theme.ogg").subarray(0, 4).toString("ascii");
assert(magic === "OggS", "theme is not ogg");
const city = statSync("public/menu/city.jpg");
assert(city.size > 10000, "menu city missing");
const css = readFileSync("src/style.css", "utf8");
assert(css.includes(".menu-frame"), "menu frame missing");
assert(css.includes("--gold:"), "gold theme missing");
assert(css.includes("/menu/city.jpg"), "menu city missing");
assert(css.includes("max-width: 32px !important"), "filter width missing");
assert(css.includes("button[data-filter=\"troop\"]::before"), "soldier circle missing");
assert(css.includes("display: block"), "soldier circle display missing");
assert(css.includes("bottom: 0"), "filters not bottom aligned");

console.log("version tests passed");
