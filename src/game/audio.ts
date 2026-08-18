import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { REMOTE_THEME_URL, THEME_URL } from "./config";
import { APP_VERSION } from "../version";

const PLAYERS_KEY = "__annexThemePlayers";

let audio: HTMLAudioElement | null = null;
let themeBlobUrl: string | null = null;
let themeLoading: Promise<string | null> | null = null;
let menuOn = true;
let appActive = true;
let fade: number | null = null;
let lifecycleBound = false;
let unlocked = false;

function players(): HTMLAudioElement[] {
  return (window[PLAYERS_KEY] as HTMLAudioElement[] | undefined) ?? [];
}

function track(el: HTMLAudioElement): HTMLAudioElement {
  const list = window[PLAYERS_KEY] as HTMLAudioElement[] | undefined;
  if (list) {
    if (!list.includes(el)) list.push(el);
  } else {
    window[PLAYERS_KEY] = [el];
  }
  return el;
}

function themeSources(): string[] {
  const bust = `b=${APP_VERSION.build}&t=${Date.now()}`;
  const out: string[] = [];
  if (location.protocol !== "blob:") {
    out.push(new URL(`${THEME_URL}?${bust}`, location.href).href);
  }
  out.push(`${REMOTE_THEME_URL}?${bust}`);
  return out;
}

function bytesFromHttp(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") {
    const raw = data.replace(/\s/g, "");
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return null;
}

async function fetchThemeBytes(url: string): Promise<Uint8Array | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        responseType: "arraybuffer",
        readTimeout: 120000,
        connectTimeout: 15000,
      });
      if (res.status < 200 || res.status >= 300) return null;
      return bytesFromHttp(res.data);
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadThemeBlob(): Promise<string | null> {
  if (themeBlobUrl) return themeBlobUrl;
  if (themeLoading) return themeLoading;
  themeLoading = (async () => {
    for (const url of themeSources()) {
      const bytes = await fetchThemeBytes(url);
      if (!bytes || bytes.length < 10000) continue;
      themeBlobUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "audio/mpeg" }));
      return themeBlobUrl;
    }
    return null;
  })();
  try {
    return await themeLoading;
  } finally {
    themeLoading = null;
  }
}

function clearFade(): void {
  if (fade != null) window.clearTimeout(fade);
  fade = null;
}

function disposeAudio(el: HTMLAudioElement | null | undefined): void {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
}

export function stopAllThemeAudio(): void {
  clearFade();
  for (const el of players()) disposeAudio(el);
  window[PLAYERS_KEY] = [];
  disposeAudio(audio);
  audio = null;
  window.__annexStopAllMedia?.();
  for (const el of document.querySelectorAll("audio")) {
    disposeAudio(el);
  }
}

async function ensureAudio(): Promise<HTMLAudioElement | null> {
  const src = await loadThemeBlob();
  if (!src) return null;
  if (audio && audio.src !== src) {
    disposeAudio(audio);
    audio = null;
  }
  if (!audio) {
    audio = track(new Audio(src));
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

function goal(): number {
  if (!menuOn || !appActive) return 0;
  return 0.72;
}

function tickFade(): void {
  if (!audio) return;
  const want = goal();
  const step = want > audio.volume ? 0.07 : 0.09;
  const next = audio.volume + (want > audio.volume ? step : -step);
  if (Math.abs(next - want) < 0.06) {
    audio.volume = want;
    if (want === 0) audio.pause();
    fade = null;
    return;
  }
  audio.volume = Math.max(0, Math.min(1, next));
  fade = window.setTimeout(tickFade, 40);
}

function startFade(): void {
  clearFade();
  if (!audio) return;
  fade = window.setTimeout(tickFade, 16);
}

async function playIfNeeded(): Promise<void> {
  const a = await ensureAudio();
  if (!a || !menuOn || !appActive) return;
  if (a.paused) {
    try {
      await a.play();
    } catch {
      /* wait for a tap */
    }
  }
}

export function stopTheme(): void {
  stopAllThemeAudio();
}

function onBackground(): void {
  appActive = false;
  clearFade();
  for (const el of players()) el.pause();
}

function onForeground(): void {
  appActive = true;
  void playIfNeeded();
  startFade();
}

function bindLifecycle(): void {
  if (lifecycleBound) return;
  lifecycleBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onBackground();
    else onForeground();
  });
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) onForeground();
    else onBackground();
  });
}

async function primeTheme(): Promise<void> {
  try {
    localStorage.removeItem("annex-theme-mute");
  } catch {
    /* ignore */
  }
  const a = await ensureAudio();
  if (!a) return;
  a.addEventListener(
    "canplaythrough",
    () => {
      void playIfNeeded();
      startFade();
    },
    { once: true },
  );
  void playIfNeeded();
  startFade();
}

function unlockTheme(): void {
  unlocked = true;
  void (async () => {
    await primeTheme();
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        /* ignore */
      }
    }
    if (unlocked && menuOn && appActive) {
      audio.volume = Math.max(audio.volume, 0.72);
      startFade();
    }
  })();
}

export function bindTheme(): void {
  stopAllThemeAudio();
  window.__annexThemeStop = stopAllThemeAudio;
  bindLifecycle();
  const unlock = (): void => {
    unlockTheme();
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("touchstart", unlock, true);
  document.addEventListener("click", unlock, true);
  void primeTheme();
}

export function themeToMenu(): void {
  menuOn = true;
  void playIfNeeded();
  startFade();
}

export function themeToMatch(): void {
  menuOn = false;
  startFade();
}

export function toggleThemeMute(): boolean {
  return false;
}

export function isThemeMuted(): boolean {
  return false;
}

export function syncMuteButton(): void {
  /* sound toggle removed */
}

declare global {
  interface Window {
    __annexThemeStop?: () => void;
    __annexThemePlayers?: HTMLAudioElement[];
    __annexStopAllMedia?: () => void;
  }
}
