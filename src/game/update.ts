import { REMOTE_CANDIDATES } from "./config";
import { APP_VERSION, type AppVersion } from "../version";

export type UpdateState = "idle" | "checking" | "ready" | "latest" | "offline";

const APPLIED_KEY = "annex-applied-build";
const HTML_KEY = "annex-html";

export function localVersion(): AppVersion {
  return APP_VERSION;
}

export function appliedBuild(): number {
  return Number(localStorage.getItem(APPLIED_KEY) || "0");
}

async function fetchWithTimeout(url: string, ms = 4000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readVersion(base: string): Promise<AppVersion | null> {
  try {
    const res = await fetchWithTimeout(`${base}version.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return (await res.json()) as AppVersion;
  } catch {
    return null;
  }
}

export async function fetchRemote(): Promise<{ base: string; version: AppVersion } | null> {
  const found: { base: string; version: AppVersion }[] = [];
  await Promise.all(
    REMOTE_CANDIDATES.map(async (base) => {
      const version = await readVersion(base);
      if (version) found.push({ base, version });
    }),
  );
  if (found.length === 0) return null;
  found.sort((a, b) => b.version.build - a.version.build);
  return found[0];
}

async function downloadGame(base: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${base}annex.html?t=${Date.now()}`, 8000);
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes("ANNEX")) return null;
    return html;
  } catch {
    return null;
  }
}

function injectHtml(html: string): boolean {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const scripts = [...doc.querySelectorAll("script")].map((s) => s.textContent ?? "");
    for (const s of doc.querySelectorAll("script")) s.remove();
    document.documentElement.innerHTML = doc.documentElement.innerHTML;
    for (const code of scripts) {
      if (!code.trim()) continue;
      const fn = new Function(code);
      fn();
    }
    return true;
  } catch {
    return false;
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

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemote();
  if (!remote) return "offline";
  const html = await downloadGame(remote.base);
  if (!html) return "offline";
  const tagged = markHtml(html, remote.version.build);
  if (remote.version.build === appliedBuild() && localStorage.getItem(HTML_KEY) === tagged) {
    return "latest";
  }
  persist(remote.version.build, tagged);
  if (!injectHtml(tagged)) return "offline";
  return "ready";
}

export async function autoUpdate(): Promise<boolean> {
  return false;
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemote();
  if (!remote) return false;
  return remote.version.build > Math.max(appliedBuild(), APP_VERSION.build);
}
