import { COLORS } from "./config";
import type { Camera } from "./camera";
import { perimeterRadius, type Game } from "./engine";
import type { Owner, Point, Pop, Soldier, Territory } from "./types";

function fill(owner: Owner): string {
  if (owner === "player") return COLORS.player;
  if (owner === "ai") return COLORS.ai;
  return COLORS.neutral;
}

function pathPoly(
  ctx: CanvasRenderingContext2D,
  poly: Point[],
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx + poly[0].x * scale, cy + poly[0].y * scale);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(cx + poly[i].x * scale, cy + poly[i].y * scale);
  }
  ctx.closePath();
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
  pathPoly(ctx, poly, cx, cy, scale);
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
    drawBase(ctx, t, game.selected.has(t.id));
  }

  for (const p of game.pops) drawPop(ctx, p);
  drawStroke(ctx, game);

  ctx.restore();
}

function drawBase(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  drawPoly(ctx, t.localPoly, t.center.x, t.center.y, 1, color, 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3.5, 4.5]);
  ctx.beginPath();
  ctx.arc(t.center.x, t.center.y, perimeterRadius(t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (selected) {
    pathPoly(ctx, t.localPoly, t.center.x, t.center.y, 1);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.bg;
  ctx.font = "700 16px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(t.troops)), t.center.x, t.center.y + 1);
}

function drawSoldier(ctx: CanvasRenderingContext2D, s: Soldier): void {
  const pop = s.state === "eject" ? 0.55 + s.ejectT * 0.45 : 1;
  const scale = (9 * pop) / 40;
  drawPoly(ctx, s.poly, s.x, s.y, scale, fill(s.owner), 1);
}

function drawStroke(ctx: CanvasRenderingContext2D, game: Game): void {
  if (game.stroke.length < 2) return;
  ctx.globalAlpha = 0.82 * (1 - game.strokeFade);
  ctx.strokeStyle = COLORS.player;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(game.stroke[0].x, game.stroke[0].y);
  for (let i = 1; i < game.stroke.length; i++) {
    ctx.lineTo(game.stroke[i].x, game.stroke[i].y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPop(ctx: CanvasRenderingContext2D, p: Pop): void {
  const u = p.t;
  ctx.globalAlpha = 1 - u;
  ctx.fillStyle = "#f4f4f6";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3 + u * 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

