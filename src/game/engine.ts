import {
  ARMY_SPEED,
  FIGHT_RADIUS,
  POP_CAP,
  POP_LIFE,
  SOLDIER_GAP,
  START_TROOPS,
  SPAWN_INTERVAL,
  DEFENSE_COST,
  DEFENSE_FIRE,
  DEFENSE_HIT,
  DEFENSE_SHOT_SPEED,
  GUNNER_CLOSE,
  GUNNER_ORBIT,
  GUNNER_STEER,
  WALL_BASE_PAD,
  WALL_LEASH,
  WALL_SENSE,
  ringRadius,
  rules,
} from "./config";
import {
  behindSign,
  closePath,
  densifyPath,
  dist,
  isClosedLasso,
  nearPoly,
  offsetPath,
  pathHits,
  pathLength,
  pointInPoly,
  wallSpots,
} from "./geo";
import { createMap } from "./map";
import { mulberry32 } from "./rng";
import {
  isBot,
  type Army,
  type Faction,
  type Owner,
  type Point,
  type Pop,
  type SendFilter,
  type Shot,
  type Soldier,
  type Territory,
  type Wall,
  type Winner,
} from "./types";

export function perimeterRadius(t: Territory): number {
  return ringRadius(t.radius);
}

export function reachedBase(x: number, y: number, dest: Territory): boolean {
  if (dist({ x, y }, dest.center) <= dest.radius) return true;
  return pointInPoly(x, y, dest.poly);
}

export function applyArrival(dest: Territory, army: Army): void {
  if (dest.owner === army.owner) {
    dest.troops += army.count;
    return;
  }
  dest.health -= army.count;
  if (dest.health <= 0) {
    dest.owner = army.owner;
    dest.health = rules.baseHealth;
    dest.troops = 0;
  }
}

let nextSoldierId = 1;
let nextWallId = 1;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function spinPoly(poly: Point[], angle: number): Point[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return poly.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
}

function scatterRest(base: Territory, taken: Point[], rng: () => number): Point {
  const rim = Math.max(base.radius, 22);
  const inner = Math.min(ringRadius(base.radius) - 4, rim + 8);
  const area = (taken.length + 1) * SOLDIER_GAP * SOLDIER_GAP;
  const inner2 = inner * inner;
  let best = { x: base.center.x + inner, y: base.center.y };
  let bestD = -1;
  for (let grow = 0; grow < 8; grow++) {
    const outer = Math.max(inner + 12, Math.sqrt(inner2 + area / Math.PI)) + grow * SOLDIER_GAP;
    const outer2 = outer * outer;
    for (let i = 0; i < 28; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(inner2 + rng() * Math.max(0, outer2 - inner2));
      const p = { x: base.center.x + Math.cos(a) * r, y: base.center.y + Math.sin(a) * r };
      let minD = 9999;
      for (const t of taken) minD = Math.min(minD, dist(p, t));
      if (minD >= SOLDIER_GAP) return p;
      if (minD > bestD) {
        bestD = minD;
        best = p;
      }
    }
  }
  return best;
}

function ejectPath(
  base: Territory,
  taken: Point[],
  rng: () => number,
): { from: Point; to: Point } {
  const to = scatterRest(base, taken, rng);
  const dx = to.x - base.center.x;
  const dy = to.y - base.center.y;
  const d = Math.hypot(dx, dy) || 1;
  const rim = Math.max(base.radius, 22) * 0.88;
  return {
    from: { x: base.center.x + (dx / d) * rim, y: base.center.y + (dy / d) * rim },
    to,
  };
}

export class Game {
  territories: Territory[];
  soldiers: Soldier[] = [];
  shots: Shot[] = [];
  armies: Army[] = [];
  pops: Pop[] = [];
  selected = new Set<number>();
  picked = new Set<number>();
  walls: Wall[] = [];
  notice: string | null = null;
  stroke: Point[] = [];
  strokeFade = 0;
  stroking = false;
  wallMode = false;
  bots = 1;
  winner: Winner = null;
  finger: { x: number; y: number } | null = null;
  clock = 0;
  sendFilter: SendFilter = "all";
  rng: () => number;

