export type AppVersion = {
  name: string;
  version: string;
  build: number;
  apkUrl?: string;
};

export const APP_VERSION: AppVersion = {
  name: "FATH",
  version: "0.5.87",
  build: 1787379630998,
  apkUrl: "https://github.com/harrisrehman/App/releases/download/v0.5.87/annex.apk",
};

export const BUNDLED_VERSION: AppVersion = {
  name: APP_VERSION.name,
  version: APP_VERSION.version,
  build: APP_VERSION.build,
};

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

export function clearLegacyOtaCache(): void {
  try {
    localStorage.removeItem("annex-applied-version");
    localStorage.removeItem("annex-applied-html");
    localStorage.removeItem("annex-applied-build");
    localStorage.removeItem("annex-just-updated");
  } catch {
    /* ignore */
  }
}

export async function loadBundledVersion(): Promise<AppVersion> {
  return BUNDLED_VERSION;
}
