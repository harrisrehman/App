import { AI_MAX_WAIT, AI_MIN_WAIT, ARMY_SPEED, SPAWN_INTERVAL } from "./config";
import { dist } from "./geo";
import { randRange } from "./rng";
import type { Game } from "./engine";
import type { Territory } from "./types";

type Move = { from: Territory; to: Territory; want: number; keep: number };

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

  private launch(game: Game, move: Move): boolean {
    const have = this.have(game, move.from);
    const send = Math.min(move.want, Math.max(0, have - move.keep));
    if (send < 1) return false;
    if (!game.send(move.from.id, move.to.id, send / have)) return false;
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
      return Math.max(1, dest.troops + playerIn - aiIn);
    }
    const travel = dist(from.center, dest.center) / ARMY_SPEED;
    const growth = dest.owner === "player" ? travel / SPAWN_INTERVAL : 0;
    return Math.max(1, Math.ceil(dest.troops + playerIn + growth - aiIn + 1));
  }

  private canFlip(game: Game, from: Territory, dest: Territory, keep: number): number {
    const cost = this.flipCost(game, from, dest);
    const send = this.have(game, from) - keep;
    if (send < cost) return 0;
    return cost;
  }

  private race(game: Game): boolean {
    let best: { dest: Territory; need: number; from: Territory; risk: number } | null = null;
    const keep = this.desperate(game) ? 0 : 1;
    for (const dest of game.territories) {
      if (dest.owner !== "neutral") continue;
      const playerIn = game.incoming(dest.id, "player");
      if (playerIn <= 0) continue;
      const aiIn = game.incoming(dest.id, "ai");
      const need = dest.troops + playerIn - aiIn;
      if (need <= 0) continue;
      const from = this.closest(this.mine(game, keep + 1), dest);
      if (!from) continue;
      const risk = playerIn - aiIn + (5 - dest.troops);
      if (!best || risk > best.risk) best = { dest, need, from, risk };
    }
    if (!best) return false;
    this.wait = randRange(game.rng, 0.5, 0.9);
    return this.launch(game, { from: best.from, to: best.dest, want: best.need, keep });
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
    const keep = this.desperate(game) ? 0 : this.behind(game) ? 1 : 2;
    const mine = this.mine(game, keep + 1);
    if (mine.length === 0) return null;
    let best: { move: Move; score: number } | null = null;
    for (const from of mine) {
      for (const to of greys) {
        if (game.incoming(to.id, "ai") >= to.troops) continue;
        const cost = this.canFlip(game, from, to, keep);
        if (cost < 1) continue;
        const close = 100 / (dist(from.center, to.center) + 40);
        const score = close + (this.behind(game) ? 20 : 0) + game.rng();
        if (!best || score > best.score) {
          best = { move: { from, to, want: cost, keep }, score };
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
    for (const t of mine) {
      const incoming = game.incoming(t.id, "player");
      if (incoming <= 0) continue;
      const gap = incoming - this.have(game, t) - game.incoming(t.id, "ai");
      if (gap >= 0 && gap >= need) {
        need = gap + 1;
        save = t;
      }
    }
    if (!save) return null;
    const keep = this.behind(game) ? 1 : 2;
    const rich = mine
      .filter((t) => t.id !== save.id && this.have(game, t) - keep >= need)
      .sort((a, b) => this.have(game, b) - this.have(game, a))[0];
    if (!rich) return null;
    return { from: rich, to: save, want: need, keep };
  }

  private capture(game: Game): Move | null {
    const greysLeft = game.territories.some(
      (t) => t.owner === "neutral" && game.incoming(t.id, "ai") < t.troops,
    );
    if (greysLeft && this.behind(game)) return null;

    const keep = this.desperate(game) ? 0 : this.behind(game) ? 1 : 3;
    const mine = this.mine(game, keep + 1);
    if (mine.length === 0) return null;
    let best: { move: Move; score: number } | null = null;
    for (const from of mine) {
      for (const to of this.lands(game, "player")) {
        const cost = this.canFlip(game, from, to, keep);
        if (cost < 1) continue;
        const close = 80 / (dist(from.center, to.center) + 50);
        const score = 30 - cost + close + game.rng() * 2;
        if (!best || score > best.score) {
          best = { move: { from, to, want: cost, keep }, score };
        }
      }
    }
    return best?.move ?? null;
  }
}
