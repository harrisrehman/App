import { App } from "@capacitor/app";
import { LOCAL_THEME_URL, REMOTE_THEME_URL } from "./config";
import { APP_VERSION } from "../version";

const MUTE_KEY = "annex-theme-mute";

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
let bound = false;

function remoteThemeSrc(): string {
  return `${REMOTE_THEME_URL}?b=${APP_VERSION.build}`;
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(remoteThemeSrc());
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.addEventListener(
      "error",
      () => {
        if (!audio) return;
        if (!audio.src.includes("menu/theme.mp3")) {
          audio.src = LOCAL_THEME_URL;
          void audio.load();
        }
      },
      { once: false },
    );
  }
  return audio;
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
  if (fade != null) window.clearTimeout(fade);
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
  if (fade != null) window.clearTimeout(fade);
  fade = null;
  if (audio) {
    audio.pause();
    audio = null;
  }
  bound = false;
}

function onBackground(): void {
  appActive = false;
  if (fade != null) window.clearTimeout(fade);
  fade = null;
  audio?.pause();
}

function onForeground(): void {
  appActive = true;
  playIfNeeded();
  startFade();
}

function bindLifecycle(): void {
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
  if (bound) return;
  bound = true;
  window.__annexThemeStop = stopTheme;
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
  }
}
