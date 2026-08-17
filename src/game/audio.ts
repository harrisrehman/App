import themeUrl from "../assets/theme.ogg?url";

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
let fade: number | null = null;
let bound = false;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(themeUrl);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

function goal(): number {
  if (muted() || !menuOn) return 0;
  return 0.72;
}

function tickFade(): void {
  const a = el();
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
  const a = el();
  if (muted() || !menuOn) return;
  if (a.paused) {
    void a.play().catch(() => {
      /* wait for a tap */
    });
  }
}

export function bindTheme(): void {
  if (bound) return;
  bound = true;
  el();
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
