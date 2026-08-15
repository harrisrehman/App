import { dist, pointInPoly } from "./geo";
import type { Camera } from "./camera";
import { toWorld } from "./camera";
import type { Game } from "./engine";

export function hitTerritory(game: Game, x: number, y: number): number | null {
  let best: { id: number; d: number } | null = null;
  for (const t of game.territories) {
    const inside = pointInPoly(x, y, t.poly);
    const d = dist({ x, y }, t.center);
    if (!inside && d > t.radius + 36) continue;
    if (!best || d < best.d) best = { id: t.id, d };
  }
  return best?.id ?? null;
}

export function bindInput(
  canvas: HTMLCanvasElement,
  game: Game,
  getCam: () => Camera,
): () => void {
  const pos = (e: TouchEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const p = "touches" in e ? e.changedTouches[0] : e;
    return toWorld(getCam(), p.clientX - rect.left, p.clientY - rect.top);
  };

  let lastTouch = 0;

  const tap = (e: TouchEvent | MouseEvent) => {
    if ("touches" in e) {
      e.preventDefault();
      lastTouch = Date.now();
    } else if (Date.now() - lastTouch < 600) {
      return;
    }
    if (game.winner) return;
    const p = pos(e);
    const id = hitTerritory(game, p.x, p.y);

    if (game.selected !== null && id !== null && id !== game.selected) {
      game.send(game.selected, id, 1);
      game.selected = null;
      game.finger = null;
      return;
    }

    if (id !== null && game.territories[id].owner === "player") {
      game.selected = game.selected === id ? null : id;
      game.finger = null;
      return;
    }

    game.selected = null;
    game.finger = null;
  };

  canvas.addEventListener("touchend", tap, { passive: false });
  canvas.addEventListener("click", tap);

  return () => {
    canvas.removeEventListener("touchend", tap);
    canvas.removeEventListener("click", tap);
  };
}