  constructor(seed = Date.now(), bots = 1) {
    this.bots = Math.max(1, Math.min(4, bots));
    this.rng = mulberry32(seed);
    this.territories = createMap(seed, this.bots);
    this.seedOwned();
  }

  restart(seed = Date.now(), bots = this.bots): void {
    this.bots = Math.max(1, Math.min(4, bots));
    this.rng = mulberry32(seed);
    this.territories = createMap(seed, this.bots);
    this.soldiers = [];
    this.shots = [];
    this.armies = [];
    this.pops = [];
    this.selected.clear();
    this.picked.clear();
    this.walls = [];
    this.notice = null;
    this.stroke = [];
    this.strokeFade = 0;
    this.stroking = false;
    this.wallMode = false;
    this.winner = null;
    this.finger = null;
    this.clock = 0;
    this.sendFilter = "all";
    nextSoldierId = 1;
    nextWallId = 1;
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

  freeGarrison(id: number): Soldier[] {
    return this.garrison(id).filter((s) => s.wallId == null && s.kind !== "gunner");
  }

  matchesFilter(s: Soldier, filter: SendFilter = this.sendFilter): boolean {
    if (filter === "all") return true;
    if (filter === "gunner") return s.kind === "gunner";
    return s.kind === "troop";
  }

  sendPool(id: number, filter: SendFilter = this.sendFilter): Soldier[] {
    return this.garrison(id).filter((s) => s.wallId == null && this.matchesFilter(s, filter));
  }

  setSendFilter(filter: SendFilter): void {
    this.sendFilter = filter;
  }

  selectByFilter(): void {
    this.clearSelection();
    for (const t of this.territories) {
      if (t.owner !== "player") continue;
      if (this.sendPool(t.id).length > 0) this.selected.add(t.id);
    }
    if (this.sendFilter === "gunner") return;
    for (const s of this.soldiers) {
      if (s.owner !== "player" || s.wallId == null || s.state === "march") continue;
      if (this.matchesFilter(s)) this.picked.add(s.id);
    }
  }

  canBuyDefense(): boolean {
    for (const id of this.selected) {
      const t = this.territories[id];
      if (!t || t.owner !== "player") continue;
      if (this.freeGarrison(id).length >= DEFENSE_COST) return true;
    }
    return false;
  }

  buyDefense(): number {
    if (this.winner) return 0;
    let made = 0;
    for (const id of [...this.selected]) {
      const t = this.territories[id];
      if (!t || t.owner !== "player") continue;
      const pool = this.freeGarrison(id).filter((s) => s.state !== "march");
      if (pool.length < DEFENSE_COST) continue;
      const take = pool.slice(0, DEFENSE_COST);
      const ids = new Set(take.map((s) => s.id));
      this.soldiers = this.soldiers.filter((s) => !ids.has(s.id));
      this.spawnGunner(t);
      made += 1;
    }
    this.syncTroops();
    return made;
  }

  clearSelection(): void {
    this.selected.clear();
    this.picked.clear();
  }

  wallPickCount(): number {
    const seen = new Set<number>();
    let n = 0;
    for (const id of this.selected) {
      for (const s of this.freeGarrison(id)) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        n += 1;
      }
    }
    for (const id of this.picked) {
      if (seen.has(id)) continue;
      const s = this.soldiers.find((x) => x.id === id);
      if (!s || s.state === "march" || s.owner !== "player" || s.kind === "gunner") continue;
      seen.add(id);
      n += 1;
    }
    return n;
  }

  hasWallPick(): boolean {
    return this.wallPickCount() > 0;
  }

  incoming(id: number, owner: Owner): number {
    let n = 0;
    for (const s of this.soldiers) {
      if (s.state === "march" && s.toId === id && s.owner === owner) n += 1;
    }
    return n;
  }

