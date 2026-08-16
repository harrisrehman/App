function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const START_MIN_DIST = 640;

function pickStarts(centers, rng) {
  const n = centers.length;
  const pairs = [];
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
    return [best.a, best.b];
  }
  pairs.sort((x, y) => y.d - x.d);
  const cut = Math.max(1, Math.ceil(pairs.length * 0.3));
  const pick = pairs[Math.floor(rng() * cut)];
  return [pick.a, pick.b];
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let rngState = 1;
function rng() {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
}

for (let t = 0; t < 40; t++) {
  const centers = [];
  for (let i = 0; i < 16; i++) {
    centers.push({ x: 80 + rng() * 840, y: 80 + rng() * 1440 });
  }
  const [a, b] = pickStarts(centers, rng);
  const d = dist(centers[a], centers[b]);
  assert(d >= START_MIN_DIST, `starts too close: ${d}`);
}

function separate(list, pad = 12) {
  for (let iter = 0; iter < 48; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const need = a.r + b.r + pad;
        const d = dist(a, b);
        if (d >= need) continue;
        const nx = d < 0.001 ? 1 : (b.x - a.x) / d;
        const ny = d < 0.001 ? 0 : (b.y - a.y) / d;
        const push = (need - Math.max(d, 0.001)) / 2 + 0.6;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

const blobs = [
  { x: 100, y: 100, r: 46 },
  { x: 110, y: 108, r: 46 },
  { x: 400, y: 400, r: 40 },
];
separate(blobs);
assert(dist(blobs[0], blobs[1]) >= 46 + 46 + 12 - 0.01, "bases still overlap");
assert(dist(blobs[0], blobs[2]) >= 40, "far base moved too much");

console.log("map tests passed");
