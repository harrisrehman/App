import { AI_MAX_WAIT, AI_MIN_WAIT, NEUTRAL_TROOPS } from "./config";
import { dist } from "./geo";
import { randRange } from "./rng";
import type { Game } from "./engine";
import type { Territory } from "./types";

export class Commander {
  wait = 0.35;
  lastTarget = -1;
  repeats = 0;

  tick(game: Game, dt: number): void {
    if (game.winner) return;
    if (this.contest(game)) {
      this.wait = randRange(game.rng, 0.12, 0.28);
      return;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = randRange(game.rng, AI_MIN_WAIT, AI_MAX_WAIT);
    this.act(game);
  }

  private sources(game: Game, min = 1): Territory[] {
    return game.territories.filter((t) => t.owner === "ai" && game.garrison(t.id).length >= min);
  }

  private nearest(from: Territory[], dest: Territory): Territory | null {
    if (from.length === 0) return null;
    return [...from].sort((a, b) => dist(a.center, dest.center) - dist(b.center, dest.center))[0];
  }

  private sendNeed(game: Game, from: Territory, to: Territory, need: number): boolean {
    const have = game.garrison(from.id).length;
    if (have < 1) return false;
    const ratio = Math.min(1, Math.max(need, 1) / have);
    if (!game.send(from.id, to.id, ratio)) return false;
    this.lastTarget = to.id;
    return true;
  }

  private contest(game: Game): boolean {
    const mine = this.sources(game, 1);
    if (mine.length === 0) return false;

    const races: { dest: Territory; playerIn: number; aiIn: number; hp: number }[] = [];
    for (const dest of game.territories) {
      if (dest.owner !== "neutral") continue;
      const playerIn = game.incoming(dest.id, "player");
      const aiIn = game.incoming(dest.id, "ai");
      const damaged = dest.troops < NEUTRAL_TROOPS;
      if (playerIn <= 0 && !damaged) continue;
      races.push({ dest, playerIn, aiIn, hp: dest.troops });
    }
    if (races.length === 0) return false;

    races.sort((a, b) => {
      const aRisk = a.playerIn + (NEUTRAL_TROOPS - a.hp) - a.aiIn;
      const bRisk = b.playerIn + (NEUTRAL_TROOPS - b.hp) - b.aiIn;
      return bRisk - aRisk;
    });

    let sent = false;
    for (const race of races) {
      const need = Math.max(1, race.hp + race.playerIn - race.aiIn + 1);
      const from = this.nearest(
        mine.filter((t) => game.garrison(t.id).length >= 1),
        race.dest,
      );
      if (!from) continue;
      if (this.sendNeed(game, from, race.dest, need)) sent = true;
    }
    return sent;
  }

  private act(game: Game): void {
    const mine = this.sources(game, 3);
    if (mine.length === 0) return;

    const grab = this.expand(game, mine);
    if (grab) {
      this.commit(game, grab.from, grab.to);
      return;
    }
    const hit = this.attack(game, mine);
    if (hit) {
      this.commit(game, hit.from, hit.to);
      return;
    }
    const help = this.reinforce(game, this.sources(game, 6));
    if (help) this.commit(game, help.from, help.to);
  }

  private commit(game: Game, from: Territory, to: Territory): void {
    if (to.id === this.lastTarget) this.repeats += 1;
    else this.repeats = 0;
    if (this.repeats >= 4 && game.rng() < 0.45) return;
    this.lastTarget = to.id;
    game.send(from.id, to.id, 1);
  }

  private expand(
    game: Game,
    mine: Territory[],
  ): { from: Territory; to: Territory } | null {
    const options: { from: Territory; to: Territory; score: number }[] = [];
    for (const from of mine) {
      for (const to of game.territories) {
        if (to.owner !== "neutral") continue;
        const playerIn = game.incoming(to.id, "player");
        const aiIn = game.incoming(to.id, "ai");
        const have = game.garrison(from.id).length;
        if (have + aiIn < to.troops && playerIn === 0) continue;
        const close = 140 / (dist(from.center, to.center) + 30);
        const race = playerIn * 18;
        options.push({
          from,
          to,
          score: have - to.troops + close + race + game.rng() * 4,
        });
      }
    }
    options.sort((a, b) => b.score - a.score);
    return options[0] ?? null;
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
        const defense = to.troops + game.incoming(to.id, "player") * 0.55;
        const send = game.garrison(from.id).length;
        const advantage = send + inbound - defense;
        if (advantage < -3 && game.rng() < 0.55) continue;
        const near = from.neighbors.includes(to.id) ? 16 : 0;
        const close = 90 / (dist(from.center, to.center) + 40);
        options.push({
          from,
          to,
          score: advantage + near + close + game.rng() * 6,
        });
      }
    }
    options.sort((a, b) => b.score - a.score);
    return options[0] ?? null;
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
      .filter((t) => t.id !== weak.id && t.troops > weak.troops + 4)
      .sort((a, b) => b.troops - a.troops)[0];
    if (!rich) return null;
    return { from: rich, to: weak };
  }
}
