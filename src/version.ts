export type AppVersion = {
  name: string;
  version: string;
  build: number;
};

export const APP_VERSION: AppVersion = {
  name: "Annex",
  version: "0.3.1",
  build: 0,
};

export async function loadBundledVersion(): Promise<AppVersion> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return APP_VERSION;
    const data = (await res.json()) as AppVersion;
    APP_VERSION.version = data.version;
    APP_VERSION.build = data.build;
    APP_VERSION.name = data.name;
    return APP_VERSION;
  } catch {
    return APP_VERSION;
  }
}
