export type BotId = "ai1" | "ai2" | "ai3" | "ai4";
export type Faction = "player" | BotId;
export type Owner = Faction | "neutral";

export const BOTS: BotId[] = ["ai1", "ai2", "ai3", "ai4"];

export function isBot(owner: Owner): owner is BotId {
  return owner === "ai1" || owner === "ai2" || owner === "ai3" || owner === "ai4";
}

export function isFaction(owner: Owner): owner is Faction {
  return owner !== "neutral";
}

export type Point = { x: number; y: number };

export type SoldierState = "eject" | "idle" | "gather" | "defend" | "return" | "march";
export type SoldierKind = "troop" | "gunner";

export type Territory = {
  id: number;
  poly: Point[];
  localPoly: Point[];
  center: Point;
  radius: number;
  owner: Owner;
  troops: number;
  health: number;
  spawnAcc: number;
  neighbors: number[];
};

export type Soldier = {
  id: number;
  owner: Faction;
  homeId: number;
  wallId: number | null;
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
  restX: number;
  restY: number;
  hp: number;
  poly: Point[];
  kind: SoldierKind;
  shootAcc: number;
};

export type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Faction;
  life: number;
};

export type Wall = {
  id: number;
  owner: Faction;
  path: Point[];
  from: Point;
  spots: Point[];
};

export type Army = {
  id: number;
  owner: Faction;
  count: number;
  x: number;
  y: number;
  toId: number;
  vx: number;
  vy: number;
};

export type Winner = "player" | "ai" | null;

export type Pop = {
  x: number;
  y: number;
  t: number;
};
