export type AppVersion = {
  name: string;
  version: string;
  build: number;
};

export const APP_VERSION: AppVersion = {
  name: "Annex",
  version: "0.4.0",
  build: 1786859132870,
};

const APPLIED_VERSION_KEY = "annex-applied-version";

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

export function rememberApplied(ver: AppVersion): void {
  adopt(ver);
  try {
    localStorage.setItem(APPLIED_VERSION_KEY, JSON.stringify(ver));
  } catch {
    /* ignore */
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
