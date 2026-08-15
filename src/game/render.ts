import { COLORS } from "./config";
import type { Camera } from "./camera";
import type { Game } from "./engine";
import type { Owner, Soldier, Territory } from "./types";

function fill(owner: Owner): string {
  if (owner === "player") return COLORS.player;
  if (owner === "ai") return COLORS.ai;
  return COLORS.neutral;
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
    drawBase(ctx, t, game.selected === t.id);
  }

  if (game.selected !== null && game.finger) {
    const src = game.territories[game.selected];
    ctx.strokeStyle = COLORS.line;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(src.center.x, src.center.y);
    ctx.lineTo(game.finger.x, game.finger.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const s of game.soldiers) {
    if (s.state !== "march") drawSoldier(ctx, s);
  }
  for (const s of game.soldiers) {
    if (s.state === "march") drawSoldier(ctx, s);
  }

  for (const t of game.territories) {
    drawBadge(ctx, t, game.selected === t.id);
  }

  ctx.restore();
}

function drawBase(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  ctx.beginPath();
  ctx.moveTo(t.poly[0].x, t.poly[0].y);
  for (let i = 1; i < t.poly.length; i++) ctx.lineTo(t.poly[i].x, t.poly[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = t.owner === "neutral" ? 0.22 : selected ? 0.55 : 0.38;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 8 : t.owner === "neutral" ? 3 : 5;
  ctx.stroke();
}

function drawSoldier(ctx: CanvasRenderingContext2D, s: Soldier): void {
  const pop = s.state === "eject" ? 0.55 + s.ejectT * 0.45 : 1;
  const r = 8 * pop;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill(s.owner);
  ctx.fill();
}

function drawBadge(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  const r = selected ? 28 : 24;
  ctx.beginPath();
  ctx.arc(t.center.x, t.center.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = COLORS.bg;
  ctx.font = "700 24px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(t.troops)), t.center.x, t.center.y + 1);
}
