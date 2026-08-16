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

export function closePath(path: Point[]): Point[] {
  if (path.length < 2) return path.slice();
  const a = path[0];
  const b = path[path.length - 1];
  if (dist(a, b) < 2) return path.slice();
  return [...path, { x: a.x, y: a.y }];
}

export function isClosedLasso(path: Point[]): boolean {
  if (path.length < 5) return false;
  if (pathLength(path) < 70) return false;
  return polygonArea(closePath(path)) > 1200;
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

export function offsetPath(path: Point[], amount: number): Point[] {
  if (path.length === 0) return [];
  if (path.length === 1) return [{ x: path[0].x, y: path[0].y + amount }];
  return path.map((p, i) => {
    let dx = 0;
    let dy = 0;
    if (i === 0) {
      dx = path[1].x - p.x;
      dy = path[1].y - p.y;
    } else if (i === path.length - 1) {
      dx = p.x - path[i - 1].x;
      dy = p.y - path[i - 1].y;
    } else {
      dx = path[i + 1].x - path[i - 1].x;
      dy = path[i + 1].y - path[i - 1].y;
    }
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (-dy / len) * amount, y: p.y + (dx / len) * amount };
  });
}

export function behindSign(path: Point[], from: Point): number {
  if (path.length === 0) return 1;
  const mid = path[Math.floor(path.length / 2)];
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return (from.x - mid.x) * nx + (from.y - mid.y) * ny >= 0 ? 1 : -1;
}

export function nearPoly(p: Point, poly: Point[], pad: number): boolean {
  if (poly.length === 0) return false;
  if (pointInPoly(p.x, p.y, poly)) return true;
  if (pad <= 0) return false;
  if (poly.length === 1) return dist(p, poly[0]) <= pad;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (distToSeg(p, poly[j], poly[i]) <= pad) return true;
  }
  return false;
}

export function densifyPath(path: Point[], step: number): Point[] {
  if (path.length === 0) return [];
  const out: Point[] = [{ x: path[0].x, y: path[0].y }];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / Math.max(1, step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function splitClear(path: Point[], blocked: (p: Point) => boolean, step = 4): Point[][] {
  const samples = densifyPath(path, step);
  const segs: Point[][] = [];
  let cur: Point[] = [];
  for (const p of samples) {
    if (blocked(p)) {
      if (cur.length >= 2) segs.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

function pointAlongSegments(segs: Point[][], target: number): Point {
  let acc = 0;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    const len = pathLength(seg);
    const last = s === segs.length - 1;
    if (!last && acc + len < target) {
      acc += len;
      continue;
    }
    let inner = Math.max(0, target - acc);
    if (inner > len) inner = len;
    if (seg.length === 0) continue;
    if (seg.length === 1 || len < 0.001) return { x: seg[0].x, y: seg[0].y };
    let walk = 0;
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1];
      const b = seg[i];
      const d = dist(a, b);
      if (walk + d >= inner || i === seg.length - 1) {
        const t = d < 0.001 ? 0 : (inner - walk) / d;
        const k = Math.max(0, Math.min(1, t));
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      walk += d;
    }
    return { x: seg[seg.length - 1].x, y: seg[seg.length - 1].y };
  }
  const last = segs[segs.length - 1];
  const p = last[last.length - 1];
  return { x: p.x, y: p.y };
}

export function resampleSegments(segs: Point[][], count: number): Point[] {
  if (count < 1 || segs.length === 0) return [];
  const total = segs.reduce((n, s) => n + pathLength(s), 0);
  if (total < 1) {
    const p = segs[0][0];
    return Array.from({ length: count }, () => ({ x: p.x, y: p.y }));
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const target = (i / Math.max(1, count - 1)) * total;
    out.push(pointAlongSegments(segs, target));
  }
  return out;
}

export function slideOff(p: Point, blocked: (q: Point) => boolean, max = 88): Point | null {
  if (!blocked(p)) return p;
  for (let r = 6; r <= max; r += 4) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (!blocked(q)) return q;
    }
  }
  return null;
}

export function wallSpots(
  path: Point[],
  count: number,
  from: Point,
  gap: number,
  blocked?: (p: Point) => boolean,
): Point[] {
  if (count < 1 || path.length === 0) return [];
  const block = blocked ?? (() => false);
  const sign = behindSign(path, from);
  const out: Point[] = [];
  let left = count;
  let rank = 0;
  while (left > 0 && rank < 24) {
    const line = rank === 0 ? path : offsetPath(path, sign * rank * gap);
    const segs = splitClear(line, block);
    const usable = segs.reduce((n, s) => n + pathLength(s), 0);
    const cap = usable < 1 ? 0 : Math.max(1, Math.floor(usable / gap) + 1);
    if (cap < 1) {
      rank += 1;
      continue;
    }
    const n = Math.min(left, cap);
    out.push(...resampleSegments(segs, n));
    left -= n;
    rank += 1;
  }
  if (left > 0) {
    for (const p of resamplePath(path, left)) {
      const q = slideOff(p, block);
      if (q) out.push(q);
    }
  }
  return out;
}
