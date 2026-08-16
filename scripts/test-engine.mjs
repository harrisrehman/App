function applyArrival(dest, army, health = 10) {
  if (dest.owner === army.owner) {
    dest.troops += army.count;
    return;
  }
  dest.health -= army.count;
  if (dest.health <= 0) {
    dest.owner = army.owner;
    dest.health = health;
    dest.troops = 0;
  }
}

function takeBase(dest, owner, health = 10) {
  dest.owner = owner;
  dest.health = health;
  dest.troops = 0;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const reinforce = { owner: "player", troops: 10, health: 10 };
applyArrival(reinforce, { owner: "player", count: 5 });
assert(reinforce.troops === 15 && reinforce.owner === "player", "reinforce failed");

const stack = { owner: "ai1", troops: 20, health: 10 };
applyArrival(stack, { owner: "ai1", count: 7 });
assert(stack.troops === 27 && stack.owner === "ai1", "no troop cap failed");

const hold = { owner: "neutral", troops: 0, health: 10 };
applyArrival(hold, { owner: "player", count: 5 });
assert(hold.health === 5 && hold.owner === "neutral", "grey chip failed");

const flip = { owner: "neutral", troops: 0, health: 10 };
applyArrival(flip, { owner: "player", count: 10 });
assert(flip.owner === "player" && flip.troops === 0 && flip.health === 10, "capture start failed");

function reachedBase(s, dest) {
  return Math.hypot(s.x - dest.center.x, s.y - dest.center.y) <= dest.radius;
}
const base = { center: { x: 0, y: 0 }, radius: 40 };
assert(reachedBase({ x: 16, y: 0 }, base), "soldier under base should hit");
assert(reachedBase({ x: 40, y: 0 }, base), "base rim should still hit");
assert(!reachedBase({ x: 50, y: 0 }, base), "far marcher should not hit");

const empty = { owner: "ai1", troops: 0, health: 10 };
takeBase(empty, "player");
assert(empty.owner === "player" && empty.troops === 0 && empty.health === 10, "no free spawn failed");

const siege = { owner: "ai1", troops: 8, health: 10 };
applyArrival(siege, { owner: "player", count: 4 });
assert(siege.owner === "ai1" && siege.health === 6, "owned chip failed");
applyArrival(siege, { owner: "player", count: 6 });
assert(siege.owner === "player" && siege.health === 10 && siege.troops === 0, "owned capture failed");

function walkHome(s, speed = 10) {
  const dx = s.restX - s.x;
  const dy = s.restY - s.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed) {
    s.x = s.restX;
    s.y = s.restY;
    s.state = "idle";
    return;
  }
  s.x += (dx / d) * speed;
  s.y += (dy / d) * speed;
}

const home = { x: 80, y: 20, restX: 10, restY: 10, state: "return" };
walkHome(home, 100);
assert(home.x === 10 && home.y === 10 && home.state === "idle", "return home failed");

function resamplePath(path, count) {
  if (count < 1 || path.length === 0) return [];
  if (path.length === 1 || count === 1) {
    const mid = path[Math.floor(path.length / 2)];
    return Array.from({ length: count }, () => ({ x: mid.x, y: mid.y }));
  }
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const target = (i / Math.max(1, count - 1)) * total;
    let acc = 0;
    for (let s = 1; s < path.length; s++) {
      const a = path[s - 1];
      const b = path[s];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= target || s === path.length - 1) {
        const t = seg < 0.001 ? 0 : (target - acc) / seg;
        const k = Math.max(0, Math.min(1, t));
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        break;
      }
      acc += seg;
    }
  }
  return out;
}

const line = resamplePath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 5);
assert(line.length === 5, "wall count failed");
assert(line[0].x === 0 && line[4].x === 100, "wall ends failed");
assert(Math.abs(line[2].x - 50) < 0.01, "wall mid failed");

