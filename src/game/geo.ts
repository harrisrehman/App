import type { Point } from "./types";

export function pointInPoly(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) * 0.5;
}

export function centroid(poly: Point[]): Point {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += cross;
    x += (poly[j].x + poly[i].x) * cross;
    y += (poly[j].y + poly[i].y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 0.0001) {
    const sx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const sy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    return { x: sx, y: sy };
  }
  return { x: x / (6 * a), y: y / (6 * a) };
}

export function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function nearPoint(a: Point, b: Point, eps = 6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export function pathLength(path: Point[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += dist(path[i - 1], path[i]);
  return n;
}

export function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

export function pathHits(path: Point[], p: Point, radius: number): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) return dist(path[0], p) <= radius;
  for (let i = 1; i < path.length; i++) {
    if (distToSeg(p, path[i - 1], path[i]) <= radius) return true;
  }
  return false;
}

export function isClosedLasso(path: Point[]): boolean {
  if (path.length < 8) return false;
  if (dist(path[0], path[path.length - 1]) > 52) return false;
  return pathLength(path) > 140;
}

export function resamplePath(path: Point[], count: number): Point[] {
  if (count < 1) return [];
  if (path.length === 0) return [];
  if (path.length === 1 || count === 1) {
    const mid = path[Math.floor(path.length / 2)];
    return Array.from({ length: count }, () => ({ x: mid.x, y: mid.y }));
  }
  const total = pathLength(path);
  if (total < 1) {
    return Array.from({ length: count }, () => ({ x: path[0].x, y: path[0].y }));
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / Math.max(1, count - 1)) * total;
    let acc = 0;
    let placed = false;
    for (let s = 1; s < path.length; s++) {
      const a = path[s - 1];
      const b = path[s];
      const seg = dist(a, b);
      if (acc + seg >= target || s === path.length - 1) {
        const t = seg < 0.001 ? 0 : (target - acc) / seg;
        const k = Math.max(0, Math.min(1, t));
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        placed = true;
        break;
      }
      acc += seg;
    }
    if (!placed) out.push({ x: path[path.length - 1].x, y: path[path.length - 1].y });
  }
  return out;
}
