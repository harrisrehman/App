function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const START_MIN_DIST = 640;

function pickStarts(centers, rng, count = 2) {
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
  const [a, b] = pickStarts(centers, rng, 2);
  const d = dist(centers[a], centers[b]);
  assert(d >= START_MIN_DIST * 0.55, `starts too close: ${d}`);
  const many = pickStarts(centers, rng, 5);
  assert(many.length === 5, "need 5 starts");
  assert(new Set(many).size === 5, "starts must be unique");
}

function separate(list, pad = 10) {
  for (let iter = 0; iter < 64; iter++) {
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

const rings = [
  { x: 100, y: 100, r: 62 },
  { x: 120, y: 118, r: 62 },
  { x: 500, y: 500, r: 60 },
];
separate(rings);
assert(dist(rings[0], rings[1]) >= 62 + 62 + 10 - 0.01, "perimeters still overlap");
assert(dist(rings[0], rings[2]) >= 60, "far ring moved too much");

console.log("map tests passed");
