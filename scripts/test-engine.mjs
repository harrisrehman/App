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

const stack = { owner: "ai", troops: 20, health: 10 };
applyArrival(stack, { owner: "ai", count: 7 });
assert(stack.troops === 27 && stack.owner === "ai", "no troop cap failed");

const hold = { owner: "neutral", troops: 0, health: 10 };
applyArrival(hold, { owner: "player", count: 5 });
assert(hold.health === 5 && hold.owner === "neutral", "grey chip failed");

const flip = { owner: "neutral", troops: 0, health: 10 };
applyArrival(flip, { owner: "player", count: 10 });
assert(flip.owner === "player" && flip.troops === 0 && flip.health === 10, "capture start failed");

const empty = { owner: "ai", troops: 0, health: 10 };
takeBase(empty, "player");
assert(empty.owner === "player" && empty.troops === 0 && empty.health === 10, "no free spawn failed");

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

console.log("engine tests passed");
