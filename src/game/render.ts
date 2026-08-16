import { COLORS, RING_SPIN, rules } from "./config";
import type { Camera } from "./camera";
import { perimeterRadius, type Game } from "./engine";
import { isClosedLasso } from "./geo";
import type { Owner, Point, Pop, Soldier, Territory } from "./types";

function fill(owner: Owner): string {
  if (owner === "player") return COLORS.player;
  if (owner === "ai1") return COLORS.ai1;
  if (owner === "ai2") return COLORS.ai2;
  if (owner === "ai3") return COLORS.ai3;
  if (owner === "ai4") return COLORS.ai4;
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

  for (const t of game.territories) {
    drawBase(ctx, t, game.selected.has(t.id));
  }

  for (const s of game.soldiers) {
    if (s.state !== "march") drawSoldier(ctx, s, soldierPicked(game, s));
  }
  for (const s of game.soldiers) {
    if (s.state === "march") drawSoldier(ctx, s, soldierPicked(game, s));
  }

  for (const p of game.pops) drawPop(ctx, p);
  drawStroke(ctx, game);

  ctx.restore();
}

function soldierPicked(game: Game, s: Soldier): boolean {
  if (s.wallId != null) return game.picked.has(s.id);
  return game.selected.has(s.homeId);
}

function drawBase(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  drawPoly(ctx, t.localPoly, t.center.x, t.center.y, 1, color, 1);
  const spin = (performance.now() / 1000) * RING_SPIN;
  const dir = t.id % 2 === 0 ? 1 : -1;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3.5, 4.5]);
  ctx.lineDashOffset = dir * -spin;
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
  const barW = 36;
  const barH = 4;
  const barX = t.center.x - barW / 2;
  const barY = t.center.y - 14;
  const ratio = Math.max(0, Math.min(1, t.health / rules.baseHealth));
  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = "#2a2a30";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, barW * ratio, barH);
  ctx.fillStyle = COLORS.bg;
  ctx.font = "700 16px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(t.troops)), t.center.x, t.center.y + 8);
}

function drawSoldier(ctx: CanvasRenderingContext2D, s: Soldier, selected: boolean): void {
  const pop = s.state === "eject" ? 0.55 + s.ejectT * 0.45 : 1;
  const scale = (9 * pop) / 40;
  drawPoly(ctx, s.poly, s.x, s.y, scale, fill(s.owner), 1);
  if (!selected || s.owner !== "player" || s.state === "march") return;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, game: Game): void {
  if (game.stroke.length < 2) return;
  const fade = 1 - game.strokeFade;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(game.stroke[0].x, game.stroke[0].y);
  for (let i = 1; i < game.stroke.length; i++) {
    ctx.lineTo(game.stroke[i].x, game.stroke[i].y);
  }
  if (!game.wallMode && isClosedLasso(game.stroke)) {
    ctx.closePath();
    ctx.globalAlpha = 0.14 * fade;
    ctx.fillStyle = COLORS.player;
    ctx.fill();
  }
  ctx.globalAlpha = 0.82 * fade;
  ctx.strokeStyle = game.wallMode ? COLORS.line : COLORS.player;
  ctx.lineWidth = game.wallMode ? 4.2 : 3.4;
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

