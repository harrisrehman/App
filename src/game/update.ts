import { REMOTE_CANDIDATES } from "./config";
import { APP_VERSION, loadBundledVersion, type AppVersion } from "../version";

export type UpdateState = "idle" | "checking" | "ready" | "latest" | "offline";

const APPLIED_KEY = "annex-applied-build";
const HTML_KEY = "annex-html";

export function localVersion(): AppVersion {
  return APP_VERSION;
}

export function appliedBuild(): number {
  return Number(localStorage.getItem(APPLIED_KEY) || "0");
}

async function readVersion(base: string): Promise<AppVersion | null> {
  try {
    const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as AppVersion;
  } catch {
    return null;
  }
}

export async function fetchRemote(): Promise<{ base: string; version: AppVersion } | null> {
  for (const base of REMOTE_CANDIDATES) {
    const version = await readVersion(base);
    if (version) return { base, version };
  }
  return null;
}

async function downloadGame(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}annex.html?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes("ANNEX")) return null;
    return html;
  } catch {
    return null;
  }
}

function injectHtml(html: string): void {
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.head.replaceWith(doc.head);
  document.body.replaceWith(doc.body);
  for (const old of [...document.querySelectorAll("script")]) {
    const next = document.createElement("script");
    next.textContent = old.textContent;
    old.replaceWith(next);
  }
}

function persist(build: number, html: string): void {
  localStorage.setItem(APPLIED_KEY, String(build));
  localStorage.setItem(HTML_KEY, html);
}

function markHtml(html: string, build: number): string {
  if (html.includes("data-annex-applied=")) {
    return html.replace(/data-annex-applied="\d+"/, `data-annex-applied="${build}"`);
  }
  return html.replace("<html", `<html data-annex-applied="${build}"`);
}

function swapIn(html: string, build: number): void {
  const tagged = markHtml(html, build);
  persist(build, tagged);
  injectHtml(tagged);
}

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemote();
  if (!remote) return "offline";
  if (remote.version.build <= appliedBuild() && appliedBuild() > 0) return "latest";
  const html = await downloadGame(remote.base);
  if (!html) return "offline";
  swapIn(html, remote.version.build);
  return "ready";
}

export async function autoUpdate(): Promise<boolean> {
  if (document.documentElement.dataset.annexApplied) return false;
  await loadBundledVersion();

  const remote = await fetchRemote();
  if (remote) {
    if (remote.version.build > Math.max(appliedBuild(), APP_VERSION.build)) {
      const html = await downloadGame(remote.base);
      if (html) {
        swapIn(html, remote.version.build);
        return true;
      }
    }
    if (remote.version.build === APP_VERSION.build) {
      localStorage.setItem(APPLIED_KEY, String(remote.version.build));
    }
  }

  const cached = localStorage.getItem(HTML_KEY);
  if (cached && appliedBuild() > APP_VERSION.build) {
    injectHtml(cached);
    return true;
  }
  return false;
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemote();
  if (!remote) return false;
  return remote.version.build > Math.max(appliedBuild(), APP_VERSION.build);
}
