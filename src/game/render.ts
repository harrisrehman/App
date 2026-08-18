import { BASE_ART_URL, COLORS, GUNNER_BARREL, GUNNER_BARREL_W, RING_SPIN, WORLD_H, WORLD_W, rules } from "./config";
import type { Camera } from "./camera";
import { perimeterRadius, type Game } from "./engine";
import { isClosedLasso } from "./geo";
import { mulberry32 } from "./rng";
import type { Owner, Pop, Shot, Soldier, Territory } from "./types";

const DESERT = {
  ground: "#2a1e14",
  groundDark: "#1a120c",
  sand: "#3d2e22",
  stone: "#b89868",
  stoneMid: "#9a8058",
  stoneDark: "#6a5438",
  shadow: "rgba(0,0,0,0.38)",
  tunic: "#e8e0d0",
  helm: "#a89888",
  spear: "#6a5840",
  gold: "#c5a15a",
  goldSoft: "#e8d48a",
  text: "#f4ead4",
} as const;

let groundPattern: CanvasPattern | null = null;

function accent(owner: Owner): string {
  if (owner === "player") return COLORS.player;
  if (owner === "ai1") return COLORS.ai1;
  if (owner === "ai2") return COLORS.ai2;
  if (owner === "ai3") return COLORS.ai3;
  if (owner === "ai4") return COLORS.ai4;
  return COLORS.neutral;
}

function ensureGroundPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (groundPattern) return groundPattern;
  const tile = document.createElement("canvas");
  tile.width = 96;
  tile.height = 96;
  const t = tile.getContext("2d")!;
  t.fillStyle = DESERT.ground;
  t.fillRect(0, 0, 96, 96);
  const rng = mulberry32(0x414e4e45);
  for (let i = 0; i < 120; i++) {
    const x = rng() * 96;
    const y = rng() * 96;
    const tone = rng();
    t.fillStyle =
      tone < 0.35
        ? "rgba(26,18,12,0.45)"
        : tone < 0.7
          ? "rgba(61,46,34,0.35)"
          : "rgba(90,72,52,0.22)";
    t.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  groundPattern = ctx.createPattern(tile, "repeat")!;
  return groundPattern;
}

function soldierAngle(s: Soldier): number {
  if (Math.abs(s.faceX) + Math.abs(s.faceY) > 0.01) return Math.atan2(s.faceY, s.faceX);
  return Math.atan2(s.restY - s.y, s.restX - s.x);
}

function drawDesertGround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = ensureGroundPattern(ctx);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const rng = mulberry32(90210);
  for (let i = 0; i < 140; i++) {
    const x = rng() * WORLD_W;
    const y = rng() * WORLD_H;
    if (rng() < 0.55) {
      ctx.fillStyle = rng() < 0.5 ? "#4a4030" : "#3a3028";
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + rng() * 5, 1.5 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(74,80,56,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 8, y - 4 - rng() * 6);
      ctx.stroke();
    }
  }
}

let baseArt: HTMLImageElement | null = null;
let baseArtLoading = false;

function keyBlackBackground(img: HTMLImageElement, done: (out: HTMLImageElement) => void): void {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const t = canvas.getContext("2d");
  if (!t) {
    done(img);
    return;
  }
  t.drawImage(img, 0, 0);
  const data = t.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < 28 && px[i + 1] < 28 && px[i + 2] < 28) px[i + 3] = 0;
  }
  t.putImageData(data, 0, 0);
  const out = new Image();
  out.onload = () => done(out);
  out.onerror = () => done(img);
  out.src = canvas.toDataURL("image/png");
}

function ensureBaseArt(): HTMLImageElement | null {
  if (baseArt?.complete && baseArt.naturalWidth > 0) return baseArt;
  if (baseArtLoading) return null;
  baseArtLoading = true;
  const img = new Image();
  img.onload = () => keyBlackBackground(img, (out) => {
    baseArt = out;
  });
  img.onerror = () => {
    baseArtLoading = false;
  };
  img.src = BASE_ART_URL;
  return null;
}

