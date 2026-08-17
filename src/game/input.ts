import { dist } from "./geo";
import type { Camera } from "./camera";
import { pinchCamera, toWorld } from "./camera";
import type { Game } from "./engine";

const DRAG = 28;

export function hitTerritory(game: Game, x: number, y: number): number | null {
  let best: { id: number; d: number } | null = null;
  for (const t of game.territories) {
    const d = dist({ x, y }, t.center);
    if (d > t.radius + 12) continue;
    if (!best || d < best.d) best = { id: t.id, d };
  }
  return best?.id ?? null;
}

function pair(e: TouchEvent, rect: DOMRect): { x: number; y: number; dist: number } | null {
  if (e.touches.length < 2) return null;
  const a = e.touches[0];
  const b = e.touches[1];
  return {
    x: (a.clientX + b.clientX) / 2 - rect.left,
    y: (a.clientY + b.clientY) / 2 - rect.top,
    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  };
}

function clientPoint(e: TouchEvent | MouseEvent): { x: number; y: number } | null {
  const p = "touches" in e ? e.changedTouches[0] ?? e.touches[0] : e;
  if (!p) return null;
  return { x: p.clientX, y: p.clientY };
}

function overHud(clientX: number, clientY: number): boolean {
  const hit = document.elementFromPoint(clientX, clientY);
  if (hit?.closest("#filters, #shop, .top, #error")) return true;
  const el = document.querySelector("#filters");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function snapPick(game: Game): { selected: number[]; picked: number[] } {
  return { selected: [...game.selected], picked: [...game.picked] };
}

function restorePick(game: Game, snap: { selected: number[]; picked: number[] }): void {
  game.selected.clear();
  for (const id of snap.selected) game.selected.add(id);
  game.picked.clear();
  for (const id of snap.picked) game.picked.add(id);
}

export function bindInput(canvas: HTMLCanvasElement, game: Game, cam: Camera): () => void {
  const pos = (e: TouchEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const p = "touches" in e ? e.changedTouches[0] ?? e.touches[0] : e;
    return toWorld(cam, p.clientX - rect.left, p.clientY - rect.top);
  };

  let lastTouch = 0;
  let dragged = false;
  let picking = false;
  let lassoed = false;
  let pinching = false;
  let pinch: { x: number; y: number; dist: number } | null = null;
  let start: { x: number; y: number } | null = null;
  let held = { selected: [] as number[], picked: [] as number[] };

  const startPinch = (e: TouchEvent): void => {
    pinching = true;
    game.endStroke();
    game.stroke = [];
    start = null;
    dragged = false;
    picking = false;
    lassoed = false;
    pinch = pair(e, canvas.getBoundingClientRect());
  };

  const down = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) {
      e.preventDefault();
      if (e.touches.length >= 2) {
        startPinch(e);
        return;
      }
    }
    const finger = clientPoint(e);
    if (finger && overHud(finger.x, finger.y)) return;
    if (game.winner || pinching) return;
    const p = pos(e);
    start = p;
    dragged = false;
    picking = false;
    lassoed = false;
    held = snapPick(game);
    game.beginStroke(p);
  };

  const move = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) {
      e.preventDefault();
      if (e.touches.length >= 2) {
        if (!pinching) startPinch(e);
        const next = pair(e, canvas.getBoundingClientRect());
        if (pinch && next) pinchCamera(cam, pinch, next);
        pinch = next;
        return;
      }
      if (pinching) return;
    }
    if (!start) return;
    const p = pos(e);
    game.extendStroke(p);
    if (dist(p, start) > DRAG) dragged = true;
    if (game.wallMode || !dragged) return;
    if (!picking) picking = true;
    game.selectFromStroke(game.stroke);
    if (game.selected.size === 0 && game.picked.size === 0) {
      restorePick(game, held);
      lassoed = false;
    } else {
      lassoed = true;
    }
  };

  const up = (e: TouchEvent | MouseEvent): void => {
    if ("touches" in e) {
      e.preventDefault();
      lastTouch = Date.now();
      if (pinching) {
        if (e.touches.length < 2) {
          pinching = false;
          pinch = null;
        }
        return;
      }
    } else if (Date.now() - lastTouch < 600) {
      game.endStroke();
      start = null;
      dragged = false;
      picking = false;
      lassoed = false;
      return;
    }
    const finger = clientPoint(e);
    if (finger && overHud(finger.x, finger.y)) {
      game.endStroke();
      start = null;
      dragged = false;
      picking = false;
      lassoed = false;
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
      lassoed = false;
      return;
    }
    game.endStroke();
    start = null;
    if (game.winner) {
      dragged = false;
      picking = false;
      lassoed = false;
      return;
    }
    if (!p) return;
    if (dragged && lassoed) game.selectFromStroke(game.stroke);
    else game.tapTarget(hitTerritory(game, p.x, p.y));
    dragged = false;
    picking = false;
    lassoed = false;
  };

  const cancel = (): void => {
    game.endStroke();
    start = null;
    dragged = false;
    picking = false;
    lassoed = false;
    pinching = false;
    pinch = null;
  };

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const from = { x, y, dist: 100 };
    const to = { x, y, dist: e.deltaY < 0 ? 108 : 100 / 1.08 };
    pinchCamera(cam, from, to);
  };

  const opts = { passive: false } as const;
  canvas.addEventListener("touchstart", down, opts);
  canvas.addEventListener("touchmove", move, opts);
  canvas.addEventListener("touchend", up, opts);
  canvas.addEventListener("touchcancel", cancel);
  canvas.addEventListener("mousedown", down);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", up);
  canvas.addEventListener("wheel", wheel, opts);

  return () => {
    canvas.removeEventListener("touchstart", down);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", up);
    canvas.removeEventListener("touchcancel", cancel);
    canvas.removeEventListener("mousedown", down);
    canvas.removeEventListener("mousemove", move);
    canvas.removeEventListener("mouseup", up);
    canvas.removeEventListener("wheel", wheel);
  };
}
