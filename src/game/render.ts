import { COLORS } from "./config";
import type { Camera } from "./camera";
import type { Game } from "./engine";
import type { Owner, Point, Soldier, Territory } from "./types";

function fill(owner: Owner): string {
  if (owner === "player") return COLORS.player;
  if (owner === "ai") return COLORS.ai;
  return COLORS.neutral;
}

function drawPoly(
  ctx: CanvasRenderingContext2D,
  poly: Point[],
  cx: number,
  cy: number,
  scale: number,
  color: string,
  alpha: number,
): void {
  if (poly.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(cx + poly[0].x * scale, cy + poly[0].y * scale);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(cx + poly[i].x * scale, cy + poly[i].y * scale);
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function render(ctx: CanvasRenderingContext2D, game: Game, cam: Camera): void {
  const { width, height, scale } = cam;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cam.ox, cam.oy);
  ctx.scale(scale, scale);

  for (const s of game.soldiers) {
    if (s.state !== "march") drawSoldier(ctx, s);
  }
  for (const s of game.soldiers) {
    if (s.state === "march") drawSoldier(ctx, s);
  }

  for (const t of game.territories) {
    drawBase(ctx, t, game.selected === t.id);
  }

  ctx.restore();
}

function drawBase(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  const scale = (selected ? 38 : 34) / Math.max(t.radius, 1);
  drawPoly(ctx, t.localPoly, t.center.x, t.center.y, scale, color, 1);
  ctx.fillStyle = COLORS.bg;
  ctx.font = "700 24px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(t.troops)), t.center.x, t.center.y + 1);
}

function drawSoldier(ctx: CanvasRenderingContext2D, s: Soldier): void {
  const pop = s.state === "eject" ? 0.55 + s.ejectT * 0.45 : 1;
  const scale = (11 * pop) / 80;
  drawPoly(ctx, s.poly, s.x, s.y, scale, fill(s.owner), 1);
}

