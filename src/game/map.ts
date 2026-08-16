import {
  BASE_COUNT_MAX,
  BASE_COUNT_MIN,
  BASE_GAP,
  BASE_RADIUS,
  NEUTRAL_TROOPS,
  RING_GAP,
  START_MIN_DIST,
  START_TROOPS,
  WORLD_H,
  WORLD_W,
  ringRadius,
  rules,
} from "./config";
import { centroid, dist } from "./geo";
import { mulberry32, randInt, randRange } from "./rng";
import { BOTS, type BotId, type Point, type Territory } from "./types";

const PAD = 96;
const MIN_GAP = BASE_GAP;
const GAP_FLOOR = 2 * ringRadius(BASE_RADIUS * 0.95) + RING_GAP;

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

function tryPlace(rng: () => number, n: number, gap: number): Point[] {
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
    let placed: Point | null = null;
    for (let s = 0; s < 40; s++) {
      const p = randPoint(rng, x0 + qx * w * 0.5, y0 + qy * h * 0.5, w * 0.5, h * 0.5);
      if (pts.length === 0 || minDist(p, pts) >= gap) {
        placed = p;
        break;
      }
    }
    if (placed) pts.push(placed);
  }

  for (let i = 0; i < n * 220 && pts.length < n; i++) {
    const p = randPoint(rng, x0, y0, w, h);
    if (minDist(p, pts) >= gap) pts.push(p);
  }
  return pts;
}

function placeCenters(rng: () => number, n: number): Point[] {
  let gap = MIN_GAP;
  for (let pass = 0; pass < 8; pass++) {
    const pts = tryPlace(rng, n, gap);
    if (pts.length >= n) return pts.slice(0, n);
    gap = Math.max(GAP_FLOOR, gap - 6);
  }
  const packed = tryPlace(rng, n, GAP_FLOOR);
  return packed.length >= 2 ? packed : tryPlace(rng, Math.max(2, n), GAP_FLOOR);
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

function clampCenter(t: Territory, extra: number): void {
  const { x0, y0, w, h } = inBounds();
  t.center.x = Math.min(x0 + w - extra, Math.max(x0 + extra, t.center.x));
  t.center.y = Math.min(y0 + h - extra, Math.max(y0 + extra, t.center.y));
}

function separateBases(list: Territory[]): void {
  const rings = list.map((t) => ringRadius(t.radius));
  for (let iter = 0; iter < 64; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const need = rings[i] + rings[j] + RING_GAP;
        const d = dist(a.center, b.center);
        if (d >= need) continue;
        const nx = d < 0.001 ? 1 : (b.center.x - a.center.x) / d;
        const ny = d < 0.001 ? 0 : (b.center.y - a.center.y) / d;
        const push = (need - Math.max(d, 0.001)) / 2 + 0.6;
        a.center.x -= nx * push;
        a.center.y -= ny * push;
        b.center.x += nx * push;
        b.center.y += ny * push;
        moved = true;
      }
    }
    for (let i = 0; i < list.length; i++) clampCenter(list[i], rings[i]);
    if (!moved) break;
  }
  for (const t of list) {
    t.poly = t.localPoly.map((p) => ({ x: t.center.x + p.x, y: t.center.y + p.y }));
  }
}

function nearestIds(index: number, centers: Point[], k: number): number[] {
  return centers
    .map((p, id) => ({ id, d: dist(p, centers[index]) }))
    .filter((x) => x.id !== index)
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.id);
}

function pickStarts(centers: Point[], rng: () => number, count: number): number[] {
  const n = centers.length;
  const need = Math.min(Math.max(2, count), n);
  const picked = [Math.floor(rng() * n)];
  while (picked.length < need) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      if (picked.includes(i)) continue;
      let minD = 9999;
      for (const p of picked) minD = Math.min(minD, dist(centers[i], centers[p]));
      if (minD > bestScore) {
        bestScore = minD;
        best = i;
      }
    }
    if (best < 0) break;
    picked.push(best);
  }
  if (picked.length >= 2 && dist(centers[picked[0]], centers[picked[1]]) < START_MIN_DIST * 0.55) {
    let far = picked[1];
    let farD = -1;
    for (let i = 0; i < n; i++) {
      if (i === picked[0]) continue;
      const d = dist(centers[picked[0]], centers[i]);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    picked[1] = far;
  }
  return picked;
}

export function createMap(seed = 20260815, bots = 1): Territory[] {
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
      health: rules.baseHealth,
      spawnAcc: 0,
      neighbors: [],
    };
  });

  separateBases(territories);
  const placed = territories.map((t) => t.center);
  for (const t of territories) t.neighbors = nearestIds(t.id, placed, 4);

  const starts = pickStarts(placed, rng, bots + 1);
  const playerId = starts[0];
  territories[playerId].owner = "player";
  territories[playerId].troops = START_TROOPS;
  territories[playerId].health = rules.baseHealth;
  for (let i = 1; i < starts.length; i++) {
    const bot: BotId = BOTS[i - 1] ?? "ai1";
    const id = starts[i];
    territories[id].owner = bot;
    territories[id].troops = START_TROOPS;
    territories[id].health = rules.baseHealth;
  }

  return territories;
}
