import {
  BASE_COUNT_MAX,
  BASE_COUNT_MIN,
  BASE_RADIUS,
  NEUTRAL_TROOPS,
  WORLD_H,
  WORLD_W,
} from "./config";
import { centroid, dist } from "./geo";
import { mulberry32, randInt, randRange } from "./rng";
import type { Point, Territory } from "./types";

const PAD = 72;
const MIN_GAP = 148;

type ShapeKind = "pent" | "hex" | "hept" | "tri" | "kite" | "blob";

const SHAPES: ShapeKind[] = ["pent", "hex", "hept", "tri", "kite", "blob"];

function placeCenters(rng: () => number, n: number): Point[] {
  let gap = MIN_GAP;
  for (let relax = 0; relax < 6; relax++) {
    const pts: Point[] = [];
    for (let i = 0; i < 400 && pts.length < n; i++) {
      const p = {
        x: PAD + rng() * (WORLD_W - PAD * 2),
        y: PAD + rng() * (WORLD_H - PAD * 2),
      };
      if (pts.every((q) => dist(p, q) >= gap)) pts.push(p);
    }
    if (pts.length === n) return pts;
    gap -= 18;
  }
  return fallbackRow(n);
}

function fallbackRow(n: number): Point[] {
  const cols = n > 8 ? 3 : 2;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pts.push({
      x: WORLD_W * (0.16 + col * (0.68 / Math.max(cols - 1, 1))),
      y: 160 + row * 220,
    });
  }
  return pts;
}

function ring(cx: number, cy: number, radii: number[], twist: number): Point[] {
  const n = radii.length;
  return radii.map((r, i) => {
    const a = twist + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

function makeShape(kind: ShapeKind, c: Point, rng: () => number): Point[] {
  const r = BASE_RADIUS;
  if (kind === "pent") {
    return ring(c.x, c.y, [r, r * 0.86, r * 1.04, r * 0.9, r * 0.98], rng() * 0.8);
  }
  if (kind === "hex") {
    return ring(
      c.x,
      c.y,
      [r, r * 0.92, r, r * 0.94, r * 1.02, r * 0.9],
      Math.PI / 6 + rng() * 0.4,
    );
  }
  if (kind === "hept") {
    const radii = Array.from({ length: 7 }, (_, i) => r * (0.84 + ((i * 3) % 5) * 0.04));
    return ring(c.x, c.y, radii, rng() * Math.PI);
  }
  if (kind === "tri") {
    return ring(c.x, c.y, [r * 1.12, r * 0.62, r * 1.08, r * 0.64, r * 1.1, r * 0.6], rng() * 1.2);
  }
  if (kind === "kite") {
    return [
      { x: c.x, y: c.y - r * 1.15 },
      { x: c.x + r * 0.78, y: c.y - r * 0.1 },
      { x: c.x, y: c.y + r * 0.95 },
      { x: c.x - r * 0.78, y: c.y - r * 0.1 },
    ];
  }
  const radii = Array.from({ length: 8 }, () => r * randRange(rng, 0.78, 1.12));
  return ring(c.x, c.y, radii, rng() * Math.PI * 2);
}

function meanRadius(center: Point, poly: Point[]): number {
  return poly.reduce((s, p) => s + dist(center, p), 0) / poly.length;
}

function nearestIds(index: number, centers: Point[], k: number): number[] {
  return centers
    .map((p, id) => ({ id, d: dist(p, centers[index]) }))
    .filter((x) => x.id !== index)
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.id);
}

function farthestPair(centers: Point[]): [number, number] {
  let best: [number, number] = [0, 1];
  let bestD = -1;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const d = dist(centers[i], centers[j]);
      if (d > bestD) {
        bestD = d;
        best = [i, j];
      }
    }
  }
  return best;
}

export function createMap(seed = 20260815): Territory[] {
  const rng = mulberry32(seed);
  const n = randInt(rng, BASE_COUNT_MIN, BASE_COUNT_MAX);
  const centers = placeCenters(rng, n);
  const kinds = [...SHAPES];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }

  const territories: Territory[] = centers.map((c, id) => {
    const poly = makeShape(kinds[id % kinds.length], c, rng);
    const center = centroid(poly);
    return {
      id,
      poly,
      localPoly: poly.map((p) => ({ x: p.x - center.x, y: p.y - center.y })),
      center,
      radius: meanRadius(center, poly),
      owner: "neutral",
      troops: NEUTRAL_TROOPS,
      spawnAcc: 0,
      neighbors: nearestIds(id, centers, 4),
    };
  });

  let [a, b] = farthestPair(centers);
  if (rng() < 0.5) [a, b] = [b, a];
  territories[a].owner = "player";
  territories[a].troops = 0;
  territories[b].owner = "ai";
  territories[b].troops = 0;

  return territories;
}
