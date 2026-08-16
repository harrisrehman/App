import { AI_MAX_WAIT, AI_MIN_WAIT, ARMY_SPEED, BASE_HEALTH, SPAWN_INTERVAL } from "./config";
import { dist } from "./geo";
import { randRange } from "./rng";
import type { Game } from "./engine";
import type { Territory } from "./types";

type Move = { from: Territory; to: Territory };

export class Commander {
  wait = 1.4;
  lastTarget = -1;
  repeats = 0;

  tick(game: Game, dt: number): void {
    if (game.winner) return;
    if (this.race(game)) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = randRange(game.rng, AI_MIN_WAIT, AI_MAX_WAIT);
    this.act(game);
  }

  private have(game: Game, t: Territory): number {
    return game.garrison(t.id).length;
  }

  private lands(game: Game, owner: "player" | "ai"): Territory[] {
    return game.territories.filter((t) => t.owner === owner);
  }

  private mine(game: Game, min = 1): Territory[] {
    return this.lands(game, "ai").filter((t) => this.have(game, t) >= min);
  }

  private behind(game: Game): boolean {
    return this.lands(game, "ai").length < this.lands(game, "player").length;
  }

  private desperate(game: Game): boolean {
    return this.lands(game, "ai").length * 2 <= this.lands(game, "player").length;
  }

  private nearestTo(t: Territory, others: Territory[]): number {
    if (others.length === 0) return 9999;
    let best = 9999;
    for (const o of others) {
      const d = dist(t.center, o.center);
      if (d < best) best = d;
    }
    return best;
  }

  private frontThreat(game: Game, t: Territory): number {
    return 520 / (this.nearestTo(t, this.lands(game, "ai")) + 55);
  }

  private frontDanger(game: Game, t: Territory): number {
    return 520 / (this.nearestTo(t, this.lands(game, "player")) + 55);
  }

  private greyFront(game: Game, t: Territory): number {
    return this.frontThreat(game, t) + this.frontDanger(game, t);
  }

  private keepFor(game: Game, from: Territory): number {
    if (this.desperate(game)) return 0;
    const front = this.frontDanger(game, from) > 1.4;
    if (this.behind(game)) return front ? 2 : 1;
    return front ? 4 : 2;
  }

  private launch(game: Game, move: Move): boolean {
    if (this.have(game, move.from) < 1) return false;
    if (!game.send(move.from.id, move.to.id)) return false;
    if (move.to.id === this.lastTarget) this.repeats += 1;
    else this.repeats = 0;
    this.lastTarget = move.to.id;
    return true;
  }

  private closest(from: Territory[], dest: Territory): Territory | null {
    if (from.length === 0) return null;
    return [...from].sort((a, b) => dist(a.center, dest.center) - dist(b.center, dest.center))[0];
  }

  private flipCost(game: Game, from: Territory, dest: Territory): number {
    const aiIn = game.incoming(dest.id, "ai");
    const playerIn = game.incoming(dest.id, "player");
    if (dest.owner === "neutral") {
      return Math.max(1, dest.health + playerIn - aiIn);
    }
    const travel = dist(from.center, dest.center) / ARMY_SPEED;
    const growth = dest.owner === "player" ? travel / SPAWN_INTERVAL : 0;
    return Math.max(1, Math.ceil(dest.troops + playerIn + growth - aiIn + 1));
  }

  private canFlip(game: Game, from: Territory, dest: Territory): boolean {
    return this.have(game, from) >= this.flipCost(game, from, dest);
  }

  private race(game: Game): boolean {
    let best: { dest: Territory; from: Territory; risk: number } | null = null;
    const keep = this.desperate(game) ? 0 : 1;
    for (const dest of game.territories) {
      if (dest.owner !== "neutral") continue;
      const playerIn = game.incoming(dest.id, "player");
      if (playerIn <= 0) continue;
      const aiIn = game.incoming(dest.id, "ai");
      const need = dest.health + playerIn - aiIn;
      if (need <= 0) continue;
      const from = this.closest(this.mine(game, Math.max(keep + 1, need)), dest);
      if (!from) continue;
      const risk = playerIn - aiIn + (BASE_HEALTH - dest.health) + this.greyFront(game, dest);
      if (!best || risk > best.risk) best = { dest, from, risk };
    }
    if (!best) return false;
    this.wait = randRange(game.rng, 0.5, 0.9);
    return this.launch(game, { from: best.from, to: best.dest });
  }

  private act(game: Game): void {
    const move = this.expand(game) ?? this.defend(game) ?? this.capture(game);
    if (!move) return;
    if (move.to.id === this.lastTarget && this.repeats >= 2) return;
    this.launch(game, move);
  }

  private expand(game: Game): Move | null {
    const greys = game.territories.filter((t) => t.owner === "neutral");
    if (greys.length === 0) return null;
    let best: { move: Move; score: number } | null = null;
    for (const from of this.mine(game, 1)) {
      if (this.have(game, from) <= this.keepFor(game, from)) continue;
      for (const to of greys) {
        if (game.incoming(to.id, "ai") >= to.health) continue;
        if (!this.canFlip(game, from, to)) continue;
        const close = 90 / (dist(from.center, to.center) + 40);
        const score = close + this.greyFront(game, to) * 6 + (this.behind(game) ? 16 : 0);
        if (!best || score > best.score) {
          best = { move: { from, to }, score };
        }
      }
    }
    return best?.move ?? null;
  }

  private defend(game: Game): Move | null {
    const mine = this.lands(game, "ai");
    if (mine.length < 2) return null;
    let save: Territory | null = null;
    let need = 0;
    let danger = -1;
    for (const t of mine) {
      const incoming = game.incoming(t.id, "player");
      if (incoming <= 0) continue;
      const gap = incoming - this.have(game, t) - game.incoming(t.id, "ai");
      if (gap < 0) continue;
      const risk = gap + this.frontDanger(game, t) * 4;
      if (risk > danger) {
        danger = risk;
        need = gap + 1;
        save = t;
      }
    }
    if (!save) return null;
    const keep = this.behind(game) ? 1 : 2;
    const rich = mine
      .filter((t) => t.id !== save.id && this.have(game, t) > keep && this.have(game, t) >= need)
      .sort((a, b) => {
        const sa = this.have(game, a) - this.frontDanger(game, a) * 4;
        const sb = this.have(game, b) - this.frontDanger(game, b) * 4;
        return sb - sa;
      })[0];
    if (!rich) return null;
    return { from: rich, to: save };
  }

  private capture(game: Game): Move | null {
    const greysLeft = game.territories.some(
      (t) => t.owner === "neutral" && game.incoming(t.id, "ai") < t.health,
    );
    if (greysLeft && this.behind(game)) return null;

    let best: { move: Move; score: number } | null = null;
    for (const from of this.mine(game, 1)) {
      if (this.have(game, from) <= this.keepFor(game, from)) continue;
      for (const to of this.lands(game, "player")) {
        if (!this.canFlip(game, from, to)) continue;
        const close = 70 / (dist(from.center, to.center) + 50);
        const score = this.frontThreat(game, to) * 10 + close - this.flipCost(game, from, to) * 0.3;
        if (!best || score > best.score) {
          best = { move: { from, to }, score };
        }
      }
    }
    return best?.move ?? null;
  }
}
