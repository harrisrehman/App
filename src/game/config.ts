export const WORLD_W = 1000;
export const WORLD_H = 1600;

export const COLORS = {
  bg: "#1a120c",
  panel: "#1c140e",
  text: "#f4ead4",
  muted: "#b5a27a",
  player: "#4a9eff",
  ai: "#ff5a4a",
  ai1: "#ff5a4a",
  ai2: "#5ae07a",
  ai3: "#f5c542",
  ai4: "#c46bff",
  neutral: "#8a8078",
  line: "#c5a15a",
} as const;

export const ARMY_SPEED = 47;
export const SPAWN_INTERVAL = 5;
export const BASE_HEALTH = 10;
export const SOLDIER_HEALTH = 1;

export type Rules = {
  baseHealth: number;
  soldierHealth: number;
};

const RULES_KEY = "annex-dev-rules";

export const rules: Rules = {
  baseHealth: BASE_HEALTH,
  soldierHealth: SOLDIER_HEALTH,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function loadRules(): Rules {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Rules>;
      if (typeof data.baseHealth === "number") rules.baseHealth = clamp(data.baseHealth, 1, 200);
      if (typeof data.soldierHealth === "number") rules.soldierHealth = clamp(data.soldierHealth, 1, 50);
    }
  } catch {
    /* keep defaults */
  }
  return rules;
}

export function saveRules(): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export function nudgeRule(key: keyof Rules, delta: number): number {
  if (key === "baseHealth") rules.baseHealth = clamp(rules.baseHealth + delta, 1, 200);
  if (key === "soldierHealth") rules.soldierHealth = clamp(rules.soldierHealth + delta, 1, 50);
  saveRules();
  return rules[key];
}

loadRules();
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
export const SOLDIER_GAP = 18;
export const WALL_SENSE = 72;
export const WALL_LEASH = 100;
export const WALL_BASE_PAD = 16;
export const DEFENSE_COST = 6;
export const DEFENSE_FIRE = 2;
export const DEFENSE_SHOT_SPEED = 520;
export const DEFENSE_HIT = 18;
export const GUNNER_ORBIT = 0.26;
export const GUNNER_STEER = 12;
export const GUNNER_BARREL = 18;
export const GUNNER_BARREL_W = 5.4;
export const POP_LIFE = 0.2;
export const POP_CAP = 48;

export const THEME_URL = "./menu/theme.mp3";

export const REMOTE_THEME_URL =
  "https://raw.githubusercontent.com/harrisrehman/App/cursor/annex-android-a9d2/dist/menu/theme.mp3";

export const CDN_THEME_URL =
  "https://cdn.jsdelivr.net/gh/harrisrehman/App@cursor/annex-android-a9d2/dist/menu/theme.mp3";

export const BASE_ART_URL = "./bases/base.png";
export const SOLDIER_ART_URL = "./units/soldier.png";
export const SOLDIER_RUN_SHEET_URL = "./units/soldier-run.png";

export const SOLDIER_RUN_COLS = 8;
export const SOLDIER_RUN_ROWS = 9;
export const SOLDIER_RUN_FPS = 12;

export const APK_DOWNLOAD_URL =
  "https://github.com/harrisrehman/App/releases/download/v0.5.78/annex.apk";

export const UPDATE_SOURCES = [
  {
    versionUrl:
      "https://raw.githubusercontent.com/harrisrehman/App/cursor/annex-android-a9d2/dist/version.json",
  },
  {
    versionUrl:
      "https://api.github.com/repos/harrisrehman/App/contents/dist/version.json?ref=cursor/annex-android-a9d2",
  },
] as const;
