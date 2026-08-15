import { COLORS } from "./config";
import type { Camera } from "./camera";
import type { Game } from "./engine";
import type { Owner, Territory } from "./types";

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
    drawLand(ctx, t, game.selected === t.id);
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

  for (const army of game.armies) {
    const n = Math.min(8, Math.max(3, Math.round(army.count / 6)));
    ctx.fillStyle = fill(army.owner);
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 9;
      const px = army.x - army.vy * 0.02 * spread;
      const py = army.y + army.vx * 0.02 * spread;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const t of game.territories) {
    drawBadge(ctx, t, game.selected === t.id);
  }

  ctx.restore();
}

function drawLand(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  ctx.beginPath();
  ctx.moveTo(t.poly[0].x, t.poly[0].y);
  for (let i = 1; i < t.poly.length; i++) ctx.lineTo(t.poly[i].x, t.poly[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = selected ? 0.5 : 0.28;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 8 : 4;
  ctx.stroke();
}

function drawBadge(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  const color = fill(t.owner);
  const r = selected ? 34 : 30;
  ctx.beginPath();
  ctx.arc(t.center.x, t.center.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = COLORS.bg;
  ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(Math.floor(t.troops)), t.center.x, t.center.y + 1);
}
