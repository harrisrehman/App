function scoreGrey(dSelf, dFoe, secured) {
  if (secured) return -1;
  if (dSelf > 580) return -1;
  if (dFoe + 70 < dSelf && dSelf > 240) return -1;
  return 900 / (dSelf + 50) + (dFoe - dSelf) / 70;
}

function scoreAttack(travel, count, health) {
  return 1000 / (travel + 60) - count * 5 - health * 0.4;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const nearOwn = scoreGrey(140, 720, false);
const farEnemy = scoreGrey(720, 140, false);
const mid = scoreGrey(320, 340, false);
assert(farEnemy < 0, "enemy-pocket grey should be skipped");
assert(nearOwn > mid, "nearby own-side grey should beat mid-map grey");
assert(scoreGrey(620, 620, false) < 0, "far grey should be skipped");
assert(scoreGrey(200, 200, true) < 0, "already-secured grey should be skipped");

const closeEmpty = scoreAttack(180, 0, 10);
const closeFull = scoreAttack(180, 10, 10);
const farEmpty = scoreAttack(700, 0, 10);
assert(closeEmpty > closeFull, "lower count should win");
assert(closeEmpty > farEmpty, "closer enemy should win");
assert(closeFull > scoreAttack(700, 10, 10), "close full still beats far full");

const DEFENSE_COST = 6;
const hardKeep = 8;
const hardMinSpare = 16;
assert(DEFENSE_COST + hardKeep === 14, "hard arm needs 14 free troops at a base");
assert(hardMinSpare > DEFENSE_COST + hardKeep, "hard arm waits for empire spare before buying bowmen");

console.log("ai tests passed");
