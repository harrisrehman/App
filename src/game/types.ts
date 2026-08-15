export type Owner = "player" | "ai" | "neutral";

export type Point = { x: number; y: number };

export type Territory = {
  id: number;
  poly: Point[];
  center: Point;
  area: number;
  income: number;
  owner: Owner;
  troops: number;
  neighbors: number[];
};

export type Army = {
  id: number;
  owner: Exclude<Owner, "neutral">;
  count: number;
  x: number;
  y: number;
  toId: number;
  vx: number;
  vy: number;
};

export type SendRatio = 0.5 | 1;

export type Winner = "player" | "ai" | null;
