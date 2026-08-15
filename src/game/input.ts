import { pointInPoly } from "./geo";
import type { Camera } from "./camera";
import { toWorld } from "./camera";
import type { Game } from "./engine";

export function hitTerritory(game: Game, x: number, y: number): number | null {
  for (let i = game.territories.length - 1; i >= 0; i--) {
    if (pointInPoly(x, y, game.territories[i].poly)) return i;
  }
  return null;
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

  const down = (e: TouchEvent | MouseEvent) => {
    if ("touches" in e) e.preventDefault();
    if (game.winner) return;
    const p = pos(e);
    const id = hitTerritory(game, p.x, p.y);
    if (id === null) return;
    if (game.territories[id].owner === "player") {
      game.selected = id;
      game.finger = p;
    }
  };

  const move = (e: TouchEvent | MouseEvent) => {
    if ("touches" in e) e.preventDefault();
    if (game.selected === null) return;
    game.finger = pos(e);
  };

  const up = (e: TouchEvent | MouseEvent) => {
    if ("touches" in e) e.preventDefault();
    if (game.selected === null) return;
    const p = pos(e);
    const id = hitTerritory(game, p.x, p.y);
    if (id !== null && id !== game.selected) {
      game.send(game.selected, id);
    }
    game.selected = null;
    game.finger = null;
  };

  canvas.addEventListener("touchstart", down, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", up, { passive: false });
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);

  return () => {
    canvas.removeEventListener("touchstart", down);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", up);
    canvas.removeEventListener("mousedown", down);
    canvas.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
}
