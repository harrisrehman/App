import {
  ARMY_SPEED,
  FIGHT_RADIUS,
  POP_CAP,
  POP_LIFE,
  SOLDIER_GAP,
  START_TROOPS,
  SPAWN_INTERVAL,
  WALL_BASE_PAD,
  WALL_CHASE,
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
    return this.garrison(id).filter((s) => s.wallId == null);
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
      if (!s || s.state === "march" || s.owner !== "player") continue;
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

  send(fromId: number, toId: number): boolean {
    if (this.winner) return false;
    if (fromId === toId) return false;
    const from = this.territories[fromId];
    const to = this.territories[toId];
    if (!from || !to || from.owner === "neutral") return false;

    const pool = this.freeGarrison(fromId);
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
    };
    this.walls.push(wall);
    for (const s of pool) s.wallId = wall.id;
    this.packWall(wall);
    for (const s of pool) {
      s.toId = null;
      s.state = "return";
    }
    this.pruneWalls();
    this.wallMode = false;
    this.clearSelection();
    return true;
  }

  sendSelected(toId: number): boolean {
    let sent = false;
    for (const fromId of [...this.selected]) {
      if (this.send(fromId, toId)) sent = true;
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

    this.assignDefense();
    for (const s of this.soldiers) this.stepSoldier(s, dt);

    const dead = new Set<number>();
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
      if (!target || best < 1) return;
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
    const chasing = crew.some((s) => s.state === "defend");
    const pad = chasing ? WALL_CHASE : WALL_SENSE;
    const found: Soldier[] = [];
    for (const s of this.soldiers) {
      if (s.owner === wall.owner) continue;
      if (this.nearWall(wall, s, pad, ranks)) {
        found.push(s);
        continue;
      }
      if (!chasing) continue;
      for (const w of crew) {
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

  private packWall(wall: Wall): void {
    const crew = this.wallCrew(wall);
    if (crew.length === 0) return;
    const spots = wallSpots(wall.path, crew.length, wall.from, SOLDIER_GAP, (p) => this.hitsBase(p));
    const used = new Set<number>();
    for (const s of crew) {
      let best = -1;
      let bestD = 9999;
      for (let i = 0; i < spots.length; i++) {
        if (used.has(i)) continue;
        const d = dist({ x: s.x, y: s.y }, spots[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) continue;
      used.add(best);
      s.restX = spots[best].x;
      s.restY = spots[best].y;
    }
  }

  private pruneWalls(): void {
    const keep: Wall[] = [];
    for (const wall of this.walls) {
      const crew = this.wallCrew(wall);
      if (crew.length === 0) continue;
      if (this.wallThreats(wall).length === 0) {
        this.packWall(wall);
        for (const s of crew) {
          if (s.state !== "defend" && s.state !== "march") this.sendHome(s);
        }
      }
      keep.push(wall);
    }
    this.walls = keep;
  }

  private wallPool(): Soldier[] {
    const seen = new Set<number>();
    const pool: Soldier[] = [];
    const add = (s: Soldier | undefined): void => {
      if (!s || s.state === "march" || s.owner !== "player") return;
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
    if (!s || !to || s.state === "march") return false;
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
        if (s.homeId !== t.id || s.state === "march" || s.wallId != null) continue;
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
      t.troops = this.garrison(t.id).length;
    }
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
