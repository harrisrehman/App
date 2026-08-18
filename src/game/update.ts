import { CapacitorHttp } from "@capacitor/core";
import { UPDATE_SOURCES } from "./config";
import {
  APP_VERSION,
  BUNDLED_VERSION,
  isNewer,
  readPersistedUpdate,
  rememberApplied,
  type AppVersion,
} from "../version";

export type UpdateState = "idle" | "checking" | "ready" | "latest" | "offline";

const APPLIED_KEY = "annex-applied-build";
const JUST_UPDATED_KEY = "annex-just-updated";

declare global {
  interface Window {
    __annexOtaShell?: boolean;
    __annexRestored?: boolean;
    __annexThemeStop?: () => void;
  }
}

export function localVersion(): AppVersion {
  return APP_VERSION;
}

export function appliedBuild(): number {
  return Number(localStorage.getItem(APPLIED_KEY) || "0");
}

export function consumeJustUpdated(): string | null {
  try {
    const note = localStorage.getItem(JUST_UPDATED_KEY);
    if (note) localStorage.removeItem(JUST_UPDATED_KEY);
    return note;
  } catch {
    return null;
  }
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

const OTA_TARGET_KEY = "annex-ota-target";

function stopEveryAudio(): void {
  window.__annexThemeStop?.();
  window.__annexStopAllMedia?.();
  for (const el of document.querySelectorAll("audio")) {
    el.pause();
    el.removeAttribute("src");
    el.load();
  }
}

function hopHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function () {
  try {
    var t = sessionStorage.getItem("${OTA_TARGET_KEY}");
    sessionStorage.removeItem("${OTA_TARGET_KEY}");
    if (t) location.replace(t);
  } catch (e) {}
})();
<\/script></body></html>`;
}

export function navigateOtaHtml(html: string): void {
  stopEveryAudio();
  const target = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  try {
    sessionStorage.setItem(OTA_TARGET_KEY, target);
    window.location.replace(URL.createObjectURL(new Blob([hopHtml()], { type: "text/html" })));
  } catch {
    window.location.replace(target);
  }
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
    if (res.status < 200 || res.status >= 300) return null;
    return decodeBody(res.data);
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

export async function fetchRemote(): Promise<{ version: AppVersion; gameUrl: string } | null> {
  const found: { version: AppVersion; gameUrl: string }[] = [];
  await Promise.all(
    UPDATE_SOURCES.map(async (src) => {
      const version = await readVersion(src.versionUrl);
      if (version) found.push({ version, gameUrl: src.gameUrl });
    }),
  );
  if (found.length === 0) return null;
  found.sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
  return found[0];
}

async function downloadGame(url: string): Promise<string | null> {
  const html = await getText(url, 180000);
  if (!html || !html.includes("ANNEX")) return null;
  return html;
}

function current(): AppVersion {
  return {
    ...APP_VERSION,
    build: Math.max(appliedBuild(), APP_VERSION.build),
  };
}

function alreadyHave(remote: AppVersion): boolean {
  return !isNewer(remote, current());
}

export function restorePersisted(): boolean {
  if (window.__annexOtaShell || window.__annexRestored) return false;
  const saved = readPersistedUpdate();
  if (!saved || !isNewer(saved.version, BUNDLED_VERSION)) return false;
  window.__annexRestored = true;
  rememberApplied(saved.version);
  navigateOtaHtml(saved.html);
  return true;
}

export async function applyUpdate(): Promise<UpdateState> {
  const remote = await fetchRemote();
  if (!remote) return "offline";
  if (alreadyHave(remote.version)) return "latest";
  const html = await downloadGame(remote.gameUrl);
  if (!html) return "offline";
  try {
    localStorage.setItem(JUST_UPDATED_KEY, remote.version.version);
  } catch {
    /* ignore */
  }
  rememberApplied(remote.version, html);
  localStorage.setItem(APPLIED_KEY, String(remote.version.build));
  navigateOtaHtml(html);
  return "ready";
}

export async function autoUpdate(): Promise<boolean> {
  return false;
}

export async function peekUpdate(): Promise<boolean> {
  const remote = await fetchRemote();
  if (!remote) return false;
  return isNewer(remote.version, current());
}
