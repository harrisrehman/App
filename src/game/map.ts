import {
  BASE_COUNT_MAX,
  BASE_COUNT_MIN,
  BASE_RADIUS,
  NEUTRAL_TROOPS,
  START_MIN_DIST,
  START_TROOPS,
  WORLD_H,
  WORLD_W,
} from "./config";
import { centroid, dist } from "./geo";
import { mulberry32, randInt, randRange } from "./rng";
import type { Point, Territory } from "./types";

const PAD = 56;
const MIN_GAP = 126;

type ShapeKind = "pent" | "hex" | "hept" | "tri" | "kite" | "blob";

const SHAPES: ShapeKind[] = ["pent", "hex", "hept", "tri", "kite", "blob"];

function inBounds(): { x0: number; y0: number; w: number; h: number } {
  return { x0: PAD, y0: PAD, w: WORLD_W - PAD * 2, h: WORLD_H - PAD * 2 };
}

function randPoint(rng: () => number, x0: number, y0: number, w: number, h: number): Point {
  return { x: x0 + rng() * w, y: y0 + rng() * h };
}

function minDist(p: Point, pts: Point[]): number {
  let best = 9999;
  for (const q of pts) {
    const d = dist(p, q);
    if (d < best) best = d;
  }
  return best;
}

function placeCenters(rng: () => number, n: number): Point[] {
  const { x0, y0, w, h } = inBounds();
  const pts: Point[] = [];
  const quads = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  for (let i = quads.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [quads[i], quads[j]] = [quads[j], quads[i]];
  }
  for (const [qx, qy] of quads) {
    if (pts.length >= n) break;
    pts.push(randPoint(rng, x0 + qx * w * 0.5, y0 + qy * h * 0.5, w * 0.5, h * 0.5));
  }

  let gap = MIN_GAP;
  for (let relax = 0; relax < 8 && pts.length < n; relax++) {
    for (let i = 0; i < 80 && pts.length < n; i++) {
      let best: Point | null = null;
      let bestD = -1;
      for (let s = 0; s < 18; s++) {
        const p = randPoint(rng, x0, y0, w, h);
        const d = minDist(p, pts);
        if (d >= gap && d > bestD) {
          best = p;
          bestD = d;
        }
      }
      if (best) pts.push(best);
    }
    gap -= 12;
  }

  while (pts.length < n) {
    pts.push(randPoint(rng, x0, y0, w, h));
  }
  return pts.slice(0, n);
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

function pickStarts(centers: Point[], rng: () => number): [number, number] {
  const n = centers.length;
  const pairs: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dist(centers[i], centers[j]);
      if (d >= START_MIN_DIST) pairs.push({ a: i, b: j, d });
    }
  }
  if (pairs.length === 0) {
    let best = { a: 0, b: 1, d: -1 };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = dist(centers[i], centers[j]);
        if (d > best.d) best = { a: i, b: j, d };
      }
    }
    return rng() < 0.5 ? [best.a, best.b] : [best.b, best.a];
  }
  pairs.sort((x, y) => y.d - x.d);
  const cut = Math.max(1, Math.ceil(pairs.length * 0.3));
  const pick = pairs[Math.floor(rng() * cut)];
  return rng() < 0.5 ? [pick.a, pick.b] : [pick.b, pick.a];
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

  const [a, b] = pickStarts(centers, rng);
  territories[a].owner = "player";
  territories[a].troops = START_TROOPS;
  territories[b].owner = "ai";
  territories[b].troops = START_TROOPS;

  return territories;
}
