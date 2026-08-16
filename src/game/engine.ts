import {
  ARMY_SPEED,
  BASE_HEALTH,
  FIGHT_RADIUS,
  POP_CAP,
  POP_LIFE,
  SPAWN_INTERVAL,
  START_TROOPS,
  ringRadius,
} from "./config";
import { dist } from "./geo";
import { createMap } from "./map";
import { mulberry32 } from "./rng";
import type { Army, Owner, Point, Pop, Soldier, Territory, Winner } from "./types";

export function perimeterRadius(t: Territory): number {
  return ringRadius(t.radius);
}

export function applyArrival(dest: Territory, army: Army): void {
  if (dest.owner === army.owner) {
    dest.troops += army.count;
    return;
  }
  dest.health -= army.count;
  if (dest.health <= 0) {
    dest.owner = army.owner;
    dest.health = BASE_HEALTH;
    dest.troops = 0;
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
  const angle = rng() * Math.PI * 2;
  const rim = Math.max(base.radius, 22);
  const ring = ringRadius(base.radius);
  const startR = rim * 0.88;
  const restR = Math.min(ring - 6, rim + 10 + rng() * 8);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    from: { x: base.center.x + cos * startR, y: base.center.y + sin * startR },
    to: { x: base.center.x + cos * restR, y: base.center.y + sin * restR },
  };
}

export class Game {
  territories: Territory[];
  soldiers: Soldier[] = [];
  armies: Army[] = [];
  pops: Pop[] = [];
  selected = new Set<number>();
  stroke: Point[] = [];
  strokeFade = 0;
  stroking = false;
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
    this.stroke = [];
    this.strokeFade = 0;
    this.stroking = false;
    this.winner = null;
    this.finger = null;
    nextSoldierId = 1;
    this.seedOwned();
  }

  private seedOwned(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      for (let i = 0; i < START_TROOPS; i++) this.spawnSoldier(t);
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

  send(fromId: number, toId: number): boolean {
    if (this.winner) return false;
    if (fromId === toId) return false;
    const from = this.territories[fromId];
    const to = this.territories[toId];
    if (!from || !to || from.owner === "neutral") return false;

    const pool = this.garrison(fromId);
    if (pool.length < 1) return false;

    for (const s of pool) {
      s.state = "march";
      s.toId = toId;
    }
    this.syncTroops();
    return true;
  }

  beginStroke(p: Point): void {
    this.stroke = [{ x: p.x, y: p.y }];
    this.strokeFade = 0;
    this.stroking = true;
  }

  extendStroke(p: Point): void {
    if (!this.stroking) return;
    const last = this.stroke[this.stroke.length - 1];
    if (last && dist(last, p) < 10) return;
    this.stroke.push({ x: p.x, y: p.y });
    if (this.stroke.length > 64) this.stroke.shift();
  }

  endStroke(): void {
    this.stroking = false;
  }

  private stepStroke(dt: number): void {
    if (this.stroking || this.stroke.length === 0) return;
    this.strokeFade += dt / 0.5;
    if (this.strokeFade >= 1) {
      this.stroke = [];
      this.strokeFade = 0;
    }
  }

  sendSelected(toId: number): boolean {
    let sent = false;
    for (const fromId of [...this.selected]) {
      if (this.send(fromId, toId)) sent = true;
    }
    this.selected.clear();
    return sent;
  }

  update(dt: number): void {
    this.stepStroke(dt);
    if (this.winner) {
      this.stepPops(dt);
      return;
    }

    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      t.spawnAcc += dt;
      if (t.spawnAcc >= SPAWN_INTERVAL) {
        t.spawnAcc -= SPAWN_INTERVAL;
        this.spawnSoldier(t);
      }
    }

    this.assignDefense();
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
      restX: path.to.x,
      restY: path.to.y,
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
    s.restX = path.to.x;
    s.restY = path.to.y;
    s.poly = base.localPoly.map((p) => ({ x: p.x, y: p.y }));
  }

  private sendHome(s: Soldier): void {
    s.toId = null;
    s.state = "return";
  }

  private stepSoldier(s: Soldier, dt: number): void {
    if (s.state === "eject") {
      s.ejectT = Math.min(1, s.ejectT + dt / 1.05);
      const k = easeOutBack(s.ejectT);
      s.x = s.fromX + (s.toX - s.fromX) * k;
      s.y = s.fromY + (s.toY - s.fromY) * k;
      if (s.ejectT >= 1) {
        s.x = s.restX;
        s.y = s.restY;
        s.state = "idle";
      }
      return;
    }

    if (s.state === "return") {
      const d = dist({ x: s.x, y: s.y }, { x: s.restX, y: s.restY });
      const step = ARMY_SPEED * dt;
      if (d <= step) {
        s.x = s.restX;
        s.y = s.restY;
        s.state = "idle";
        return;
      }
      s.x += ((s.restX - s.x) / d) * step;
      s.y += ((s.restY - s.y) / d) * step;
      return;
    }

    if (s.state === "defend") {
      const home = this.territories[s.homeId];
      const foes = this.invaders(home);
      let target = foes[0];
      let best = 9999;
      for (const f of foes) {
        const d = dist({ x: s.x, y: s.y }, f);
        if (d < best) {
          best = d;
          target = f;
        }
      }
      if (!target || best < 1) return;
      const step = ARMY_SPEED * dt;
      s.x += ((target.x - s.x) / best) * step;
      s.y += ((target.y - s.y) / best) * step;
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
      dest.health -= 1;
      if (dest.health > 0) return false;
      this.takeBase(dest, s.owner);
      return false;
    }

    if (this.garrison(dest.id).some((x) => !dead.has(x.id))) return true;
    this.takeBase(dest, s.owner);
    return false;
  }

  private takeBase(dest: Territory, owner: Exclude<Owner, "neutral">): void {
    dest.owner = owner;
    dest.spawnAcc = 0;
    dest.health = BASE_HEALTH;
    dest.troops = 0;
  }

  private inPerimeter(t: Territory, p: Point): boolean {
    return dist(p, t.center) <= perimeterRadius(t);
  }

  private invaders(t: Territory): Soldier[] {
    if (t.owner === "neutral") return [];
    const found: Soldier[] = [];
    for (const s of this.soldiers) {
      if (s.owner === t.owner) continue;
      if (this.inPerimeter(t, s)) found.push(s);
    }
    return found;
  }

  private assignDefense(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      const underAttack = this.invaders(t).length > 0;
      for (const s of this.soldiers) {
        if (s.homeId !== t.id || s.state === "march") continue;
        if (underAttack) s.state = "defend";
        else if (s.state === "defend") this.sendHome(s);
      }
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
