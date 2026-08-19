import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { CDN_THEME_URL, REMOTE_THEME_URL, THEME_URL } from "./config";
import { APP_VERSION } from "../version";

const PLAYERS_KEY = "__annexThemePlayers";
const THEME_ID = "menu-theme";
const THEME_START = 14;

let audio: HTMLAudioElement | null = null;
let sourceIdx = 0;
let menuOn = true;
let appActive = true;
let fade: number | null = null;
let lifecycleBound = false;

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
  return [
    new URL(`${THEME_URL}?${bust}`, location.href).href,
    `${REMOTE_THEME_URL}?${bust}`,
    `${CDN_THEME_URL}?${bust}`,
  ];
}

function bytesFromHttp(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") {
    const bin = atob(data.replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return null;
}

async function downloadThemeBlob(url: string): Promise<string | null> {
  try {
    const res = await CapacitorHttp.get({
      url,
      responseType: "arraybuffer",
      readTimeout: 120000,
      connectTimeout: 15000,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const bytes = bytesFromHttp(res.data);
    if (!bytes || bytes.length < 10000) return null;
    return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "audio/mpeg" }));
  } catch {
    return null;
  }
}

function seekStart(el: HTMLAudioElement): void {
  if (el.readyState < 1) return;
  if (el.currentTime < THEME_START - 0.05) {
    try {
      el.currentTime = THEME_START;
    } catch {
      /* wait for more data */
    }
  }
}

function bindSeek(el: HTMLAudioElement): void {
  const seek = (): void => seekStart(el);
  el.addEventListener("loadedmetadata", seek);
  el.addEventListener("loadeddata", seek);
  el.addEventListener("canplay", seek);
  el.addEventListener("playing", seek);
  el.addEventListener("timeupdate", seek);
}

function mountAudio(el: HTMLAudioElement): HTMLAudioElement {
  el.id = THEME_ID;
  el.loop = true;
  el.preload = "auto";
  el.volume = 0;
  el.setAttribute("playsinline", "");
  el.style.display = "none";
  bindSeek(el);
  const old = document.getElementById(THEME_ID);
  old?.remove();
  document.body.appendChild(el);
  return track(el);
}

function nextSource(): string | null {
  const list = themeSources();
  if (sourceIdx >= list.length) return null;
  const url = list[sourceIdx] ?? null;
  sourceIdx += 1;
  return url;
}

function armAudio(el: HTMLAudioElement, url: string): void {
  el.src = url;
  el.load();
}

async function blobFallback(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  for (const url of themeSources()) {
    const blob = await downloadThemeBlob(url);
    if (blob) return blob;
  }
  return null;
}

function createThemeElement(): HTMLAudioElement {
  const el = mountAudio(new Audio());
  const url = nextSource();
  if (url) armAudio(el, url);
  el.addEventListener("error", () => {
    void retryNextSource();
  });
  return el;
}

async function retryNextSource(): Promise<void> {
  const url = nextSource();
  if (!audio) return;
  if (url) {
    armAudio(audio, url);
    return;
  }
  const blob = await blobFallback();
  if (blob && audio) armAudio(audio, blob);
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
  el.remove();
}

export function stopAllThemeAudio(): void {
  clearFade();
  for (const el of players()) disposeAudio(el);
  window[PLAYERS_KEY] = [];
  disposeAudio(audio);
  audio = null;
  sourceIdx = 0;
  document.getElementById(THEME_ID)?.remove();
  window.__annexStopAllMedia?.();
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    try {
      localStorage.removeItem("annex-theme-mute");
    } catch {
      /* ignore */
    }
    audio = createThemeElement();
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

function playNow(): void {
  const a = ensureAudio();
  if (!menuOn || !appActive) return;
  seekStart(a);
  a.volume = 0.72;
  void a
    .play()
    .then(() => {
      seekStart(a);
    })
    .catch(() => {
      /* needs tap */
    });
  startFade();
}

function onBackground(): void {
  appActive = false;
  clearFade();
  for (const el of players()) el.pause();
}

function onForeground(): void {
  appActive = true;
  if (menuOn) playNow();
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

function unlockTheme(): void {
  playNow();
}

export function bindTheme(): void {
  window.__annexThemeStop = stopAllThemeAudio;
  ensureAudio();
  bindLifecycle();
  document.addEventListener("pointerdown", unlockTheme, true);
  document.addEventListener("touchstart", unlockTheme, { capture: true, passive: true });
  document.addEventListener("click", unlockTheme, true);
}

export function themeToMenu(): void {
  menuOn = true;
  playNow();
}

export function themeToMatch(): void {
  menuOn = false;
  startFade();
}

export function stopTheme(): void {
  stopAllThemeAudio();
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