function drawFort(ctx: CanvasRenderingContext2D, t: Territory): void {
  const { x: cx, y: cy } = t.center;
  const r = t.radius;
  const owned = t.owner !== "neutral";
  const trim = accent(t.owner);
  const art = ensureBaseArt();
  const size = r * 2.2;

  if (art?.complete && art.naturalWidth > 0) {
    ctx.drawImage(art, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = DESERT.stone;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (owned) {
    ctx.strokeStyle = trim;
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawBaseCenter(ctx: CanvasRenderingContext2D, t: Territory): void {
  const { x: cx, y: cy } = t.center;
  const count = Math.floor(t.troops);
  const barW = 34;
  const barH = 4;
  const barX = cx - barW / 2;
  const ratio = Math.max(0, Math.min(1, t.health / rules.baseHealth));

  ctx.fillStyle = DESERT.text;
  ctx.font = '700 17px Cinzel, "Palatino Linotype", Palatino, serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 4;
  ctx.fillText(String(count), cx, cy - 6);
  ctx.shadowBlur = 0;

  const barY = cy + 10;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = "#120c08";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = t.owner === "neutral" ? DESERT.stoneDark : accent(t.owner);
  ctx.fillRect(barX, barY, barW * ratio, barH);
}

function drawBase(ctx: CanvasRenderingContext2D, t: Territory, selected: boolean): void {
  drawFort(ctx, t);
  drawBaseCenter(ctx, t);

  const spin = (performance.now() / 1000) * RING_SPIN;
  const dir = t.id % 2 === 0 ? 1 : -1;
  ctx.save();
  ctx.strokeStyle = DESERT.gold;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = dir * -spin;
  ctx.beginPath();
  ctx.arc(t.center.x, t.center.y, perimeterRadius(t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (selected) {
    ctx.strokeStyle = DESERT.goldSoft;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(t.center.x, t.center.y, t.radius * 1.14, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSpearman(ctx: CanvasRenderingContext2D, s: Soldier, selected: boolean): void {
  const angle = soldierAngle(s);
  const trim = accent(s.owner);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);

  ctx.fillStyle = DESERT.shadow;
  ctx.beginPath();
  ctx.ellipse(2, 3, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = DESERT.spear;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(16, 0);
  ctx.stroke();
  ctx.fillStyle = "#8a7860";
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(12, -2.5);
  ctx.lineTo(12, 2.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = trim;
  ctx.strokeStyle = DESERT.stoneDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-5, 0.5, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = DESERT.tunic;
  ctx.beginPath();
  ctx.ellipse(0, 1, 5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = DESERT.helm;
  ctx.beginPath();
  ctx.arc(0, -1, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8beb0";
  ctx.beginPath();
  ctx.arc(-0.8, -1.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = DESERT.goldSoft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGunnerUnit(ctx: CanvasRenderingContext2D, s: Soldier, selected: boolean): void {
  const angle = Math.atan2(s.faceY, s.faceX);
  const trim = accent(s.owner);
  const pop = s.state === "eject" ? 0.55 + s.ejectT * 0.45 : 1;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(angle);
  ctx.scale(pop, pop);

  ctx.fillStyle = DESERT.shadow;
  ctx.beginPath();
  ctx.ellipse(2, 3, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = DESERT.tunic;
  ctx.beginPath();
  ctx.ellipse(0, 1, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = DESERT.helm;
  ctx.beginPath();
  ctx.arc(0, -1, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5a4838";
  ctx.fillRect(2, -1.5, GUNNER_BARREL * 0.55, GUNNER_BARREL_W * 0.85);
  ctx.fillStyle = trim;
  ctx.fillRect(2, -1, GUNNER_BARREL * 0.38, GUNNER_BARREL_W * 0.55);

  if (selected) {
    ctx.strokeStyle = DESERT.goldSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function soldierPicked(game: Game, s: Soldier): boolean {
  if (!game.matchesFilter(s)) return false;
  if (game.picked.has(s.id)) return true;
  if (s.wallId != null || game.sendFilter !== "all") return false;
  return game.selected.has(s.homeId);
}

export function render(ctx: CanvasRenderingContext2D, game: Game, cam: Camera): void {
  const { width, height } = cam;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = DESERT.groundDark;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(cam.ox, cam.oy);
  ctx.scale(cam.scale, cam.scale);

  drawDesertGround(ctx);

  for (const t of game.territories) {
    drawBase(ctx, t, game.selected.has(t.id));
  }

  for (const s of game.soldiers) {
    if (s.state !== "march") {
      if (s.kind === "gunner") drawGunnerUnit(ctx, s, soldierPicked(game, s));
      else drawSpearman(ctx, s, soldierPicked(game, s));
    }
  }
  for (const s of game.soldiers) {
    if (s.state === "march") {
      if (s.kind === "gunner") drawGunnerUnit(ctx, s, soldierPicked(game, s));
      else drawSpearman(ctx, s, soldierPicked(game, s));
    }
  }

  for (const shot of game.shots) drawShot(ctx, shot);
  for (const p of game.pops) drawPop(ctx, p);
  drawStroke(ctx, game);

  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot): void {
  ctx.fillStyle = accent(shot.owner);
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = DESERT.goldSoft;
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 1.1, 0, Math.PI * 2);
  ctx.fill();
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
    ctx.globalAlpha = 0.12 * fade;
    ctx.fillStyle = COLORS.player;
    ctx.fill();
  }
  ctx.globalAlpha = 0.88 * fade;
  ctx.strokeStyle = game.wallMode ? DESERT.goldSoft : COLORS.player;
  ctx.lineWidth = game.wallMode ? 4 : 3.2;
  ctx.setLineDash(game.wallMode ? [] : [2, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawPop(ctx: CanvasRenderingContext2D, p: Pop): void {
  const u = p.t;
  ctx.globalAlpha = 1 - u;
  ctx.fillStyle = DESERT.goldSoft;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.5 + u * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
