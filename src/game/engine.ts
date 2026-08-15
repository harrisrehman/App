import { ARMY_SPEED, SPAWN_INTERVAL, START_TROOPS, TROOP_CAP } from "./config";
import { dist } from "./geo";
import { createMap } from "./map";
import { mulberry32 } from "./rng";
import type { Army, Owner, SendRatio, Soldier, Territory, Winner } from "./types";

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

function slotPos(base: Territory, slot: number, count: number, ring: number): { x: number; y: number } {
  const n = Math.max(count, 1);
  const angle = (slot / n) * Math.PI * 2 - Math.PI / 2;
  const extra = slot % 2 === 0 ? 0 : 10;
  return {
    x: base.center.x + Math.cos(angle) * (ring + extra),
    y: base.center.y + Math.sin(angle) * (ring + extra),
  };
}

export class Game {
  territories: Territory[];
  soldiers: Soldier[] = [];
  armies: Army[] = [];
  selected: number | null = null;
  sendRatio: SendRatio = 0.5;
  winner: Winner = null;
  finger: { x: number; y: number } | null = null;
  rng: () => number;

  constructor(seed = Date.now()) {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
    this.seedGarrisons();
  }

  restart(seed = Date.now()): void {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
    this.soldiers = [];
    this.armies = [];
    this.selected = null;
    this.winner = null;
    this.finger = null;
    nextSoldierId = 1;
    this.seedGarrisons();
  }

  private seedGarrisons(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      t.troops = 0;
      for (let i = 0; i < START_TROOPS; i++) this.spawnSoldier(t, i, START_TROOPS);
    }
    this.syncTroops();
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

    const pool = this.garrison(fromId).sort((a, b) => {
      const rank = (s: Soldier) => (s.state === "gather" ? 0 : s.state === "idle" ? 1 : 2);
      return rank(a) - rank(b);
    });
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

  update(dt: number): void {
    if (this.winner) return;

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
    for (const s of this.soldiers) {
      if (s.state !== "march" || s.toId === null || dead.has(s.id)) continue;
      const dest = this.territories[s.toId];
      if (dist({ x: s.x, y: s.y }, dest.center) > dest.radius * 0.35) continue;
      const keep = this.arrive(s, dest, dead);
      if (!keep) dead.add(s.id);
    }
    if (dead.size) this.soldiers = this.soldiers.filter((s) => !dead.has(s.id));
    this.reseatSlots();
    this.syncTroops();
    this.checkWinner();
  }

  private spawnSoldier(base: Territory, slot?: number, count?: number): void {
    if (base.owner === "neutral") return;
    const garrison = this.garrison(base.id);
    const n = count ?? garrison.length + 1;
    const i = slot ?? garrison.length;
    const rest = slotPos(base, i, n, base.radius + 28);
    const edge = slotPos(base, i, n, base.radius * 0.72);
    this.soldiers.push({
      id: nextSoldierId++,
      owner: base.owner,
      homeId: base.id,
      x: edge.x,
      y: edge.y,
      state: "eject",
      toId: null,
      slot: i,
      ejectT: 0,
      fromX: edge.x,
      fromY: edge.y,
      toX: rest.x,
      toY: rest.y,
    });
  }

  private startEject(s: Soldier, base: Territory): void {
    const rest = slotPos(base, s.slot, Math.max(this.garrison(base.id).length, 1), base.radius + 28);
    const edge = slotPos(base, s.slot, Math.max(this.garrison(base.id).length, 1), base.radius * 0.72);
    s.homeId = base.id;
    s.toId = null;
    s.state = "eject";
    s.ejectT = 0;
    s.x = edge.x;
    s.y = edge.y;
    s.fromX = edge.x;
    s.fromY = edge.y;
    s.toX = rest.x;
    s.toY = rest.y;
  }

  private stepSoldier(s: Soldier, dt: number): void {
    const home = this.territories[s.homeId];
    if (s.state === "eject") {
      s.ejectT = Math.min(1, s.ejectT + dt / 0.42);
      const k = easeOutBack(s.ejectT);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.y = s.fromY + (s.toY - s.fromY) * k;
      if (s.ejectT >= 1) {
        s.state = this.selected === s.homeId && s.owner === "player" ? "gather" : "idle";
      }
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

    const gather = this.selected === s.homeId && s.owner === "player";
    s.state = gather ? "gather" : "idle";
    const ring = gather ? home.radius * 0.42 : home.radius + 28;
    const target = slotPos(home, s.slot, Math.max(this.garrison(home.id).length, 1), ring);
    const d = dist({ x: s.x, y: s.y }, target);
    if (d < 1.2) {
      s.x = target.x;
      s.y = target.y;
      return;
    }
    const step = 260 * dt;
    s.x += ((target.x - s.x) / d) * Math.min(step, d);
    s.y += ((target.y - s.y) / d) * Math.min(step, d);
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
      dest.spawnAcc = 0;
      this.startEject(s, dest);
      return true;
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

  private reseatSlots(): void {
    const groups = new Map<number, Soldier[]>();
    for (const s of this.soldiers) {
      if (s.state === "march") continue;
      const list = groups.get(s.homeId) ?? [];
      list.push(s);
      groups.set(s.homeId, list);
    }
    for (const list of groups.values()) {
      list.forEach((s, i) => {
        s.slot = i;
      });
    }
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
