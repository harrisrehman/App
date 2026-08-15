export const WORLD_W = 1000;
export const WORLD_H = 1600;

export const COLORS = {
  bg: "#0e0e10",
  panel: "#17171b",
  text: "#f2f2f4",
  muted: "#8a8a92",
  player: "#4a9eff",
  ai: "#ff5a4a",
  neutral: "#7a7a80",
  line: "#ffffff",
} as const;

export const TROOP_CAP = 20;
export const ARMY_SPEED = 220;
export const SPAWN_INTERVAL = 5;
export const START_TROOPS = 0;
export const NEUTRAL_TROOPS = 0;
export const BASE_RADIUS = 80;
export const BASE_COUNT_MIN = 5;
export const BASE_COUNT_MAX = 6;

export const AI_MIN_WAIT = 1.4;
export const AI_MAX_WAIT = 3.8;

export const REMOTE_CANDIDATES = [
  "https://harrisrehman.github.io/App/",
  "https://raw.githack.com/harrisrehman/App/cursor/annex-android-a9d2/dist/",
  "https://raw.githack.com/harrisrehman/App/main/dist/",
] as const;