function offsetPath(path, amount) {
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

function behindSign(path, from) {
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

function densifyPath(path, step) {
  const out = [{ x: path[0].x, y: path[0].y }];
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

function splitClear(path, blocked, step = 4) {
  const samples = densifyPath(path, step);
  const segs = [];
  let cur = [];
  for (const p of samples) {
    if (blocked(p)) {
      if (cur.length >= 2) segs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

function pointAlongSegments(segs, target) {
  let acc = 0;
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    let len = 0;
    for (let i = 1; i < seg.length; i++) len += dist(seg[i - 1], seg[i]);
    const last = s === segs.length - 1;
    if (!last && acc + len < target) {
      acc += len;
      continue;
    }
    let inner = Math.max(0, target - acc);
    if (inner > len) inner = len;
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
  }
  const last = segs[segs.length - 1];
  return last[last.length - 1];
}

function resampleSegments(segs, count) {
  let total = 0;
  for (const seg of segs) {
    for (let i = 1; i < seg.length; i++) total += dist(seg[i - 1], seg[i]);
  }
  const out = [];
  for (let i = 0; i < count; i++) out.push(pointAlongSegments(segs, (i / Math.max(1, count - 1)) * total));
  return out;
}

function wallSpots(path, count, from, gap, blocked) {
  if (count < 1 || path.length === 0) return [];
  const block = blocked || (() => false);
  const sign = behindSign(path, from);
  const out = [];
  let left = count;
  let rank = 0;
  while (left > 0 && rank < 24) {
    const row = rank === 0 ? path : offsetPath(path, sign * rank * gap);
    const segs = splitClear(row, block);
    let usable = 0;
    for (const seg of segs) {
      for (let i = 1; i < seg.length; i++) usable += dist(seg[i - 1], seg[i]);
    }
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
  return out;
}

const wall = wallSpots([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, { x: 50, y: 20 }, 18);
assert(wall.length === 10, "wall ranks count failed");
assert(wall.slice(0, 6).every((p) => Math.abs(p.y) < 0.01), "first rank not on line");
assert(wall.slice(6).every((p) => Math.abs(p.y - 18) < 0.01), "second rank not behind");
const refill = wallSpots([{ x: 0, y: 0 }, { x: 100, y: 0 }], 6, { x: 50, y: 20 }, 18);
assert(refill.length === 6 && refill.every((p) => Math.abs(p.y) < 0.01), "refill first line first");
const thin = wallSpots([{ x: 0, y: 0 }, { x: 100, y: 0 }], 3, { x: 50, y: 20 }, 18);
assert(thin.length === 3, "thin wall count failed");
assert(Math.abs(thin[0].x) < 0.01 && Math.abs(thin[2].x - 100) < 0.01, "thin wall should spread");
const blocked = (p) => p.x > 80 && p.x < 120;
const clear = wallSpots([{ x: 0, y: 0 }, { x: 200, y: 0 }], 8, { x: 100, y: 20 }, 18, blocked);
assert(clear.length === 8, "clipped wall count failed");
assert(clear.every((p) => !blocked(p)), "wall soldiers overlap a base");

function packAlongSegments(segs, gap, from) {
  let points = [];
  for (const seg of segs) points = points.concat(seg);
  if (points.length < 2) return points.slice();
  if (dist(from, points[0]) > dist(from, points[points.length - 1])) points = points.slice().reverse();
  const out = [{ x: points[0].x, y: points[0].y }];
  let since = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = dist(a, b);
    since += d;
    while (since >= gap - 0.001) {
      since -= gap;
      const t = d < 0.001 ? 1 : 1 - since / d;
      const k = Math.max(0, Math.min(1, t));
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
}

function wallSlotsPacked(path, count, from, gap, blocked) {
  const block = blocked || (() => false);
  const sign = behindSign(path, from);
  const out = [];
  let rank = 0;
  while (out.length < count && rank < 24) {
    const line = rank === 0 ? path : offsetPath(path, sign * rank * gap);
    const packed = packAlongSegments(splitClear(line, block), gap, from);
    for (const p of packed) {
      if (out.length >= count) break;
      out.push(p);
    }
    rank += 1;
  }
  return out;
}

const packed = wallSlotsPacked([{ x: 0, y: 0 }, { x: 200, y: 0 }], 3, { x: 0, y: 20 }, 18);
assert(packed.length === 3, "packed wall count failed");
assert(packed[0].x < 1 && packed[1].x < 20 && packed[2].x < 38, "packed wall should fill nearest end");
assert(packed[2].x < 80, "packed wall should not stretch across the line");
function sendPool(soldiers, fromId) {
  return soldiers.filter((s) => s.homeId === fromId && s.state !== "march" && s.wallId == null);
}
const squad = [
  { homeId: 1, state: "idle", wallId: null },
  { homeId: 1, state: "idle", wallId: 3 },
  { homeId: 1, state: "march", wallId: null },
];
assert(sendPool(squad, 1).length === 1, "send should skip wall soldiers");
for (let i = 0; i < wall.length; i++) {
  for (let j = i + 1; j < wall.length; j++) {
    assert(Math.hypot(wall[i].x - wall[j].x, wall[i].y - wall[j].y) >= 17.9, "wall soldiers overlap");
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 0.0001) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function pathHits(path, p, radius) {
  if (path.length === 0) return false;
  if (path.length === 1) return dist(path[0], p) <= radius;
  for (let i = 1; i < path.length; i++) {
    if (distToSeg(p, path[i - 1], path[i]) <= radius) return true;
  }
  return false;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pathLength(path) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += dist(path[i - 1], path[i]);
  return n;
}

function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) * 0.5;
}

function closePath(path) {
  if (path.length < 2) return path.slice();
  const a = path[0];
  const b = path[path.length - 1];
  if (dist(a, b) < 2) return path.slice();
  return [...path, { x: a.x, y: a.y }];
}

function isClosedLasso(path) {
  if (path.length < 5) return false;
  if (pathLength(path) < 70) return false;
  return polygonArea(closePath(path)) > 1200;
}

const slash = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
assert(pathHits(slash, { x: 40, y: 8 }, 16), "line thru soldier failed");
assert(!pathHits(slash, { x: 40, y: 30 }, 16), "far soldier selected");
const thruEnemy = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
assert(pathHits(thruEnemy, { x: 100, y: 0 }, 30 + 16), "wall thru enemy base");
assert(!pathHits(thruEnemy, { x: 100, y: 80 }, 20 + 16), "wall past enemy base");
assert(pathHits(thruEnemy, { x: 100, y: 60 }, 72), "enemy in wall sense");
assert(!pathHits(thruEnemy, { x: 100, y: 180 }, 72), "far enemy outside wall leash");

const box = [
  { x: 0, y: 0 },
  { x: 80, y: 0 },
  { x: 80, y: 80 },
  { x: 0, y: 80 },
  { x: 0, y: 8 },
  { x: 0, y: 4 },
  { x: 0, y: 2 },
  { x: 0, y: 0 },
];
assert(isClosedLasso(box), "lasso close failed");
assert(pointInPoly(40, 40, box), "lasso inside failed");
assert(!pointInPoly(120, 40, box), "lasso outside failed");

const openC = [
  { x: 0, y: 0 },
  { x: 80, y: 0 },
  { x: 80, y: 80 },
  { x: 0, y: 80 },
  { x: 0, y: 40 },
];
assert(isClosedLasso(openC), "rough circle should auto-close");
const loop = closePath(openC);
assert(pointInPoly(40, 40, loop), "auto-close inside failed");
assert(!pointInPoly(120, 40, loop), "auto-close outside failed");
assert(!isClosedLasso(slash), "line should not become a lasso");

function scatterRest(base, taken, rng, gap = 18) {
  const inner = 48;
  const area = (taken.length + 1) * gap * gap;
  let best = { x: base.x + inner, y: base.y };
  let bestD = -1;
  for (let grow = 0; grow < 8; grow++) {
    const outer = Math.max(inner + 12, Math.sqrt(inner * inner + area / Math.PI)) + grow * gap;
    for (let i = 0; i < 28; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(inner * inner + rng() * Math.max(0, outer * outer - inner * inner));
      const p = { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r };
      let minD = 9999;
      for (const t of taken) minD = Math.min(minD, dist(p, t));
      if (minD >= gap) return p;
      if (minD > bestD) {
        bestD = minD;
        best = p;
      }
    }
  }
  return best;
}

let scatterRng = 7;
function srand() {
  scatterRng = (scatterRng * 1664525 + 1013904223) >>> 0;
  return scatterRng / 4294967296;
}
const cloud = [];
for (let i = 0; i < 24; i++) cloud.push(scatterRest({ x: 0, y: 0 }, cloud, srand));
for (let i = 0; i < cloud.length; i++) {
  for (let j = i + 1; j < cloud.length; j++) {
    assert(dist(cloud[i], cloud[j]) >= 17.5, "scattered soldiers overlap");
  }
}
const xs = cloud.map((p) => p.x);
assert(Math.max(...xs) - Math.min(...xs) > 20, "scatter still a line");

function convertDefense(free, cost = 4) {
  if (free < cost) return { made: 0, free, gunners: 0 };
  return { made: 1, free: free - cost, gunners: 1 };
}

const cheap = convertDefense(3);
assert(cheap.made === 0 && cheap.free === 3, "3 troops should not convert");
const buy = convertDefense(10);
assert(buy.made === 1 && buy.free === 6 && buy.gunners === 1, "4 troops become 1 gunner");
const again = convertDefense(buy.free);
assert(again.made === 1 && again.free === 2, "second convert needs 4 more");

function gunnerSee(perim) {
  return perim * 2;
}
assert(gunnerSee(50) === 100, "gunner see is two perimeters");

function clampInRing(s, home, R) {
  const d = Math.hypot(s.x - home.x, s.y - home.y);
  const inner = Math.max(home.r * 0.72, 18);
  if (d < 0.001) return { x: home.x + inner, y: home.y };
  let rad = d;
  if (d > R) rad = R;
  else if (d < inner) rad = inner;
  else return { x: s.x, y: s.y };
  return {
    x: home.x + ((s.x - home.x) / d) * rad,
    y: home.y + ((s.y - home.y) / d) * rad,
  };
}
const ring = clampInRing({ x: 200, y: 0 }, { x: 0, y: 0, r: 40 }, 80);
assert(Math.abs(Math.hypot(ring.x, ring.y) - 80) < 0.01, "gunner stays in ring");

console.log("engine tests passed");

