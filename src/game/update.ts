import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { CapacitorHttp } from "@capacitor/core";
import { APK_DOWNLOAD_URL, UPDATE_SOURCES } from "./config";
import { APP_VERSION, BUNDLED_VERSION, isNewer, type AppVersion } from "../version";

export type UpdateState = "latest" | "offline" | "install";

export type UpdateResult =
  | { state: "latest" }
  | { state: "offline" }
  | { state: "install"; version: AppVersion; apkUrl: string };

export type UpdateOffer = { version: AppVersion; apkUrl: string };

declare global {
  interface Window {
    __annexThemeStop?: () => void;
  }
}

export function localVersion(): AppVersion {
  return APP_VERSION;
}

function decodeBody(data: unknown): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"content"')) {
      try {
        const json = JSON.parse(trimmed) as { encoding?: string; content?: string };
        if (json.encoding === "base64" && json.content) {
          return atob(json.content.replace(/\s/g, ""));
        }
      } catch {
        /* use raw string */
      }
    }
    return data;
  }
  if (data && typeof data === "object") {
    const json = data as { encoding?: string; content?: string; version?: string };
    if (json.encoding === "base64" && json.content) {
      return atob(json.content.replace(/\s/g, ""));
    }
    if (json.version) return JSON.stringify(json);
  }
  return null;
}

function bust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

async function getText(url: string, ms = 8000): Promise<string | null> {
  try {
    const res = await CapacitorHttp.get({
      url: bust(url),
      readTimeout: ms,
      connectTimeout: Math.min(ms, 5000),
      responseType: "text",
      headers: {
        Accept: "application/vnd.github.raw, application/json, text/plain, */*",
        "Cache-Control": "no-cache",
      },
    });
    if (res.status >= 200 && res.status < 300) {
      const body = decodeBody(res.data);
      if (body) return body;
    }
  } catch {
    /* try fetch fallback */
  }
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(bust(url), { cache: "no-store", signal: ctrl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function readVersion(url: string): Promise<AppVersion | null> {
  const text = await getText(url, 8000);
  if (!text) return null;
  try {
    const data = JSON.parse(text) as AppVersion;
    if (!data.version) return null;
    return data;
  } catch {
    return null;
  }
}

function apkUrlFor(version: AppVersion): string {
  return version.apkUrl?.trim() || APK_DOWNLOAD_URL;
}

export async function fetchRemote(): Promise<UpdateOffer | null> {
  const found: UpdateOffer[] = [];
  await Promise.all(
    UPDATE_SOURCES.map(async (src) => {
      const version = await readVersion(src.versionUrl);
      if (version) found.push({ version, apkUrl: apkUrlFor(version) });
    }),
  );
  if (found.length === 0) return null;
  found.sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
  return found[0];
}

export async function openApkDownload(apkUrl: string): Promise<void> {
  const url = bust(apkUrl);
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function applyUpdate(): Promise<UpdateResult> {
  const remote = await fetchRemote();
  if (!remote) return { state: "offline" };
  if (!isNewer(remote.version, BUNDLED_VERSION)) return { state: "latest" };
  await openApkDownload(remote.apkUrl);
  return { state: "install", version: remote.version, apkUrl: remote.apkUrl };
}

export async function peekUpdate(): Promise<UpdateOffer | null> {
  const remote = await fetchRemote();
  if (!remote) return null;
  if (!isNewer(remote.version, BUNDLED_VERSION)) return null;
  return remote;
}
