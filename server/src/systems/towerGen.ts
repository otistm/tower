import { EntityKind } from "@tower/shared";
import { BALANCE } from "../config/balance.js";
import {
  MinionArchetype,
  OBSTACLE_FAMILY,
  archetypeById,
} from "../config/bestiary.js";
import { BiomeDef, biomeForFloor, isBossFloor } from "../config/biomes.js";
import { BOSSES } from "../config/bosses.js";
import { chestRewardPool } from "../config/progression.js";
import { EntityState } from "../schema/EntityState.js";
import { GameState } from "../schema/GameState.js";
import { cellKey, footprintCells } from "./grid.js";

let entityCounter = 0;
function newEntityId(kind: string): string {
  entityCounter += 1;
  return `${kind}_${entityCounter}`;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** The in-bounds cells immediately surrounding a footprint (its 1-cell ring). */
function ringCells(
  x: number,
  y: number,
  w: number,
  h: number,
  boardW: number,
  boardH: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let cy = y - 1; cy <= y + h; cy++) {
    for (let cx = x - 1; cx <= x + w; cx++) {
      const inside = cx >= x && cx < x + w && cy >= y && cy < y + h;
      if (inside) continue;
      if (cx < 0 || cy < 0 || cx >= boardW || cy >= boardH) continue;
      out.push({ x: cx, y: cy });
    }
  }
  return out;
}

/**
 * Weighted minion pick from a biome's archetype table, respecting each
 * archetype's own minFloor so early floors stay clean.
 */
function pickBiomeMinion(biome: BiomeDef, floor: number): MinionArchetype {
  const eligible = biome.archetypes
    .map((a) => ({ arch: archetypeById(a.id), weight: a.weight }))
    .filter((a): a is { arch: MinionArchetype; weight: number } => !!a.arch && floor >= a.arch.minFloor);
  const pool = eligible.length > 0 ? eligible : [{ arch: archetypeById("grunt")!, weight: 1 }];
  const total = pool.reduce((s, a) => s + a.weight, 0);
  let roll = Math.random() * total;
  for (const a of pool) {
    roll -= a.weight;
    if (roll <= 0) return a.arch;
  }
  return pool[pool.length - 1].arch;
}

/**
 * Generate the layout for a floor. Scales difficulty with floor number:
 * more/stronger minions, tougher boss, and more loot the higher you climb.
 * Clears prior entities and rebuilds the board.
 */
