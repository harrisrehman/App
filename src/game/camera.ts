import { WORLD_H, WORLD_W } from "./config";
import type { Point } from "./types";

export const ZOOM_MAX = 3;

export type Camera = {
  scale: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
};

export function minScale(width: number, height: number): number {
  return Math.min(width / WORLD_W, height / WORLD_H);
}

export function fitCamera(width: number, height: number): Camera {
  const scale = minScale(width, height);
  return {
    scale,
    ox: (width - WORLD_W * scale) / 2,
    oy: (height - WORLD_H * scale) / 2,
    width,
    height,
  };
}

export function clampCamera(cam: Camera): void {
  const min = minScale(cam.width, cam.height);
  if (min <= 0) return;
  cam.scale = Math.max(min, Math.min(min * ZOOM_MAX, cam.scale));
  const worldW = WORLD_W * cam.scale;
  const worldH = WORLD_H * cam.scale;
  cam.ox = Math.max(cam.width - worldW, Math.min(0, cam.ox));
  cam.oy = Math.max(cam.height - worldH, Math.min(0, cam.oy));
}

export function pinchCamera(
  cam: Camera,
  from: { x: number; y: number; dist: number },
  to: { x: number; y: number; dist: number },
): void {
  const world = toWorld(cam, from.x, from.y);
  if (from.dist > 8 && to.dist > 8) cam.scale *= to.dist / from.dist;
  cam.ox = to.x - world.x * cam.scale;
  cam.oy = to.y - world.y * cam.scale;
  clampCamera(cam);
}

export function toWorld(cam: Camera, x: number, y: number): Point {
  return {
    x: (x - cam.ox) / cam.scale,
    y: (y - cam.oy) / cam.scale,
  };
}

export function toScreen(cam: Camera, x: number, y: number): Point {
  return {
    x: cam.ox + x * cam.scale,
    y: cam.oy + y * cam.scale,
  };
}
