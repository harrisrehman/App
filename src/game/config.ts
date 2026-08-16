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

export const ARMY_SPEED = 83;
export const SPAWN_INTERVAL = 2;
export const BASE_HEALTH = 10;
export const START_TROOPS = 10;
export const NEUTRAL_TROOPS = 0;
export const PERIMETER_PAD = 22;
export const BASE_RADIUS = 40;
export const RING_GAP = 10;
export const RING_SPIN = 14;

export function ringRadius(baseRadius: number): number {
  return (baseRadius + PERIMETER_PAD) * 1.25;
}

export const BASE_GAP = 2 * ringRadius(BASE_RADIUS * 1.15) + RING_GAP;
export const BASE_COUNT_MIN = 14;
export const BASE_COUNT_MAX = 18;
export const START_MIN_DIST = 640;

export const AI_MIN_WAIT = 1.15;
export const AI_MAX_WAIT = 2.1;
export const FIGHT_RADIUS = 16;
export const POP_LIFE = 0.2;
export const POP_CAP = 48;

export const UPDATE_SOURCES = [
  {
    versionUrl:
      "https://raw.githubusercontent.com/harrisrehman/App/cursor/annex-android-a9d2/dist/version.json",
    gameUrl:
      "https://raw.githubusercontent.com/harrisrehman/App/cursor/annex-android-a9d2/dist/annex.html",
  },
  {
    versionUrl:
      "https://api.github.com/repos/harrisrehman/App/contents/dist/version.json?ref=cursor/annex-android-a9d2",
    gameUrl:
      "https://api.github.com/repos/harrisrehman/App/contents/dist/annex.html?ref=cursor/annex-android-a9d2",
  },
  {
    versionUrl:
      "https://cdn.jsdelivr.net/gh/harrisrehman/App@cursor%2Fannex-android-a9d2/dist/version.json",
    gameUrl:
      "https://cdn.jsdelivr.net/gh/harrisrehman/App@cursor%2Fannex-android-a9d2/dist/annex.html",
  },
] as const;
