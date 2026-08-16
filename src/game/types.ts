export type Owner = "player" | "ai" | "neutral";

export type Point = { x: number; y: number };

export type SoldierState = "eject" | "idle" | "gather" | "march";

export type Territory = {
  id: number;
  poly: Point[];
  localPoly: Point[];
  center: Point;
  radius: number;
  owner: Owner;
  troops: number;
  spawnAcc: number;
  neighbors: number[];
};

export type Soldier = {
  id: number;
  owner: Exclude<Owner, "neutral">;
  homeId: number;
  x: number;
  y: number;
  state: SoldierState;
  toId: number | null;
  slot: number;
  ejectT: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  poly: Point[];
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

export type Pop = {
  x: number;
  y: number;
  t: number;
};
