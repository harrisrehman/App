import { App } from "@capacitor/app";
import { REMOTE_THEME_URL } from "./config";
import { APP_VERSION } from "../version";

const MUTE_KEY = "annex-theme-mute";
const PLAYERS_KEY = "__annexThemePlayers";

function muted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMute(on: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let audio: HTMLAudioElement | null = null;
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

function remoteThemeSrc(): string {
  return `${REMOTE_THEME_URL}?b=${APP_VERSION.build}`;
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

function ensureAudio(): HTMLAudioElement {
  const want = remoteThemeSrc();
  let el = audio ?? players()[0];
  if (el) {
    const base = want.split("?")[0] ?? want;
    if (!el.src.includes(base)) {
      el.pause();
      el.src = want;
      void el.load();
    }
    audio = el;
    track(el);
    return el;
  }
  el = track(new Audio(want));
  el.loop = true;
  el.preload = "auto";
  el.volume = 0;
  audio = el;
  return el;
}

function goal(): number {
  if (muted() || !menuOn || !appActive) return 0;
  return 0.72;
}

function tickFade(): void {
  const a = ensureAudio();
  const want = goal();
  const step = want > a.volume ? 0.07 : 0.09;
  const next = a.volume + (want > a.volume ? step : -step);
  if (Math.abs(next - want) < 0.06) {
    a.volume = want;
    if (want === 0) a.pause();
    fade = null;
    return;
  }
  a.volume = Math.max(0, Math.min(1, next));
  fade = window.setTimeout(tickFade, 40);
}

function startFade(): void {
  clearFade();
  fade = window.setTimeout(tickFade, 16);
}

function playIfNeeded(): void {
  const a = ensureAudio();
  if (muted() || !menuOn || !appActive) return;
  if (a.paused) {
    void a.play().catch(() => {
      /* wait for a tap */
    });
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
  playIfNeeded();
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

export function bindTheme(): void {
  stopAllThemeAudio();
  window.__annexThemeStop = stopAllThemeAudio;
  ensureAudio();
  bindLifecycle();
  const unlock = (): void => {
    playIfNeeded();
  };
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("touchstart", unlock, true);
  playIfNeeded();
  startFade();
  syncMuteButton();
}

export function themeToMenu(): void {
  menuOn = true;
  playIfNeeded();
  startFade();
}

export function themeToMatch(): void {
  menuOn = false;
  startFade();
}

export function toggleThemeMute(): boolean {
  writeMute(!muted());
  if (!muted()) playIfNeeded();
  startFade();
  syncMuteButton();
  return muted();
}

export function isThemeMuted(): boolean {
  return muted();
}

export function syncMuteButton(): void {
  const btn = document.querySelector("#menu-mute");
  if (!btn) return;
  const off = muted();
  btn.classList.toggle("muted", off);
  btn.setAttribute("aria-pressed", off ? "true" : "false");
  btn.setAttribute("aria-label", off ? "Unmute theme" : "Mute theme");
  btn.textContent = off ? "Sound off" : "Sound on";
}

declare global {
  interface Window {
    __annexThemeStop?: () => void;
    __annexThemePlayers?: HTMLAudioElement[];
    __annexStopAllMedia?: () => void;
  }
}
