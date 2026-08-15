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

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemote();
  if (!remote) return "offline";
  if (remote.version.build === APP_VERSION.build && isRemoteHost()) return "latest";
  window.location.href = `${remote.base}?v=${remote.version.build}`;
  return "ready";
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemote();
  if (!remote) return false;
  return remote.version.build !== APP_VERSION.build;
}
