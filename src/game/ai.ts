import { AI_MAX_WAIT, AI_MIN_WAIT, ARMY_SPEED, DEFENSE_COST, SPAWN_INTERVAL } from "./config";
import { dist } from "./geo";
import { randRange } from "./rng";
import type { Game } from "./engine";
import { isFaction, type Faction, type Territory } from "./types";

const GREY_RANGE = 580;
const CONTEST_RANGE = 500;
const POACH = 70;
const PULL_SPAN = 380;
const SNATCH_RANGE = 340;

export function scoreGrey(dSelf: number, dFoe: number, secured: boolean): number {
  if (secured) return -1;
  if (dSelf > GREY_RANGE) return -1;
  if (dFoe + POACH < dSelf && dSelf > 240) return -1;
  return 900 / (dSelf + 50) + (dFoe - dSelf) / 70;
}

export function scoreAttack(travel: number, count: number, health: number): number {
  return 1000 / (travel + 60) - count * 5 - health * 0.4;
}

export class Commander {
  wait = 1.8;
  lastTarget = -1;
  repeats = 0;
  age = 0;

  constructor(readonly self: Faction) {}

  reset(): void {
    this.wait = 1.8;
    this.lastTarget = -1;
    this.repeats = 0;
    this.age = 0;
  }

  tick(game: Game, dt: number): void {
    if (game.winner) return;
    this.age += dt;
    if (this.defend(game)) {
      const [a, b] =
        game.difficulty === "hard"
          ? [0.35, 0.6]
          : game.difficulty === "easy"
            ? [1.4, 2.4]
            : [0.55, 0.95];
      this.wait = randRange(game.rng, a, b);
      return;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    const [lo, hi] =
      game.difficulty === "hard"
        ? [0.45, 0.9]
        : game.difficulty === "easy"
          ? [3.5, 6.2]
          : [AI_MIN_WAIT, AI_MAX_WAIT];
    this.wait = randRange(game.rng, lo, hi);
    if (game.difficulty === "easy") {
      this.arm(game);
      this.easyPlan(game);
      return;
    }
    const sent = this.plan(game);
    if (!sent) this.arm(game);
  }

  private totalSpare(game: Game): number {
    let n = 0;
    for (const t of this.lands(game)) n += this.spare(game, t);
    return n;
  }

  private have(game: Game, t: Territory): number {
    return game.garrison(t.id).length;
  }

  private lands(game: Game): Territory[] {
    return game.territories.filter((t) => t.owner === this.self);
  }

  private foes(game: Game): Territory[] {
    return game.territories.filter((t) => isFaction(t.owner) && t.owner !== this.self);
  }

  private greys(game: Game): Territory[] {
    return game.territories.filter((t) => t.owner === "neutral");
  }

  private nearest(t: Territory, others: Territory[]): number {
    if (others.length === 0) return 9999;
    let best = 9999;
    for (const o of others) {
      const d = dist(t.center, o.center);
      if (d < best) best = d;
    }
    return best;
  }

  private closest(from: Territory[], dest: Territory): Territory | null {
    if (from.length === 0) return null;
    return [...from].sort((a, b) => dist(a.center, dest.center) - dist(b.center, dest.center))[0];
  }

  private travel(from: Territory, to: Territory): number {
    return dist(from.center, to.center) / ARMY_SPEED;
  }

  private need(game: Game, dest: Territory, from: Territory): number {
    const selfIn = game.incoming(dest.id, this.self);
    const foeIn = game.incomingElse(dest.id, this.self);
    if (dest.owner === "neutral") {
      return Math.max(1, Math.ceil(dest.health + foeIn - selfIn));
    }
    if (dest.owner === this.self) {
      return Math.max(1, Math.ceil(foeIn - this.have(game, dest) - selfIn + 1));
    }
    const hold = this.have(game, dest);
    const growth = this.travel(from, dest) / SPAWN_INTERVAL;
    return Math.max(1, Math.ceil(dest.health + hold + foeIn + growth - selfIn));
  }

  private threatened(game: Game, t: Territory): boolean {
    return game.incomingElse(t.id, this.self) > 0;
  }

  private spare(game: Game, t: Territory): number {
    if (t.owner !== this.self) return 0;
    if (this.threatened(game, t)) return 0;
    return game.freeGarrison(t.id).length;
  }

  private fund(game: Game, dest: Territory, need: number): Territory[] | null {
    const ranked = this.lands(game)
      .filter((t) => this.spare(game, t) > 0)
      .sort((a, b) => dist(a.center, dest.center) - dist(b.center, dest.center));
    if (ranked.length === 0) return null;
    if (game.difficulty === "easy") {
      const from = ranked[0];
      if (this.spare(game, from) < need) return null;
      return [from];
    }
    const picked: Territory[] = [];
    let got = 0;
    const near = dist(ranked[0].center, dest.center);
    for (const t of ranked) {
      if (dist(t.center, dest.center) > near + PULL_SPAN) break;
      picked.push(t);
      got += this.spare(game, t);
      if (got >= need) return picked;
    }
    return null;
  }

  private launch(game: Game, from: Territory, to: Territory): boolean {
    if (this.spare(game, from) < 1) return false;
    if (!game.send(from.id, to.id, "troop")) return false;
    if (to.id === this.lastTarget) this.repeats += 1;
    else this.repeats = 0;
    this.lastTarget = to.id;
    return true;
  }

  private commit(game: Game, dest: Territory, froms: Territory[]): boolean {
    const repeatCap = game.difficulty === "easy" ? 1 : 3;
    if (dest.id === this.lastTarget && this.repeats >= repeatCap) return false;
    let sent = false;
    for (const from of froms) {
      if (this.launch(game, from, dest)) sent = true;
    }
    return sent;
  }

  private greyValue(game: Game, g: Territory): number {
    const secured =
      game.incoming(g.id, this.self) >= g.health + game.incomingElse(g.id, this.self);
    return scoreGrey(this.nearest(g, this.lands(game)), this.nearest(g, this.foes(game)), secured);
  }

  private bestGrey(game: Game): Territory | null {
    let best: { t: Territory; score: number } | null = null;
    for (const g of this.greys(game)) {
      const score = this.greyValue(game, g);
      if (score < 0) continue;
      if (!best || score > best.score) best = { t: g, score };
    }
    return best?.t ?? null;
  }

  private arm(game: Game): void {
    const keep = game.difficulty === "easy" ? 12 : game.difficulty === "hard" ? 8 : 5;
    const cap = game.difficulty === "easy" ? 0 : 1;
    const maxGuns = game.difficulty === "easy" ? 0 : game.difficulty === "hard" ? 4 : 3;
    const minSpare = game.difficulty === "hard" ? 16 : game.difficulty === "medium" ? 10 : 0;
    if (game.difficulty !== "easy" && this.totalSpare(game) < minSpare) return;
    let made = 0;
    const lands = this.lands(game)
      .filter((t) => !this.threatened(game, t))
      .sort((a, b) => game.freeGarrison(b.id).length - game.freeGarrison(a.id).length);
    for (const t of lands) {
      if (made >= cap) break;
      const guns = game.garrison(t.id).filter((s) => s.kind === "gunner").length;
      if (guns >= maxGuns) continue;
      if (game.freeGarrison(t.id).length < DEFENSE_COST + keep) continue;
      if (game.convertGunner(t.id, this.self)) made += 1;
    }
  }

  private easyPlan(game: Game): void {
    if (game.rng() < 0.45) return;
    const grey = this.bestGrey(game);
    if (grey && game.rng() < 0.75) {
      const home = this.closest(this.lands(game), grey);
      if (home && dist(home.center, grey.center) < 420) {
        if (this.launch(game, home, grey)) return;
      }
    }
    const mine = this.lands(game);
    if (mine.length === 0) return;
    const foes = [...this.foes(game)].sort(
      (a, b) => dist(a.center, mine[0].center) - dist(b.center, mine[0].center),
    );
    for (const to of foes) {
      const home = this.closest(mine, to);
      if (!home) continue;
      if (dist(home.center, to.center) > 380) continue;
      if (this.have(game, to) > 4) continue;
      if (this.launch(game, home, to)) return;
    }
  }

  private plan(game: Game): boolean {
    if (this.snatch(game)) return true;
    const grey = this.bestGrey(game);
    if (grey) {
      const home = this.closest(this.lands(game), grey);
      if (home) {
        const froms = this.fund(game, grey, this.need(game, grey, home));
        if (froms && this.commit(game, grey, froms)) return true;
      }
    }
    if (this.contest(game)) return true;
    if (grey) {
      this.wait = randRange(game.rng, 2.4, 3.4);
      return false;
    }
    return this.attack(game);
  }

  private defend(game: Game): boolean {
    const mine = this.lands(game);
    if (mine.length < 2) return false;
    let save: Territory | null = null;
    let danger = -1;
    let need = 0;
    for (const t of mine) {
      const incoming = game.incomingElse(t.id, this.self);
      if (incoming <= 0) continue;
      const gap = incoming - this.have(game, t) - game.incoming(t.id, this.self);
      if (gap < 0) continue;
      const risk = gap + 400 / (this.nearest(t, this.foes(game)) + 40);
      if (risk > danger) {
        danger = risk;
        need = gap + 1;
        save = t;
      }
    }
    if (!save) return false;
    const froms: Territory[] = [];
    let got = 0;
    const rich = mine
      .filter((t) => t.id !== save.id && this.spare(game, t) > 0)
      .sort((a, b) => this.spare(game, b) - this.spare(game, a));
    for (const t of rich) {
      froms.push(t);
      got += this.spare(game, t);
      if (got >= need) break;
    }
    if (got < need || froms.length === 0) return false;
    return this.commit(game, save, froms);
  }

  private contest(game: Game): boolean {
    if (game.difficulty === "easy") return false;
    const mine = this.lands(game);
    if (mine.length === 0) return false;
    let best: { dest: Territory; froms: Territory[]; score: number } | null = null;
    for (const g of this.greys(game)) {
      const foeIn = game.incomingElse(g.id, this.self);
      if (foeIn <= 0) continue;
      const dSelf = this.nearest(g, mine);
      if (dSelf > CONTEST_RANGE) continue;
      const dFoe = this.nearest(g, this.foes(game));
      if (dFoe + 120 < dSelf) continue;
      const home = this.closest(mine, g);
      if (!home) continue;
      const need = this.need(game, g, home);
      if (need <= 0) continue;
      const froms = this.fund(game, g, need);
      if (!froms) continue;
      const score = foeIn + 240 / (dSelf + 40);
      if (!best || score > best.score) best = { dest: g, froms, score };
    }
    if (!best) return false;
    return this.commit(game, best.dest, best.froms);
  }

  private snatch(game: Game): boolean {
    if (game.difficulty === "easy") return false;
    const mine = this.lands(game);
    if (mine.length === 0) return false;
    let best: { dest: Territory; froms: Territory[]; score: number } | null = null;
    for (const to of this.foes(game)) {
      const home = this.closest(mine, to);
      if (!home) continue;
      const d = dist(home.center, to.center);
      if (d > SNATCH_RANGE) continue;
      const count = this.have(game, to);
      if (count > 2) continue;
      const need = this.need(game, to, home);
      const froms = this.fund(game, to, need);
      if (!froms) continue;
      const grey = this.bestGrey(game);
      if (grey && d > this.nearest(grey, mine) + 40) continue;
      const score = scoreAttack(d, count, to.health);
      if (!best || score > best.score) best = { dest: to, froms, score };
    }
    if (!best) return false;
    return this.commit(game, best.dest, best.froms);
  }

  private attack(game: Game): boolean {
    const mine = this.lands(game);
    if (mine.length === 0) return false;
    let best: { dest: Territory; froms: Territory[]; score: number } | null = null;
    for (const to of this.foes(game)) {
      const home = this.closest(mine, to);
      if (!home) continue;
      const need = this.need(game, to, home);
      const froms = this.fund(game, to, need);
      if (!froms) continue;
      const d = dist(home.center, to.center);
      const count = this.have(game, to) + game.incoming(to.id, to.owner);
      const score = scoreAttack(d, count, to.health);
      if (!best || score > best.score) best = { dest: to, froms, score };
    }
    if (!best) return false;
    return this.commit(game, best.dest, best.froms);
  }
}
