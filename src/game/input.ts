import { dist } from "./geo";
import type { Camera } from "./camera";
import { toWorld } from "./camera";
import type { Game } from "./engine";

const HOLD_MS = 400;
const HOLD_MOVE = 22;

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
  let holdTimer = 0;
  let holdId: number | null = null;
  let held = false;
  let start: { x: number; y: number } | null = null;

  const clearHold = (): void => {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    holdId = null;
    start = null;
  };

  const sendHold = (id: number): void => {
    if (game.winner) return;
    if (game.selected.size === 0) return;
    if (![...game.selected].some((from) => from !== id)) return;
    game.sendSelected(id);
    game.finger = null;
    held = true;
  };

  const down = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) e.preventDefault();
    if (game.winner) return;
    const p = pos(e);
    start = p;
    held = false;
    holdId = hitTerritory(game, p.x, p.y);
    window.clearTimeout(holdTimer);
    if (holdId === null || game.selected.size === 0) return;
    const id = holdId;
    holdTimer = window.setTimeout(() => sendHold(id), HOLD_MS);
  };

  const move = (e: TouchEvent | MouseEvent): void => {
    if (!start) return;
    const p = pos(e);
    if (dist(p, start) <= HOLD_MOVE) return;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    holdId = null;
  };

  const tap = (id: number | null): void => {
    if (id !== null && game.territories[id].owner === "player") {
      if (game.selected.has(id)) game.selected.delete(id);
      else game.selected.add(id);
      game.finger = null;
      return;
    }

    if (id !== null && game.selected.size > 0) {
      game.sendSelected(id);
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
      clearHold();
      held = false;
      return;
    }
    const didHold = held;
    const p = start ? pos(e) : null;
    clearHold();
    if (didHold || game.winner) {
      held = false;
      return;
    }
    if (!p) return;
    tap(hitTerritory(game, p.x, p.y));
  };

  const opts = { passive: false } as const;
  canvas.addEventListener("touchstart", down, opts);
  canvas.addEventListener("touchmove", move, opts);
  canvas.addEventListener("touchend", up, opts);
  canvas.addEventListener("touchcancel", clearHold);
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", up);

  return () => {
    canvas.removeEventListener("touchstart", down);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", up);
    canvas.removeEventListener("touchcancel", clearHold);
    canvas.removeEventListener("mousedown", down);
    canvas.removeEventListener("mousemove", move);
    canvas.removeEventListener("mouseup", up);
    window.clearTimeout(holdTimer);
  };
}
