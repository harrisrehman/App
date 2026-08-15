import {
  INCOME_PER_AREA,
  MAX_INCOME,
  MIN_INCOME,
  NEUTRAL_MAX,
  NEUTRAL_MIN,
  START_TROOPS,
  WORLD_H,
  WORLD_W,
} from "./config";
import { centroid, nearPoint, polygonArea } from "./geo";
import { mulberry32, randInt } from "./rng";
import type { Point, Territory } from "./types";

const COLS = 3;
const ROWS = 5;
const PAD = 36;

function gridPoints(rng: () => number): Point[][] {
  const pts: Point[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: Point[] = [];
    for (let c = 0; c <= COLS; c++) {
      const x = PAD + (c / COLS) * (WORLD_W - PAD * 2);
      const y = PAD + (r / ROWS) * (WORLD_H - PAD * 2);
      const jx = c === 0 || c === COLS ? 0 : (rng() - 0.5) * 88;
      const jy = r === 0 || r === ROWS ? 0 : (rng() - 0.5) * 74;
      row.push({ x: x + jx, y: y + jy });
    }
    pts.push(row);
  }
  return pts;
}

function shareEdge(a: Point[], b: Point[]): boolean {
  let shared = 0;
  for (const p of a) {
    if (b.some((q) => nearPoint(p, q, 4))) shared += 1;
  }
  return shared >= 2;
}

export function createMap(seed = 20260815): Territory[] {
  const rng = mulberry32(seed);
  const pts = gridPoints(rng);
  const raw: { poly: Point[]; r: number; c: number }[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      raw.push({
        r,
        c,
        poly: [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]],
      });
    }
  }

  const territories: Territory[] = raw.map((cell, id) => {
    const area = polygonArea(cell.poly);
    const income = Math.min(MAX_INCOME, Math.max(MIN_INCOME, area * INCOME_PER_AREA));
    return {
      id,
      poly: cell.poly,
      center: centroid(cell.poly),
      area,
      income,
      owner: "neutral",
      troops: randInt(rng, NEUTRAL_MIN, NEUTRAL_MAX),
      neighbors: [],
    };
  });

  for (let i = 0; i < territories.length; i++) {
    for (let j = i + 1; j < territories.length; j++) {
      if (shareEdge(territories[i].poly, territories[j].poly)) {
        territories[i].neighbors.push(j);
        territories[j].neighbors.push(i);
      }
    }
  }

  const playerId = (ROWS - 1) * COLS;
  const aiId = COLS - 1;
  territories[playerId].owner = "player";
  territories[playerId].troops = START_TROOPS;
  territories[aiId].owner = "ai";
  territories[aiId].troops = START_TROOPS;

  return territories;
}