  incomingElse(id: number, owner: Owner): number {
    let n = 0;
    for (const s of this.soldiers) {
      if (s.state === "march" && s.toId === id && s.owner !== owner) n += 1;
    }
    return n;
  }

  send(fromId: number, toId: number, filter: SendFilter = "all"): boolean {
    if (this.winner) return false;
    if (fromId === toId) return false;
    const from = this.territories[fromId];
    const to = this.territories[toId];
    if (!from || !to || from.owner === "neutral") return false;

    const pool = this.sendPool(fromId, filter);
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
    if (this.stroke.length > 256) this.stroke.shift();
  }

  selectFromStroke(path: Point[]): void {
    this.clearSelection();
    if (path.length < 1) return;
    const loop = closePath(path);
    const closed = isClosedLasso(path);
    const hit = (p: Point, radius: number): boolean =>
      pathHits(path, p, radius) || (closed && pointInPoly(p.x, p.y, loop));
    for (const s of this.soldiers) {
      if (s.owner !== "player") continue;
      if (!this.matchesFilter(s)) continue;
      if (!hit({ x: s.x, y: s.y }, 16)) continue;
      if (s.wallId != null) this.picked.add(s.id);
      else this.selected.add(s.homeId);
    }
    for (const t of this.territories) {
      if (t.owner !== "player") continue;
      if (hit(t.center, t.radius * 0.55)) this.selected.add(t.id);
    }
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

  pullNotice(): string | null {
    const text = this.notice;
    this.notice = null;
    return text;
  }

  formWall(path: Point[]): boolean {
    if (this.winner) return false;
    if (pathLength(path) < 28) return false;
    if (this.pathHitsEnemy(path)) {
      this.notice = "You can't make walls through enemy bases.";
      return false;
    }
    const pool = this.wallPool();
    if (pool.length < 1) return false;
    const from = {
      x: pool.reduce((n, s) => n + s.x, 0) / pool.length,
      y: pool.reduce((n, s) => n + s.y, 0) / pool.length,
    };
    const wall: Wall = {
      id: nextWallId++,
      owner: "player",
      path: path.map((p) => ({ x: p.x, y: p.y })),
      from,
      spots: [],
    };
    this.walls.push(wall);
    for (const s of pool) s.wallId = wall.id;
    wall.spots = wallSpots(wall.path, pool.length, wall.from, SOLDIER_GAP, (p) => this.hitsBase(p));
    for (const s of pool) {
      s.toId = null;
      s.state = "return";
    }
    this.guideWall(wall);
    this.wallMode = false;
    this.clearSelection();
    return true;
  }

  sendSelected(toId: number): boolean {
    let sent = false;
    for (const fromId of [...this.selected]) {
      if (this.send(fromId, toId, this.sendFilter)) sent = true;
    }
    for (const sid of [...this.picked]) {
      if (this.sendSoldier(sid, toId)) sent = true;
    }
    this.pruneWalls();
    this.clearSelection();
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

    this.clock += dt;
    this.assignDefense();
    this.assignGunnerAims();
    this.guideWalls();
    for (const s of this.soldiers) this.stepSoldier(s, dt);

    const dead = new Set<number>();
    this.stepShots(dt, dead);
    this.clash(dead);
    for (const s of this.soldiers) {
      if (s.state !== "march" || s.toId === null || dead.has(s.id)) continue;
      const dest = this.territories[s.toId];
      if (!reachedBase(s.x, s.y, dest)) continue;
      const keep = this.arrive(s, dest, dead);
      if (!keep) dead.add(s.id);
    }
    if (dead.size) {
      this.soldiers = this.soldiers.filter((s) => !dead.has(s.id));
      this.pruneWalls();
    }
    this.stepPops(dt);
    this.syncTroops();
    this.checkWinner();
  }

  private clash(dead: Set<number>): void {
    const live = this.soldiers;
    const r2 = FIGHT_RADIUS * FIGHT_RADIUS;
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (dead.has(a.id)) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (dead.has(b.id) || a.owner === b.owner) continue;
        if (!this.canClash(a) || !this.canClash(b)) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > r2) continue;
        a.hp -= 1;
        b.hp -= 1;
        this.addPop((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
        if (a.hp <= 0) dead.add(a.id);
        if (b.hp <= 0) dead.add(b.id);
        if (a.hp <= 0) break;
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

  private restTaken(homeId: number, skipId?: number): Point[] {
    const out: Point[] = [];
    for (const s of this.soldiers) {
      if (s.homeId !== homeId || s.state === "march" || s.wallId != null) continue;
      if (skipId !== undefined && s.id === skipId) continue;
      out.push({ x: s.restX, y: s.restY });
    }
    return out;
  }

  private spawnSoldier(base: Territory): void {
    if (base.owner === "neutral") return;
    const path = ejectPath(base, this.restTaken(base.id), this.rng);
    this.soldiers.push({
      id: nextSoldierId++,
      owner: base.owner,
      homeId: base.id,
      wallId: null,
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
      hp: rules.soldierHealth,
      poly: spinPoly(base.localPoly, this.rng() * Math.PI * 2),
      kind: "troop",
      shootAcc: 0,
      aimId: null,
    });
  }

  private spawnGunner(base: Territory): void {
    if (base.owner === "neutral") return;
    const path = ejectPath(base, this.restTaken(base.id), this.rng);
    this.soldiers.push({
      id: nextSoldierId++,
      owner: base.owner as Faction,
      homeId: base.id,
      wallId: null,
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
      hp: rules.soldierHealth,
      poly: spinPoly(base.localPoly, this.rng() * Math.PI * 2),
      kind: "gunner",
      shootAcc: 0,
      aimId: null,
    });
  }

  private startEject(s: Soldier, base: Territory): void {
    const path = ejectPath(base, this.restTaken(base.id, s.id), this.rng);
    s.homeId = base.id;
    s.wallId = null;
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
    s.hp = rules.soldierHealth;
    s.poly = spinPoly(base.localPoly, this.rng() * Math.PI * 2);
    if (!s.kind) s.kind = "troop";
    s.shootAcc = s.shootAcc ?? 0;
    s.aimId = null;
  }

  applyRules(): void {
    for (const t of this.territories) {
      if (t.health > rules.baseHealth) t.health = rules.baseHealth;
    }
    for (const s of this.soldiers) s.hp = rules.soldierHealth;
  }

  private sendHome(s: Soldier): void {
    s.toId = null;
    s.state = "return";
  }

  private gunnersAt(homeId: number): Soldier[] {
    return this.soldiers
      .filter((s) => s.kind === "gunner" && s.homeId === homeId && s.state !== "eject" && s.state !== "march")
      .sort((a, b) => a.id - b.id);
  }

  private foesInSight(home: Territory, owner: Faction): Soldier[] {
    const see = perimeterRadius(home) * 2;
    const found: Soldier[] = [];
    for (const o of this.soldiers) {
      if (o.owner === owner) continue;
      if (dist(o, home.center) > see) continue;
      found.push(o);
    }
    return found;
  }

  private assignGunnerAims(): void {
    const homes = new Set<number>();
    for (const s of this.soldiers) {
      if (s.kind !== "gunner") continue;
      s.aimId = null;
      if (s.state === "eject" || s.state === "march") continue;
      homes.add(s.homeId);
    }
    for (const homeId of homes) {
      const home = this.territories[homeId];
      const guns = this.gunnersAt(homeId);
      if (!home || guns.length === 0) continue;
      const foes = this.foesInSight(home, guns[0].owner);
      const taken = new Set<number>();
      for (const g of guns) {
        let best: Soldier | null = null;
        let bestD = 9999;
        for (const f of foes) {
          if (taken.has(f.id)) continue;
          const d = dist(g, f);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
        if (!best) {
          bestD = 9999;
          for (const f of foes) {
            const d = dist(g, f);
            if (d < bestD) {
              bestD = d;
              best = f;
            }
          }
        }
        if (best) {
          taken.add(best.id);
          g.aimId = best.id;
        }
      }
    }
  }

  private orbitSpot(s: Soldier, home: Territory): Point {
    const crew = this.gunnersAt(s.homeId);
    const i = Math.max(0, crew.findIndex((g) => g.id === s.id));
    const n = Math.max(1, crew.length);
    const R = perimeterRadius(home);
    const ang = this.clock * GUNNER_ORBIT + (i / n) * Math.PI * 2;
    return {
      x: home.center.x + Math.cos(ang) * R,
      y: home.center.y + Math.sin(ang) * R,
    };
  }

  private clampInRing(s: Soldier, home: Territory): void {
    const R = perimeterRadius(home);
    const d = dist(s, home.center);
    const inner = Math.max(home.radius * 0.72, 18);
    if (d < 0.001) {
      s.x = home.center.x + inner;
      s.y = home.center.y;
      return;
    }
    let rad = d;
    if (d > R) rad = R;
    else if (d < inner) rad = inner;
    else return;
    s.x = home.center.x + ((s.x - home.center.x) / d) * rad;
    s.y = home.center.y + ((s.y - home.center.y) / d) * rad;
  }

  private soldierVel(s: Soldier): Point {
    if (s.state === "march" && s.toId !== null) {
      const dest = this.territories[s.toId];
      if (dest) {
        const d = dist(s, dest.center) || 1;
        return {
          x: ((dest.center.x - s.x) / d) * ARMY_SPEED,
          y: ((dest.center.y - s.y) / d) * ARMY_SPEED,
        };
      }
    }
    if (s.state === "return") {
      const d = dist(s, { x: s.restX, y: s.restY }) || 1;
      return {
        x: ((s.restX - s.x) / d) * ARMY_SPEED,
        y: ((s.restY - s.y) / d) * ARMY_SPEED,
      };
    }
    return { x: 0, y: 0 };
  }

  private fireShot(from: Soldier, to: Soldier): void {
    const v = this.soldierVel(to);
    const range = dist(from, to);
    const eta = range / DEFENSE_SHOT_SPEED;
    const ax = to.x + v.x * eta;
    const ay = to.y + v.y * eta;
    const d = Math.hypot(ax - from.x, ay - from.y) || 1;
    this.shots.push({
      x: from.x,
      y: from.y,
      vx: ((ax - from.x) / d) * DEFENSE_SHOT_SPEED,
      vy: ((ay - from.y) / d) * DEFENSE_SHOT_SPEED,
      owner: from.owner,
      life: 1.4,
      toId: to.id,
    });
  }

  private stepGunner(s: Soldier, dt: number): void {
    const home = this.territories[s.homeId];
    if (!home || home.owner !== s.owner) return;
    const foe = s.aimId != null ? this.soldiers.find((o) => o.id === s.aimId) ?? null : null;
    const close = foe != null && dist(s, foe) <= GUNNER_CLOSE;
    const step = ARMY_SPEED * dt;
    if (close && foe) {
      const dx = s.x - foe.x;
      const dy = s.y - foe.y;
      const d = Math.hypot(dx, dy) || 1;
      s.x += (dx / d) * step;
      s.y += (dy / d) * step;
      s.state = "defend";
      this.clampInRing(s, home);
    } else {
      const spot = this.orbitSpot(s, home);
      const d = dist(s, spot);
      if (d <= step) {
        s.x = spot.x;
        s.y = spot.y;
      } else {
        s.x += ((spot.x - s.x) / d) * step;
        s.y += ((spot.y - s.y) / d) * step;
      }
      s.state = foe ? "defend" : "idle";
    }
    s.shootAcc += dt;
    if (foe && s.shootAcc >= DEFENSE_FIRE && this.inPerimeter(home, s)) {
      s.shootAcc = 0;
      this.fireShot(s, foe);
    }
  }

  private steerShot(shot: Shot, dt: number): void {
    if (shot.toId == null) return;
    const target = this.soldiers.find((s) => s.id === shot.toId && s.owner !== shot.owner);
    if (!target) return;
    const d = dist(shot, target) || 1;
    const tvx = ((target.x - shot.x) / d) * DEFENSE_SHOT_SPEED;
    const tvy = ((target.y - shot.y) / d) * DEFENSE_SHOT_SPEED;
    const k = Math.min(1, GUNNER_STEER * dt);
    shot.vx += (tvx - shot.vx) * k;
    shot.vy += (tvy - shot.vy) * k;
    const sp = Math.hypot(shot.vx, shot.vy) || 1;
    shot.vx = (shot.vx / sp) * DEFENSE_SHOT_SPEED;
    shot.vy = (shot.vy / sp) * DEFENSE_SHOT_SPEED;
  }

  private hitSoldier(s: Soldier, dead: Set<number>): void {
    s.hp -= 1;
    this.addPop(s.x, s.y);
    if (s.hp <= 0) dead.add(s.id);
  }

  private stepShots(dt: number, dead: Set<number>): void {
    const keep: Shot[] = [];
    for (const shot of this.shots) {
      this.steerShot(shot, dt);
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0) continue;
      const aimed = shot.toId != null ? this.soldiers.find((s) => s.id === shot.toId) : undefined;
      if (aimed && !dead.has(aimed.id) && aimed.owner !== shot.owner && dist(shot, aimed) <= DEFENSE_HIT) {
        this.hitSoldier(aimed, dead);
        continue;
      }
      let hit = false;
      for (const s of this.soldiers) {
        if (dead.has(s.id) || s.owner === shot.owner) continue;
        if (dist(shot, s) > DEFENSE_HIT) continue;
        this.hitSoldier(s, dead);
        hit = true;
        break;
      }
      if (!hit) keep.push(shot);
    }
    this.shots = keep;
  }

  private stepSoldier(s: Soldier, dt: number): void {
    if (s.kind === "gunner" && s.state !== "eject" && s.state !== "march") {
      this.stepGunner(s, dt);
      return;
    }
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
      const foes = this.defendFoes(s);
      let target = foes[0];
      let best = 9999;
      for (const f of foes) {
        const d = dist({ x: s.x, y: s.y }, f);
        if (d < best) {
          best = d;
          target = f;
        }
      }
      if (!target) {
        if (s.wallId != null) this.sendHome(s);
        return;
      }
      if (s.wallId != null) {
        const wall = this.walls.find((w) => w.id === s.wallId);
        if (wall) {
          const ranks = this.wallRanks(wall, this.wallCrew(wall).length);
          if (!this.nearWall(wall, target, WALL_LEASH, ranks)) {
            this.sendHome(s);
            return;
          }
        }
      }
      if (best < 1) return;
      const step = ARMY_SPEED * dt;
      s.x += ((target.x - s.x) / best) * step;
      s.y += ((target.y - s.y) / best) * step;
      return;
    }

    if (s.state === "march" && s.toId !== null) {
      const dest = this.territories[s.toId];
      if (reachedBase(s.x, s.y, dest)) {
        s.x = dest.center.x;
        s.y = dest.center.y;
        return;
      }
      const d = dist({ x: s.x, y: s.y }, dest.center);
      if (d < 1) {
        s.x = dest.center.x;
        s.y = dest.center.y;
        return;
      }
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

    dest.health -= 1;
    if (dest.health > 0) return false;
    this.takeBase(dest, s.owner, dead);
    return false;
  }

  private takeBase(dest: Territory, owner: Faction, dead: Set<number>): void {
    dest.owner = owner;
    dest.spawnAcc = 0;
    dest.health = rules.baseHealth;
    dest.troops = 0;
    for (const s of this.soldiers) {
      if (s.homeId === dest.id && s.state !== "march") dead.add(s.id);
    }
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

  private wallCrew(wall: Wall): Soldier[] {
    return this.soldiers.filter((s) => s.wallId === wall.id && s.state !== "march");
  }

  private wallRanks(wall: Wall, count: number): number {
    const perLine = Math.max(1, Math.floor(pathLength(wall.path) / SOLDIER_GAP) + 1);
    return Math.max(1, Math.ceil(count / perLine));
  }

  private nearWall(wall: Wall, p: Point, pad: number, ranks: number): boolean {
    if (pathHits(wall.path, p, pad)) return true;
    const sign = behindSign(wall.path, wall.from);
    for (let r = 1; r < ranks; r++) {
      if (pathHits(offsetPath(wall.path, sign * r * SOLDIER_GAP), p, pad)) return true;
    }
    return false;
  }

  private wallThreats(wall: Wall): Soldier[] {
    const crew = this.wallCrew(wall);
    if (crew.length === 0) return [];
    const ranks = this.wallRanks(wall, crew.length);
    const found: Soldier[] = [];
    for (const s of this.soldiers) {
      if (s.owner === wall.owner) continue;
      if (this.nearWall(wall, s, WALL_SENSE, ranks)) {
        found.push(s);
        continue;
      }
      if (!this.nearWall(wall, s, WALL_LEASH, ranks)) continue;
      for (const w of crew) {
        if (w.state !== "defend") continue;
        if (dist(s, w) <= FIGHT_RADIUS * 2) {
          found.push(s);
          break;
        }
      }
    }
    return found;
  }

  private defendFoes(s: Soldier): Soldier[] {
    if (s.wallId != null) {
      const wall = this.walls.find((w) => w.id === s.wallId);
      return wall ? this.wallThreats(wall) : [];
    }
    const home = this.territories[s.homeId];
    return home ? this.invaders(home) : [];
  }

  private canClash(s: Soldier): boolean {
    if (s.wallId == null) return true;
    return s.state !== "return" && s.state !== "eject";
  }

  private wallPosted(s: Soldier): boolean {
    if (s.wallId == null) return true;
    return s.state === "idle" || s.state === "defend";
  }

  private pathHitsEnemy(path: Point[]): boolean {
    for (const t of this.territories) {
      if (t.owner === "neutral" || t.owner === "player") continue;
      if (pathHits(path, t.center, t.radius + WALL_BASE_PAD)) return true;
      for (const p of densifyPath(path, 6)) {
        if (nearPoly(p, t.poly, WALL_BASE_PAD)) return true;
      }
    }
    return false;
  }

  private hitsBase(p: Point): boolean {
    for (const t of this.territories) {
      if (dist(p, t.center) <= t.radius + WALL_BASE_PAD) return true;
      if (nearPoly(p, t.poly, WALL_BASE_PAD)) return true;
    }
    return false;
  }

  private nearestSlot(spots: Point[], used: Set<number>, p: Point): number {
    let best = -1;
    let bestD = 9999;
    for (let i = 0; i < spots.length; i++) {
      if (used.has(i)) continue;
      const d = dist(p, spots[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private guideWall(wall: Wall): void {
    const crew = this.wallCrew(wall);
    if (crew.length === 0) return;
    if (wall.spots.length === 0) {
      wall.spots = wallSpots(wall.path, crew.length, wall.from, SOLDIER_GAP, (p) => this.hitsBase(p));
    }
    const used = new Set<number>();
    for (const s of crew) {
      if (s.state !== "idle" && s.state !== "defend") continue;
      const i = this.nearestSlot(wall.spots, used, { x: s.restX, y: s.restY });
      if (i >= 0) used.add(i);
    }
    const incoming = crew.filter((s) => s.state === "return").sort((a, b) => {
      const ia = this.nearestSlot(wall.spots, used, a);
      const ib = this.nearestSlot(wall.spots, used, b);
      const da = ia < 0 ? 9999 : dist(a, wall.spots[ia]);
      const db = ib < 0 ? 9999 : dist(b, wall.spots[ib]);
      return da - db;
    });
    for (const s of incoming) {
      const i = this.nearestSlot(wall.spots, used, s);
      if (i < 0) continue;
      used.add(i);
      s.restX = wall.spots[i].x;
      s.restY = wall.spots[i].y;
    }
  }

  private guideWalls(): void {
    for (const wall of this.walls) this.guideWall(wall);
  }

  private packWall(wall: Wall): void {
    const crew = this.wallCrew(wall);
    if (crew.length === 0) return;
    wall.spots = wallSpots(wall.path, crew.length, wall.from, SOLDIER_GAP, (p) => this.hitsBase(p));
    const used = new Set<number>();
    for (const s of crew) {
      const i = this.nearestSlot(wall.spots, used, { x: s.x, y: s.y });
      if (i < 0) continue;
      used.add(i);
      s.restX = wall.spots[i].x;
      s.restY = wall.spots[i].y;
    }
  }

  private pruneWalls(): void {
    this.walls = this.walls.filter((wall) => this.wallCrew(wall).length > 0);
    this.guideWalls();
  }

  private wallPool(): Soldier[] {
    const seen = new Set<number>();
    const pool: Soldier[] = [];
    const add = (s: Soldier | undefined): void => {
      if (!s || s.state === "march" || s.owner !== "player" || s.kind === "gunner") return;
      if (seen.has(s.id)) return;
      seen.add(s.id);
      pool.push(s);
    };
    for (const id of this.selected) {
      for (const s of this.freeGarrison(id)) add(s);
    }
    for (const id of this.picked) {
      add(this.soldiers.find((s) => s.id === id));
    }
    return pool;
  }

  private sendSoldier(id: number, toId: number): boolean {
    if (this.winner) return false;
    const s = this.soldiers.find((x) => x.id === id);
    const to = this.territories[toId];
    if (!s || !to || s.state === "march" || !this.matchesFilter(s)) return false;
    if (s.owner !== "player") return false;
    s.wallId = null;
    s.state = "march";
    s.toId = toId;
    return true;
  }

  private assignDefense(): void {
    this.assignWallDefense();
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      const underAttack = this.invaders(t).length > 0;
      for (const s of this.soldiers) {
        if (s.homeId !== t.id || s.state === "march" || s.wallId != null || s.kind === "gunner") continue;
        if (underAttack) s.state = "defend";
        else if (s.state === "defend") this.sendHome(s);
      }
    }
  }

  private assignWallDefense(): void {
    for (const wall of this.walls) {
      const crew = this.wallCrew(wall);
      if (crew.length === 0) continue;
      const threats = this.wallThreats(wall);
      if (threats.length > 0) {
        for (const s of crew) {
          if (!this.wallPosted(s) && s.state !== "defend") continue;
          s.state = "defend";
        }
        continue;
      }
      const fighting = crew.some((s) => s.state === "defend");
      if (fighting) this.packWall(wall);
      for (const s of crew) {
        if (s.state === "defend") this.sendHome(s);
      }
    }
  }

  private syncTroops(): void {
    for (const t of this.territories) {
      if (t.owner === "neutral") continue;
      t.troops = this.garrison(t.id).filter((s) => s.kind !== "gunner").length;
    }
  }

  kindCount(owner: Owner, kind: Soldier["kind"]): number {
    let n = 0;
    for (const s of this.soldiers) {
      if (s.owner === owner && s.kind === kind) n += 1;
    }
    return n;
  }

  private checkWinner(): void {
    const playerLand = this.territories.some((t) => t.owner === "player");
    const aiLand = this.territories.some((t) => isBot(t.owner));
    const playerArmy = this.soldiers.some((s) => s.owner === "player");
    const aiArmy = this.soldiers.some((s) => isBot(s.owner));
    if (!aiLand && !aiArmy) this.winner = "player";
    if (!playerLand && !playerArmy) this.winner = "ai";
  }

  totals(): { player: number; bots: number[] } {
    const bots = [0, 0, 0, 0];
    let player = 0;
    for (const s of this.soldiers) {
      if (s.owner === "player") player += 1;
      if (s.owner === "ai1") bots[0] += 1;
      if (s.owner === "ai2") bots[1] += 1;
      if (s.owner === "ai3") bots[2] += 1;
      if (s.owner === "ai4") bots[3] += 1;
    }
    return { player, bots: bots.slice(0, this.bots) };
  }
}
