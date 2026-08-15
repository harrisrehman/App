import { WORLD_H, WORLD_W } from "./config";
import type { Point } from "./types";

export type Camera = {
  scale: number;
  ox: number;
  oy: number;
  width: number;
  height: number;
};

export function fitCamera(width: number, height: number): Camera {
  const scale = Math.min(width / WORLD_W, height / WORLD_H);
  return {
    scale,
    ox: (width - WORLD_W * scale) / 2,
    oy: (height - WORLD_H * scale) / 2,
    width,
    height,
  };
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
