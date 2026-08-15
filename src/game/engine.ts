import { ARMY_SPEED, TROOP_CAP } from "./config";
import { dist } from "./geo";
import { createMap } from "./map";
import { mulberry32 } from "./rng";
import type { Army, Owner, SendRatio, Territory, Winner } from "./types";

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

let nextArmyId = 1;

export class Game {
  territories: Territory[];
  armies: Army[] = [];
  selected: number | null = null;
  sendRatio: SendRatio = 0.5;
  winner: Winner = null;
  finger: { x: number; y: number } | null = null;
  rng: () => number;

  constructor(seed = 20260815) {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
  }

  restart(seed = Date.now()): void {
    this.rng = mulberry32(seed);
    this.territories = createMap(seed);
    this.armies = [];
    this.selected = null;
    this.winner = null;
    this.finger = null;
    nextArmyId = 1;
  }

  incoming(id: number, owner: Owner): number {
    let n = 0;
    for (const army of this.armies) {
      if (army.toId === id && army.owner === owner) n += army.count;
    }
    return n;
  }

  send(fromId: number, toId: number, ratio: number = this.sendRatio): boolean {
    if (this.winner) return false;
    if (fromId === toId) return false;
    const from = this.territories[fromId];
    const to = this.territories[toId];
    if (!from || !to) return false;
    if (from.owner === "neutral") return false;
    const count = Math.floor(from.troops * ratio);
    if (count < 1) return false;

    from.troops -= count;
    const d = dist(from.center, to.center);
    const speed = ARMY_SPEED;
    this.armies.push({
      id: nextArmyId++,
      owner: from.owner,
      count,
      x: from.center.x,
      y: from.center.y,
      toId,
      vx: ((to.center.x - from.center.x) / d) * speed,
      vy: ((to.center.y - from.center.y) / d) * speed,
    });
    return true;
  }

  update(dt: number): void {
    if (this.winner) return;

    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      t.troops = Math.min(TROOP_CAP, t.troops + t.income * dt);
    }

    const arrived: Army[] = [];
    const moving: Army[] = [];
    for (const army of this.armies) {
      const dest = this.territories[army.toId];
      army.x += army.vx * dt;
      army.y += army.vy * dt;
      const left = dest.center.x - army.x;
      const down = dest.center.y - army.y;
      if (left * army.vx + down * army.vy <= 0) {
        arrived.push(army);
      } else {
        moving.push(army);
      }
    }
    this.armies = moving;
    for (const army of arrived) this.resolve(army);

    this.checkWinner();
  }

  private resolve(army: Army): void {
    applyArrival(this.territories[army.toId], army);
  }

  private checkWinner(): void {
    const playerLand = this.territories.some((t) => t.owner === "player");
    const aiLand = this.territories.some((t) => t.owner === "ai");
    const playerArmy = this.armies.some((a) => a.owner === "player");
    const aiArmy = this.armies.some((a) => a.owner === "ai");
    if (!aiLand && !aiArmy) this.winner = "player";
    if (!playerLand && !playerArmy) this.winner = "ai";
  }

  totals(): { player: number; ai: number } {
    const sum = { player: 0, ai: 0 };
    for (const t of this.territories) {
      if (t.owner === "player") sum.player += t.troops;
      if (t.owner === "ai") sum.ai += t.troops;
    }
    for (const a of this.armies) sum[a.owner] += a.count;
    return sum;
  }
}
