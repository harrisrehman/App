import { ARMY_SPEED, FIGHT_RADIUS, POP_CAP, POP_LIFE, SPAWN_INTERVAL, TROOP_CAP } from "./config";
import { dist } from "./geo";
import { createMap } from "./map";
import { mulberry32 } from "./rng";
import type { Army, Owner, Pop, SendRatio, Soldier, Territory, Winner } from "./types";

export function applyArrival(dest: Territory, army: Army, cap = TROOP_CAP): void {
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

let nextSoldierId = 1;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function ejectPath(base: Territory, rng: () => number): {
  from: { x: number; y: number };
  to: { x: number; y: number };
} {
  const rim = Math.max(base.radius, 22);
  const spot = (minR: number, maxR: number) => {
    const angle = rng() * Math.PI * 2;
    const radius = minR + rng() * (maxR - minR);
    return {
      x: base.center.x + Math.cos(angle) * radius,
      y: base.center.y + Math.sin(angle) * radius,
    };
  };
  return {
    from: spot(rim * 0.15, rim * 0.75),
    to: spot(rim * 0.9, rim * 1.55),
  };
}

export class Game {
  territories: Territory[];
  soldiers: Soldier[] = [];
  armies: Army[] = [];
  pops: Pop[] = [];
  selected = new Set<number>();
  sendRatio: SendRatio = 1;
  winner: Winner = null;
  finger: { x: number; y: number } | null = null;
  rng: () => number;

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
    this.seedOwned();
  }

  restart(seed = Date.now()): void {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
    this.soldiers = [];
    this.armies = [];
    this.pops = [];
    this.selected.clear();
    this.winner = null;
    this.finger = null;
    nextSoldierId = 1;
    this.seedOwned();
  }

  private seedOwned(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      this.spawnSoldier(t);
    }
  }

  garrison(id: number): Soldier[] {
    return this.soldiers.filter((s) => s.homeId === id && s.state !== "march");
  }

  incoming(id: number, owner: Owner): number {
    let n = 0;
    for (const s of this.soldiers) {
      if (s.state === "march" && s.toId === id && s.owner === owner) n += 1;
    }
    return n;
  }

  send(fromId: number, toId: number, ratio: number = this.sendRatio): boolean {
    if (this.winner) return false;
    if (fromId === toId) return false;
    const from = this.territories[fromId];
    const to = this.territories[toId];
    if (!from || !to || from.owner === "neutral") return false;

    const pool = this.garrison(fromId);
    const count = Math.floor(pool.length * ratio);
    if (count < 1) return false;

    for (let i = 0; i < count; i++) {
      const s = pool[i];
      s.state = "march";
      s.toId = toId;
    }
    this.syncTroops();
    return true;
  }

  sendSelected(toId: number): boolean {
    let sent = false;
    for (const fromId of [...this.selected]) {
      if (this.send(fromId, toId, 1)) sent = true;
    }
    this.selected.clear();
    return sent;
  }

  update(dt: number): void {
    if (this.winner) {
      this.stepPops(dt);
      return;
    }

    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      if (this.garrison(t.id).length >= TROOP_CAP) continue;
      t.spawnAcc += dt;
      if (t.spawnAcc >= SPAWN_INTERVAL) {
        t.spawnAcc -= SPAWN_INTERVAL;
        this.spawnSoldier(t);
      }
    }

    for (const s of this.soldiers) this.stepSoldier(s, dt);

    const dead = new Set<number>();
    this.clash(dead);
    for (const s of this.soldiers) {
      if (s.state !== "march" || s.toId === null || dead.has(s.id)) continue;
      const dest = this.territories[s.toId];
      if (dist({ x: s.x, y: s.y }, dest.center) > dest.radius * 0.35) continue;
      const keep = this.arrive(s, dest, dead);
      if (!keep) dead.add(s.id);
    }
    if (dead.size) this.soldiers = this.soldiers.filter((s) => !dead.has(s.id));
    this.stepPops(dt);
    this.syncTroops();
    this.checkWinner();
  }

  private clash(dead: Set<number>): void {
    const players: Soldier[] = [];
    const foes: Soldier[] = [];
    for (const s of this.soldiers) {
      if (s.owner === "player") players.push(s);
      else foes.push(s);
    }
    const r2 = FIGHT_RADIUS * FIGHT_RADIUS;
    for (const a of players) {
      if (dead.has(a.id)) continue;
      for (const b of foes) {
        if (dead.has(b.id)) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        dead.add(a.id);
        dead.add(b.id);
        this.addPop((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
        break;
      }
    }
  }

  private addPop(x: number, y: number): void {
    if (this.pops.length >= POP_CAP) {
      const oldest = this.pops[0];
      oldest.x = x;
      oldest.y = y;
      oldest.t = 0;
      this.pops.push(this.pops.shift()!);
      return;
    }
    this.pops.push({ x, y, t: 0 });
  }

  private stepPops(dt: number): void {
    if (this.pops.length === 0) return;
    const keep: Pop[] = [];
    for (const p of this.pops) {
      p.t += dt / POP_LIFE;
      if (p.t < 1) keep.push(p);
    }
    this.pops = keep;
  }

  private spawnSoldier(base: Territory): void {
    if (base.owner === "neutral") return;
    const path = ejectPath(base, this.rng);
    this.soldiers.push({
      id: nextSoldierId++,
      owner: base.owner,
      homeId: base.id,
      x: path.from.x,
      y: path.from.y,
      state: "eject",
      toId: null,
      slot: 0,
      ejectT: 0,
      fromX: path.from.x,
      fromY: path.from.y,
      toX: path.to.x,
      toY: path.to.y,
      poly: base.localPoly.map((p) => ({ x: p.x, y: p.y })),
    });
  }

  private startEject(s: Soldier, base: Territory): void {
    const path = ejectPath(base, this.rng);
    s.homeId = base.id;
    s.toId = null;
    s.state = "eject";
    s.ejectT = 0;
    s.x = path.from.x;
    s.y = path.from.y;
    s.fromX = path.from.x;
    s.fromY = path.from.y;
    s.toX = path.to.x;
    s.toY = path.to.y;
    s.poly = base.localPoly.map((p) => ({ x: p.x, y: p.y }));
  }

  private stepSoldier(s: Soldier, dt: number): void {
    if (s.state === "eject") {
      s.ejectT = Math.min(1, s.ejectT + dt / 1.05);
      const k = easeOutBack(s.ejectT);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.y = s.fromY + (s.toY - s.fromY) * k;
      if (s.ejectT >= 1) s.state = "idle";
      return;
    }

    if (s.state === "march" && s.toId !== null) {
      const dest = this.territories[s.toId];
      const d = dist({ x: s.x, y: s.y }, dest.center);
      if (d < 1) return;
      const step = ARMY_SPEED * dt;
      s.x += ((dest.center.x - s.x) / d) * step;
      s.y += ((dest.center.y - s.y) / d) * step;
      return;
    }

    s.state = "idle";
  }

  private arrive(s: Soldier, dest: Territory, dead: Set<number>): boolean {
    if (dest.owner === s.owner) {
      this.startEject(s, dest);
      return true;
    }

    if (dest.owner === "neutral") {
      dest.troops -= 1;
      if (dest.troops > 0) return false;
      dest.owner = s.owner;
      dest.troops = 0;
      dest.spawnAcc = 0;
      return false;
    }

    const defender = this.garrison(dest.id).find((x) => !dead.has(x.id));
    if (defender) {
      dead.add(defender.id);
      return false;
    }
    dest.owner = s.owner;
    dest.spawnAcc = 0;
    this.startEject(s, dest);
    return true;
  }

  private syncTroops(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      t.troops = this.garrison(t.id).length;
    }
  }

  private checkWinner(): void {
    const playerLand = this.territories.some((t) => t.owner === "player");
    const aiLand = this.territories.some((t) => t.owner === "ai");
    const playerArmy = this.soldiers.some((s) => s.owner === "player");
    const aiArmy = this.soldiers.some((s) => s.owner === "ai");
    if (!aiLand && !aiArmy) this.winner = "player";
    if (!playerLand && !playerArmy) this.winner = "ai";
  }

  totals(): { player: number; ai: number } {
    const sum = { player: 0, ai: 0 };
    for (const s of this.soldiers) sum[s.owner] += 1;
    return sum;
  }
}
