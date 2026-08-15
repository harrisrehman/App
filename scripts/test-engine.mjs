function applyArrival(dest, army, cap = 80) {
  if (dest.owner === army.owner) {
    dest.troops = Math.min(cap, dest.troops + army.count);
    return;
  }
  dest.troops -= army.count;
  if (dest.troops < 0) {
    dest.owner = army.owner;
    dest.troops = Math.min(cap, Math.abs(dest.troops));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const reinforce = { owner: "player", troops: 10 };
applyArrival(reinforce, { owner: "player", count: 5 });
assert(reinforce.troops === 15 && reinforce.owner === "player", "reinforce failed");

const hold = { owner: "ai", troops: 12 };
applyArrival(hold, { owner: "player", count: 5 });
assert(hold.troops === 7 && hold.owner === "ai", "hold failed");

const flip = { owner: "neutral", troops: 8 };
applyArrival(flip, { owner: "player", count: 11 });
assert(flip.owner === "player" && flip.troops === 3, "capture failed");

console.log("engine tests passed");
