import { REMOTE_BASE } from "./config";
import { APP_VERSION, type AppVersion } from "../version";

export type UpdateState = "idle" | "checking" | "ready" | "latest" | "offline";

export function localVersion(): AppVersion {
  return APP_VERSION;
}

export function isRemoteHost(): boolean {
  return window.location.href.startsWith(REMOTE_BASE);
}

export async function fetchRemoteVersion(): Promise<AppVersion | null> {
  try {
    const res = await fetch(`${REMOTE_BASE}version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AppVersion;
  } catch {
    return null;
  }
}

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemoteVersion();
  if (!remote) return "offline";
  if (remote.build === APP_VERSION.build && isRemoteHost()) return "latest";
  window.location.href = `${REMOTE_BASE}?v=${remote.build}`;
  return "ready";
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemoteVersion();
  if (!remote) return false;
  return remote.build !== APP_VERSION.build;
}
