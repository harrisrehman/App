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

function isClosedLasso(path) {
  if (path.length < 8) return false;
  if (dist(path[0], path[path.length - 1]) > 52) return false;
  return pathLength(path) > 140;
}

const slash = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
assert(pathHits(slash, { x: 40, y: 8 }, 16), "line thru soldier failed");
assert(!pathHits(slash, { x: 40, y: 30 }, 16), "far soldier selected");

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

console.log("engine tests passed");

