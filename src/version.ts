export type AppVersion = {
  name: string;
  version: string;
  build: number;
};

export const APP_VERSION: AppVersion = {
  name: "Annex",
  version: "0.5.50",
  build: 1786951711419,
};

export const BUNDLED_VERSION: AppVersion = {
  name: APP_VERSION.name,
  version: APP_VERSION.version,
  build: APP_VERSION.build,
};

const APPLIED_VERSION_KEY = "annex-applied-version";
const APPLIED_HTML_KEY = "annex-applied-html";
const APPLIED_BUILD_KEY = "annex-applied-build";

export function cmpVer(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export function isNewer(a: AppVersion, b: AppVersion): boolean {
  const v = cmpVer(a.version, b.version);
  if (v !== 0) return v > 0;
  return a.build > b.build;
}

export function adopt(ver: AppVersion): AppVersion {
  if (isNewer(ver, APP_VERSION)) {
    APP_VERSION.name = ver.name;
    APP_VERSION.version = ver.version;
    APP_VERSION.build = ver.build;
  }
  return APP_VERSION;
}

export function rememberApplied(ver: AppVersion, html?: string): void {
  try {
    const raw = localStorage.getItem(APPLIED_VERSION_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as AppVersion;
      if (isNewer(prev, ver)) return;
    }
  } catch {
    /* ignore */
  }
  adopt(ver);
  try {
    localStorage.setItem(APPLIED_VERSION_KEY, JSON.stringify(ver));
    localStorage.setItem(APPLIED_BUILD_KEY, String(ver.build));
    if (html && html.includes("ANNEX")) {
      localStorage.setItem(APPLIED_HTML_KEY, html);
    }
  } catch {
    /* ignore */
  }
}

export function readPersistedUpdate(): { version: AppVersion; html: string } | null {
  try {
    const raw = localStorage.getItem(APPLIED_VERSION_KEY);
    const html = localStorage.getItem(APPLIED_HTML_KEY);
    if (!raw || !html || !html.includes("ANNEX")) return null;
    const version = JSON.parse(raw) as AppVersion;
    if (!version.version) return null;
    return { version, html };
  } catch {
    return null;
  }
}

export function dropStalePersist(): void {
  const saved = readPersistedUpdate();
  if (!saved) return;
  if (isNewer(BUNDLED_VERSION, saved.version)) {
    try {
      localStorage.removeItem(APPLIED_HTML_KEY);
      localStorage.removeItem(APPLIED_VERSION_KEY);
      localStorage.removeItem(APPLIED_BUILD_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function loadApplied(): AppVersion {
  try {
    const raw = localStorage.getItem(APPLIED_VERSION_KEY);
    if (raw) adopt(JSON.parse(raw) as AppVersion);
  } catch {
    /* ignore */
  }
  return APP_VERSION;
}

export async function loadBundledVersion(): Promise<AppVersion> {
  loadApplied();
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) adopt((await res.json()) as AppVersion);
  } catch {
    /* keep current */
  }
  return APP_VERSION;
}

loadApplied();
