import { dist } from "./geo";
import type { Camera } from "./camera";
import { toWorld } from "./camera";
import type { Game } from "./engine";

const DRAG = 16;

export function hitTerritory(game: Game, x: number, y: number): number | null {
  let best: { id: number; d: number } | null = null;
  for (const t of game.territories) {
    const d = dist({ x, y }, t.center);
    if (d > t.radius + 12) continue;
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
    const p = "touches" in e ? e.changedTouches[0] ?? e.touches[0] : e;
    return toWorld(getCam(), p.clientX - rect.left, p.clientY - rect.top);
  };

  let lastTouch = 0;
  let dragged = false;
  let picking = false;
  let start: { x: number; y: number } | null = null;

  const down = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) e.preventDefault();
    if (game.winner) return;
    const p = pos(e);
    start = p;
    dragged = false;
    picking = false;
    game.beginStroke(p);
  };

  const move = (e: TouchEvent | MouseEvent): void => {
    if (!start) return;
    const p = pos(e);
    game.extendStroke(p);
    if (dist(p, start) > DRAG) dragged = true;
    if (game.wallMode || !dragged) return;
    if (!picking) {
      picking = true;
      game.selected.clear();
    }
    game.selectFromStroke(game.stroke);
  };

  const tap = (id: number | null): void => {
    if (id !== null && game.selected.size > 0) {
      if ([...game.selected].some((from) => from !== id)) game.sendSelected(id);
      game.finger = null;
      return;
    }
    game.selected.clear();
    game.finger = null;
  };

  const up = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) {
      e.preventDefault();
      lastTouch = Date.now();
    } else if (Date.now() - lastTouch < 600) {
      game.endStroke();
      start = null;
      dragged = false;
      picking = false;
      return;
    }
    const p = start ? pos(e) : null;
    if (game.wallMode) {
      const path = game.stroke.slice();
      game.endStroke();
      start = null;
      dragged = false;
      picking = false;
      game.formWall(path);
      return;
    }
    game.endStroke();
    start = null;
    if (game.winner) {
      dragged = false;
      picking = false;
      return;
    }
    if (!p) return;
    if (dragged) game.selectFromStroke(game.stroke);
    else tap(hitTerritory(game, p.x, p.y));
    dragged = false;
    picking = false;
  };

  const cancel = (): void => {
    game.endStroke();
    start = null;
    dragged = false;
    picking = false;
  };

  const opts = { passive: false } as const;
  canvas.addEventListener("touchstart", down, opts);
  canvas.addEventListener("touchmove", move, opts);
  canvas.addEventListener("touchend", up, opts);
  canvas.addEventListener("touchcancel", cancel);
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", up);

  return () => {
    canvas.removeEventListener("touchstart", down);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", up);
    canvas.removeEventListener("touchcancel", cancel);
    canvas.removeEventListener("mousedown", down);
    canvas.removeEventListener("mousemove", move);
    canvas.removeEventListener("mouseup", up);
  };
}
