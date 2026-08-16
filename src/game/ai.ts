import { AI_MAX_WAIT, AI_MIN_WAIT } from "./config";
import { dist } from "./geo";
import { randRange } from "./rng";
import type { Game } from "./engine";
import type { Territory } from "./types";

type Move = { from: Territory; to: Territory; want: number; keep: number };

export class Commander {
  wait = 1.2;
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

  private mine(game: Game, min = 1): Territory[] {
    return game.territories.filter((t) => t.owner === "ai" && this.have(game, t) >= min);
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

  private race(game: Game): boolean {
    let best: { dest: Territory; need: number; from: Territory; risk: number } | null = null;
    for (const dest of game.territories) {
      if (dest.owner !== "neutral") continue;
      const playerIn = game.incoming(dest.id, "player");
      if (playerIn <= 0) continue;
      const aiIn = game.incoming(dest.id, "ai");
      const need = dest.troops + playerIn - aiIn + 1;
      if (need <= 0) continue;
      const from = this.closest(this.mine(game, 2), dest);
      if (!from) continue;
      const risk = playerIn - aiIn + (5 - dest.troops);
      if (!best || risk > best.risk) best = { dest, need, from, risk };
    }
    if (!best) return false;
    this.wait = randRange(game.rng, 0.45, 0.8);
    return this.launch(game, { from: best.from, to: best.dest, want: best.need, keep: 1 });
  }

  private closest(from: Territory[], dest: Territory): Territory | null {
    if (from.length === 0) return null;
    return [...from].sort((a, b) => dist(a.center, dest.center) - dist(b.center, dest.center))[0];
  }

  private threatened(game: Game, t: Territory): boolean {
    if (game.incoming(t.id, "player") > 0) return true;
    return t.neighbors.some((id) => game.territories[id].owner === "player");
  }

  private act(game: Game): void {
    const move =
      this.defend(game) ??
      this.expand(game) ??
      this.attack(game) ??
      this.shift(game);
    if (!move) return;
    if (move.to.id === this.lastTarget && this.repeats >= 2) return;
    this.launch(game, move);
  }

  private defend(game: Game): Move | null {
    const mine = this.mine(game, 1);
    if (mine.length < 2) return null;
    let weak: Territory | null = null;
    let deficit = 0;
    for (const t of mine) {
      const incoming = game.incoming(t.id, "player");
      if (incoming <= 0) continue;
      const gap = incoming - this.have(game, t) - game.incoming(t.id, "ai");
      if (gap > deficit) {
        deficit = gap;
        weak = t;
      }
    }
    if (!weak || deficit < 1) return null;
    const rich = mine
      .filter((t) => t.id !== weak.id && !this.threatened(game, t) && this.have(game, t) >= 4)
      .sort((a, b) => this.have(game, b) - this.have(game, a))[0];
    if (!rich) return null;
    return { from: rich, to: weak, want: deficit + 1, keep: 2 };
  }

  private expand(game: Game): Move | null {
    const mine = this.mine(game, 4);
    if (mine.length === 0) return null;
    let best: { move: Move; score: number } | null = null;
    for (const from of mine) {
      if (this.threatened(game, from) && this.have(game, from) < 8) continue;
      for (const to of game.territories) {
        if (to.owner !== "neutral") continue;
        if (game.incoming(to.id, "ai") >= to.troops) continue;
        const need = to.troops - game.incoming(to.id, "ai") + 1;
        const keep = this.threatened(game, from) ? 3 : 2;
        if (this.have(game, from) - keep < need) continue;
        const close = 120 / (dist(from.center, to.center) + 40);
        const score = close - to.troops + game.rng() * 2;
        if (!best || score > best.score) {
          best = { move: { from, to, want: need, keep }, score };
        }
      }
    }
    return best?.move ?? null;
  }

  private attack(game: Game): Move | null {
    const greys = game.territories.some(
      (t) => t.owner === "neutral" && game.incoming(t.id, "ai") < t.troops,
    );
    if (greys && game.rng() < 0.72) return null;

    const mine = this.mine(game, 8);
    if (mine.length === 0) return null;
    let best: { move: Move; score: number } | null = null;
    for (const from of mine) {
      if (this.threatened(game, from) && this.have(game, from) < 12) continue;
      for (const to of game.territories) {
        if (to.owner !== "player") continue;
        const defense = to.troops + game.incoming(to.id, "player") * 0.7;
        const inbound = game.incoming(to.id, "ai");
        const keep = 3;
        const send = this.have(game, from) - keep;
        if (send < 5) continue;
        const advantage = send + inbound - defense;
        if (advantage < 2) continue;
        const near = from.neighbors.includes(to.id) ? 8 : 0;
        const close = 70 / (dist(from.center, to.center) + 50);
        const score = advantage + near + close + game.rng() * 3;
        if (!best || score > best.score) {
          best = { move: { from, to, want: send, keep }, score };
        }
      }
    }
    return best?.move ?? null;
  }

  private shift(game: Game): Move | null {
    const mine = this.mine(game, 1);
    if (mine.length < 2) return null;
    const front = mine.filter((t) => this.threatened(game, t));
    if (front.length === 0) return null;
    const weak = [...front].sort((a, b) => this.have(game, a) - this.have(game, b))[0];
    const rear = mine
      .filter((t) => t.id !== weak.id && !this.threatened(game, t) && this.have(game, t) >= 6)
      .sort((a, b) => this.have(game, b) - this.have(game, a))[0];
    if (!rear || this.have(game, rear) < this.have(game, weak) + 5) return null;
    return { from: rear, to: weak, want: Math.floor(this.have(game, rear) * 0.4), keep: 3 };
  }
}
