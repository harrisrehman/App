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
export const ARMY_SPEED = 83;
export const SPAWN_INTERVAL = 2;
export const START_TROOPS = 0;
export const NEUTRAL_TROOPS = 5;
export const BASE_RADIUS = 40;
export const BASE_COUNT_MIN = 10;
export const BASE_COUNT_MAX = 13;

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