export function generateFloor(state: GameState, floor: number): void {
  state.entities.clear();
  state.keyAcquired = false;
  state.floor = floor;

  // Biome/theme for this band drives weather, terrain, enemy mix, and the boss.
  const biome = biomeForFloor(floor);
  state.biome = biome.id;
  state.weather = pick(biome.weathers);

  // Board grows with the floor; floor 1 is compact so foes are reachable.
  state.boardWidth = BALANCE.board.width(floor);
  state.boardHeight = BALANCE.board.height(floor);

  const W = state.boardWidth;
  const H = state.boardHeight;

  const occupied = new Set<string>();
  const reserve = (e: EntityState) => {
    for (const c of footprintCells(e.x, e.y, e.w, e.h)) occupied.add(cellKey(c.x, c.y));
    state.entities.set(e.entityId, e);
  };
  const freeSpot = (w: number, h: number, region?: (x: number, y: number) => boolean) => {
    for (let tries = 0; tries < 200; tries++) {
      const x = randInt(0, W - w);
      const y = randInt(0, H - h);
      if (region && !region(x, y)) continue;
      let ok = true;
      for (const c of footprintCells(x, y, w, h)) {
        if (occupied.has(cellKey(c.x, c.y))) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
    return null;
  };

  // --- Boss (band finale): holds the key, ringed by guardians. ---
  // Only the last floor of a band spawns a boss. On the other floors the key is
  // earned by clearing the floor's foes (handled in combat's cleanupDead).
  if (isBossFloor(floor)) {
    const def = BOSSES[biome.bossId];
    const boss = new EntityState();
    boss.entityId = newEntityId("boss");
    boss.kind = EntityKind.Boss;
    boss.family = def.family;
    boss.art = def.art;
    boss.w = def.w;
    boss.h = def.h;
    const bossSpot = freeSpot(def.w, def.h, (_x, y) => y < Math.max(def.h, Math.floor(H * 0.3))) ?? {
      x: Math.max(0, Math.floor(W / 2) - 1),
      y: 0,
    };
    boss.x = bossSpot.x;
    boss.y = bossSpot.y;
    boss.maxHealth = BALANCE.boss.baseHealth + floor * BALANCE.boss.healthPerFloor;
    boss.health = boss.maxHealth;
    boss.attackPower = BALANCE.boss.baseAttack + floor * BALANCE.boss.attackPerFloor;
    boss.cooldownTotalMs = BALANCE.boss.cooldownMs;
    boss.cooldownRemainingMs = BALANCE.boss.cooldownMs;
    boss.baseCooldownMs = BALANCE.boss.cooldownMs;
    boss.blocking = true;
    boss.rewardGold = BALANCE.boss.baseRewardGold + floor * BALANCE.boss.rewardGoldPerFloor;
    // Signature ability fires on its own cadence (first cast after one period).
    boss.signature = def.signature;
    boss.signatureTotalMs = def.signatureCooldownMs;
    boss.signatureRemainingMs = def.signatureCooldownMs;
    boss.signatureRadius = def.signatureRadius;
    reserve(boss);

    // Guardians ring the boss; it stays invulnerable until they all fall.
    const g = def.guardians;
    let placedGuards = 0;
    const ring = ringCells(boss.x, boss.y, boss.w, boss.h, W, H);
    for (const c of ring) {
      if (placedGuards >= g.count) break;
      if (occupied.has(cellKey(c.x, c.y))) continue;
      const guard = new EntityState();
      guard.entityId = newEntityId("guard");
      guard.kind = EntityKind.Minion;
      guard.bossGuard = true;
      guard.family = g.family;
      guard.art = g.art;
      guard.w = 1;
      guard.h = 1;
      guard.x = c.x;
      guard.y = c.y;
      guard.maxHealth = Math.round(
        (BALANCE.minion.baseHealth + floor * BALANCE.minion.healthPerFloor) * g.hpMult,
      );
      guard.health = guard.maxHealth;
      guard.attackPower = Math.max(
        1,
        Math.round((BALANCE.minion.baseAttack + floor * BALANCE.minion.attackPerFloor) * g.atkMult),
      );
      guard.cooldownTotalMs = BALANCE.minion.cooldownMs;
      guard.cooldownRemainingMs = randInt(500, BALANCE.minion.cooldownMs);
      guard.baseCooldownMs = BALANCE.minion.cooldownMs;
      guard.blocking = true;
      guard.rewardGold = BALANCE.minion.baseRewardGold;
      reserve(guard);
      placedGuards++;
    }
    boss.invulnerable = placedGuards > 0;
  }

  // --- Door to next floor (opens once key acquired). ---
  const door = new EntityState();
  door.entityId = newEntityId("door");
  door.kind = EntityKind.Door;
  door.art = "door";
  door.w = 1;
  door.h = 1;
  const doorSpot = freeSpot(1, 1, (_x, y) => y < 2) ?? { x: 0, y: 0 };
  door.x = doorSpot.x;
  door.y = doorSpot.y;
  door.blocking = true;
  reserve(door);

  // --- Minions scale with floor. ---
  const minionCount = BALANCE.minion.count(floor);
  for (let i = 0; i < minionCount; i++) {
    const spot = freeSpot(2, 2, (_x, y) => y >= 2);
    if (!spot) break;
    const arch = pickBiomeMinion(biome, floor);
    const m = new EntityState();
    m.entityId = newEntityId("minion");
    m.kind = EntityKind.Minion;
    m.family = arch.family;
    m.art = arch.art;
    m.w = 2;
    m.h = 2;
    m.x = spot.x;
    m.y = spot.y;
    m.maxHealth = Math.round(
      (BALANCE.minion.baseHealth + floor * BALANCE.minion.healthPerFloor) * arch.healthMult,
    );
    m.health = m.maxHealth;
    m.attackPower = Math.max(
      1,
      Math.round((BALANCE.minion.baseAttack + floor * BALANCE.minion.attackPerFloor) * arch.attackMult),
    );
    const cd = Math.round(BALANCE.minion.cooldownMs * arch.cooldownMult);
    m.cooldownTotalMs = cd;
    // Stagger initial charge so minions don't all strike on the same tick.
    m.cooldownRemainingMs = randInt(500, cd);
    m.baseCooldownMs = cd;
    m.blocking = true;
    m.rewardGold = BALANCE.minion.baseRewardGold + Math.floor(floor / 2);
    reserve(m);
  }

  // --- Obstacles (walls/rubble) block placement. ---
  const obstacleCount = randInt(3, 6) + floor;
  for (let i = 0; i < obstacleCount; i++) {
    const spot = freeSpot(1, 1);
    if (!spot) break;
    const o = new EntityState();
    o.entityId = newEntityId("obstacle");
    o.kind = EntityKind.Obstacle;
    o.art = pick(biome.obstacleArt);
    o.family = OBSTACLE_FAMILY[o.art] ?? "";
    o.x = spot.x;
    o.y = spot.y;
    o.maxHealth = 60;
    o.health = 60;
    o.blocking = true;
    reserve(o);
  }

  // --- Chests (hidden loot: gold + a card to discover). ---
  const chestCount = randInt(1, 2) + Math.floor(floor / 3);
  for (let i = 0; i < chestCount; i++) {
    const spot = freeSpot(1, 1);
    if (!spot) break;
    const ch = new EntityState();
    ch.entityId = newEntityId("chest");
    ch.kind = EntityKind.Chest;
    ch.art = "chest";
    ch.x = spot.x;
    ch.y = spot.y;
    ch.maxHealth = 20;
    ch.health = 20;
    ch.blocking = true;
    ch.hidden = Math.random() < 0.4;
    ch.rewardGold = randInt(5, 15) + floor * 2;
    ch.rewardCardId = pick(chestRewardPool(floor));
    reserve(ch);
  }

  // --- Occasional portal to a hidden shop / mini-board. ---
  if (Math.random() < 0.25) {
    const spot = freeSpot(1, 1);
    if (spot) {
      const p = new EntityState();
      p.entityId = newEntityId("portal");
      p.kind = EntityKind.Portal;
      p.art = "portal";
      p.x = spot.x;
      p.y = spot.y;
      p.blocking = false;
      p.hidden = true;
      reserve(p);
    }
  }
}
