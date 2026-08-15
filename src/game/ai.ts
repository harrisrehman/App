import { AI_MAX_WAIT, AI_MIN_WAIT } from "./config";
import { dist } from "./geo";
import { pick, randRange } from "./rng";
import type { Game } from "./engine";
import type { Territory } from "./types";

export class Commander {
  wait = 1.6;
  lastTarget = -1;
  repeats = 0;

  tick(game: Game, dt: number): void {
    if (game.winner) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = randRange(game.rng, AI_MIN_WAIT, AI_MAX_WAIT);
    this.act(game);
  }

  private act(game: Game): void {
    const mine = game.territories.filter((t) => t.owner === "ai" && t.troops >= 6);
    if (mine.length === 0) return;

    const roll = game.rng();
    if (roll < 0.12) return;

    const move =
      roll < 0.4
        ? this.expand(game, mine)
        : roll < 0.68
          ? this.attack(game, mine)
          : roll < 0.84
            ? this.reinforce(game, mine)
            : this.noise(game, mine);

    if (!move) {
      const fallback = this.expand(game, mine) ?? this.attack(game, mine);
      if (fallback) this.commit(game, fallback.from, fallback.to);
      return;
    }
    this.commit(game, move.from, move.to);
  }

  private commit(game: Game, from: Territory, to: Territory): void {
    if (to.id === this.lastTarget) this.repeats += 1;
    else this.repeats = 0;
    if (this.repeats >= 3 && game.rng() < 0.7) return;
    this.lastTarget = to.id;
    const ratio = game.rng() < 0.22 ? 1 : game.rng() < 0.45 ? 0.5 : 0.65;
    game.send(from.id, to.id, ratio);
  }

  private expand(
    game: Game,
    mine: Territory[],
  ): { from: Territory; to: Territory } | null {
    const options: { from: Territory; to: Territory; score: number }[] = [];
    for (const from of mine) {
      for (const id of from.neighbors) {
        const to = game.territories[id];
        if (to.owner !== "neutral") continue;
        const need = to.troops + 1;
        const send = Math.floor(from.troops * 0.5);
        if (send < need && from.troops < need + 4) continue;
        options.push({
          from,
          to,
          score: send - to.troops + game.rng() * 8,
        });
      }
    }
    options.sort((a, b) => b.score - a.score);
    if (options.length === 0) return null;
    return options[Math.floor(game.rng() * Math.min(3, options.length))];
  }

  private attack(
    game: Game,
    mine: Territory[],
  ): { from: Territory; to: Territory } | null {
    const player = game.territories.filter((t) => t.owner === "player");
    if (player.length === 0) return null;
    const options: { from: Territory; to: Territory; score: number }[] = [];
    for (const from of mine) {
      for (const to of player) {
        const inbound = game.incoming(to.id, "ai");
        const defense = to.troops + game.incoming(to.id, "player") * 0.6;
        const send = Math.floor(from.troops * 0.65);
        const advantage = send + inbound - defense;
        if (advantage < -6 && game.rng() < 0.8) continue;
        const near = from.neighbors.includes(to.id) ? 12 : 0;
        const close = 80 / (dist(from.center, to.center) + 40);
        options.push({
          from,
          to,
          score: advantage + near + close + game.rng() * 10,
        });
      }
    }
    options.sort((a, b) => b.score - a.score);
    if (options.length === 0) return null;
    return options[Math.floor(game.rng() * Math.min(3, options.length))];
  }

  private reinforce(
    game: Game,
    mine: Territory[],
  ): { from: Territory; to: Territory } | null {
    if (mine.length < 2) return null;
    const front = mine
      .map((t) => {
        const threat = t.neighbors.some((id) => game.territories[id].owner === "player");
        return { t, threat, troops: t.troops };
      })
      .filter((x) => x.threat);
    if (front.length === 0) return null;
    const weak = front.sort((a, b) => a.troops - b.troops)[0].t;
    const rich = mine
      .filter((t) => t.id !== weak.id && t.troops > weak.troops + 8)
      .sort((a, b) => b.troops - a.troops)[0];
    if (!rich) return null;
    return { from: rich, to: weak };
  }

  private noise(
    game: Game,
    mine: Territory[],
  ): { from: Territory; to: Territory } | null {
    const from = pick(game.rng, mine);
    const pool = game.territories.filter((t) => t.id !== from.id && t.owner !== "ai");
    if (pool.length === 0) return null;
    return { from, to: pick(game.rng, pool) };
  }
}
