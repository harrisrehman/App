import { REMOTE_CANDIDATES } from "./config";
import { APP_VERSION, type AppVersion } from "../version";

export type UpdateState = "idle" | "checking" | "ready" | "latest" | "offline";

export function localVersion(): AppVersion {
  return APP_VERSION;
}

export function isRemoteHost(): boolean {
  return REMOTE_CANDIDATES.some((base) => window.location.href.startsWith(base));
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

async function injectGame(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}annex.html?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const html = await res.text();
    if (!html.includes("ANNEX")) return false;
    const blob = new Blob([html], { type: "text/html" });
    window.location.replace(URL.createObjectURL(blob));
    return true;
  } catch {
    return false;
  }
}

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemote();
  if (!remote) return "offline";
  if (remote.version.build === APP_VERSION.build && APP_VERSION.build !== 0) return "latest";
  if (await injectGame(remote.base)) return "ready";
  return "offline";
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemote();
  if (!remote) return false;
  return remote.version.build !== APP_VERSION.build;
}
