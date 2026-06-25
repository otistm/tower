import {
  AbilityDef,
  AbilityKind,
  CARD_CATALOG,
  CardDurability,
  CardTier,
  EntityKind,
  GridPos,
  ServerEvent,
  abilityIsAoe,
  footprintGap,
  getTierStats,
  withinShape,
} from "@tower/shared";
import { BALANCE } from "../config/balance.js";
import { CardState } from "../schema/CardState.js";
import { EntityState } from "../schema/EntityState.js";
import { GameState } from "../schema/GameState.js";
import { computeBaseCooldown, createCard, newInstanceId } from "./cardFactory.js";
import { inBounds } from "./grid.js";

/** Ability kinds that fire on cooldown (vs. passive auras handled in synergy). */
const FIREABLE_KINDS = new Set<string>([
  AbilityKind.Attack,
  AbilityKind.Heal,
  AbilityKind.Spawn,
  AbilityKind.Terrain,
  AbilityKind.Economy,
  AbilityKind.Utility,
]);

/** Scorched-earth tuning: how often burning ground bites, and how long it lasts. */
const SCORCH_CADENCE_MS = 700;
const SCORCH_DURATION_MS = 4000;
/** Summoned token swarm lifetime before fading. */
const TOKEN_LIFETIME_MS = 8000;
import {
  computeEffectiveMods,
  computeEnemyMods,
  reflectFromNeighbors,
  shieldFromNeighbors,
  wallShieldFraction,
} from "./synergy.js";

/** Side-effect emitter so the room can broadcast transient events / VFX. */
export type Emit = (event: ServerEvent, payload: unknown) => void;

// Chests are NOT attackable: only a lockpick (Utility) opens them for loot, and
// burning ground destroys them (treasure lost). Everything else here can be hit.
const ENEMY_KINDS = new Set<string>([
  EntityKind.Minion,
  EntityKind.Boss,
  EntityKind.Obstacle,
]);

function isEnemyEntity(e: EntityState): boolean {
  return ENEMY_KINDS.has(e.kind) && e.health > 0;
}

/** Invulnerable entities (a guarded boss) ignore every source of damage. */
function canDamage(e: EntityState): boolean {
  return !e.invulnerable;
}

/** Boss signature tuning: root durations and the fraction of attack used for AoE. */
const ENTANGLE_MS = 2500;
const DEEP_FREEZE_MS = 2000;
const EMBER_AOE_FRAC = 0.8;
const QUAKE_FRAC = 0.6;
const SUMMON_QUAKE_COUNT = 2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectOf(o: { x: number; y: number; w: number; h: number }): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function boardCards(state: GameState): CardState[] {
  const out: CardState[] = [];
  state.cards.forEach((c) => {
    if (c.location === "board" && c.health >= 0) out.push(c);
  });
  return out;
}

/** Main per-tick combat update. Called from the room's fixed simulation loop. */
export function updateCombat(state: GameState, dtMs: number, emit: Emit): void {
  // Reset transient takingDamage flags each tick (attacking set when firing).
  state.cards.forEach((c) => (c.takingDamage = false));
  state.entities.forEach((e) => (e.takingDamage = false));

  // Decay the kill-combo window; let it lapse if nothing dies in time.
  if (state.streakTimerMs > 0) {
    state.streakTimerMs -= dtMs;
    if (state.streakTimerMs <= 0) {
      state.streakTimerMs = 0;
      state.killStreak = 0;
    }
  }

  tickPlayerCards(state, dtMs, emit);
  tickEnemies(state, dtMs, emit);
  tickTerrain(state, dtMs, emit);
  cleanupDead(state, emit);
}

// -----------------------------------------------------------------------------
// Player cards
// -----------------------------------------------------------------------------
function tickPlayerCards(state: GameState, dtMs: number, emit: Emit): void {
  for (const card of boardCards(state)) {
    // Summoned tokens (bees, etc.) fade after their lifetime expires.
    if (card.token && card.lifetimeMs > 0) {
      card.lifetimeMs -= dtMs;
      if (card.lifetimeMs <= 0) {
        state.cards.delete(card.instanceId);
        continue;
      }
    }

    // Rooted by a boss signature: the card can't charge or fire until it thaws.
    if (card.frozenMs > 0) {
      card.frozenMs = Math.max(0, card.frozenMs - dtMs);
      card.attacking = false;
      continue;
    }

    const def = CARD_CATALOG[card.defId];
    if (!def) continue;
    const stats = getTierStats(def, card.tier);

    // Live shield capacity from neighboring walls (drives the on-card shield
    // readout and is consumed first when the card is hit).
    card.shield = card.maxHealth > 0 ? shieldFromNeighbors(state, card) : 0;

    const actionable = stats.abilities.filter((a) => FIREABLE_KINDS.has(a.kind));
    if (actionable.length === 0) {
      card.attacking = false;
      continue;
    }

    // Engagement: only charge the cooldown when there is a valid target in
    // range (a foe to attack, or a wounded ally to heal). When not engaged the
    // card sits ready (bar empty) until something comes into range.
    const mods = computeEffectiveMods(state, card);

    // Effective cooldown = base (size/tier) x synergy/weather multiplier. We
    // store it back into cooldownTotalMs every tick so the value the bar counts
    // down from always matches its denominator (client: 1 - remaining/total).
    // Computing the base fresh avoids compounding the multiplier each tick.
    const base = computeBaseCooldown(def, card.tier);
    const effective = Math.max(1, base * mods.cooldownMultiplier);
    card.cooldownTotalMs = effective;

    const engaged = isEngaged(state, card, actionable);
    card.attacking = engaged;

    if (!engaged) {
      card.cooldownRemainingMs = effective;
      continue;
    }

    // A mid-charge synergy change can leave remaining above the new total; clamp
    // so the charge fraction stays within 0..1.
    if (card.cooldownRemainingMs > effective) card.cooldownRemainingMs = effective;

    card.cooldownRemainingMs -= dtMs;
    if (card.cooldownRemainingMs > 0) continue;

    let fired = false;
    for (const ability of actionable) {
      fired = fireCardAbility(state, card, ability, mods.damageMultiplier, emit) || fired;
    }

    card.cooldownRemainingMs = effective;

    // Consumables are destroyed after a single successful use.
    if (fired && card.durability === CardDurability.Consumable) {
      state.cards.delete(card.instanceId);
    }
  }
}

/** A card is engaged if any of its actionable abilities currently has a target. */
function isEngaged(state: GameState, card: CardState, actionable: AbilityDef[]): boolean {
  for (const ability of actionable) {
    switch (ability.kind) {
      case AbilityKind.Attack:
        if (findEnemyTargets(state, card, ability).length > 0) return true;
        break;
      case AbilityKind.Heal:
        if (hasHealTarget(state, card, ability)) return true;
        break;
      case AbilityKind.Economy:
        // Self-driven: a ring cashes itself in as soon as it's deployed.
        return true;
      case AbilityKind.Spawn:
        // Worth spawning only with foes around and somewhere to put the swarm.
        if (anyEnemyAlive(state) && findSpawnSpot(state, card, ability)) return true;
        break;
      case AbilityKind.Terrain:
        // Detonates when a foe is within blast range, leaving scorched ground.
        if (enemiesWithin(state, card, ability.range ?? 1)) return true;
        break;
      case AbilityKind.Utility:
        if (nearestChest(state, card) !== null) return true;
        break;
    }
  }
  return false;
}

function anyEnemyAlive(state: GameState): boolean {
  let alive = false;
  state.entities.forEach((e) => {
    if (!alive && (e.kind === EntityKind.Minion || e.kind === EntityKind.Boss) && e.health > 0)
      alive = true;
  });
  return alive;
}

function enemiesWithin(state: GameState, card: CardState, range: number): boolean {
  const src = rectOf(card);
  let found = false;
  state.entities.forEach((e) => {
    if (!found && isEnemyEntity(e) && footprintGap(src, rectOf(e)) <= range) found = true;
  });
  return found;
}

function hasHealTarget(state: GameState, card: CardState, ability: AbilityDef): boolean {
  const src = rectOf(card);
  for (const ally of boardCards(state)) {
    if (ally.ownerId !== card.ownerId) continue;
    if (ally.maxHealth <= 0 || ally.health >= ally.maxHealth) continue;
    if (withinShape(src, rectOf(ally), ability.shape, ability.range ?? 1)) {
      return true;
    }
  }
  return false;
}

function fireCardAbility(
  state: GameState,
  card: CardState,
  ability: AbilityDef,
  damageMultiplier: number,
  emit: Emit,
): boolean {
  switch (ability.kind) {
    case AbilityKind.Heal:
      return healAllies(state, card, ability, emit);
    case AbilityKind.Economy:
      return cashIn(state, card, ability, emit);
    case AbilityKind.Spawn:
      return spawnTokens(state, card, ability, emit);
    case AbilityKind.Terrain:
      return scorchAround(state, card, ability);
    case AbilityKind.Utility:
      return openNearestChest(state, card, emit);
    case AbilityKind.Attack: {
      const targets = findEnemyTargets(state, card, ability);
      if (targets.length === 0) return false;
      const baseDmg = Math.max(1, Math.round(ability.power * damageMultiplier));
      const hitCells: GridPos[] = [];
      let dealt = 0;
      for (const target of targets) {
        // Anti-type bonus: e.g. a lawnmower shreds Living foes, Boom melts Stuff.
        let dmg = baseDmg;
        const crit = !!(
          ability.bonusVsType &&
          ability.bonusMultiplier &&
          target.family === ability.bonusVsType
        );
        if (crit) dmg = Math.max(1, Math.round(baseDmg * ability.bonusMultiplier!));
        damageEntity(state, target, dmg, card, emit, crit);
        dealt += dmg;
        hitCells.push({ x: target.x, y: target.y });
      }
      // Lifesteal: a feeding predator mends itself from the wounds it inflicts.
      if (ability.lifesteal && card.maxHealth > 0) {
        const healed = Math.round(dealt * ability.lifesteal);
        if (healed > 0) card.health = Math.min(card.maxHealth, card.health + healed);
      }
      emit(ServerEvent.AbilityFired, {
        sourceCellKey: `${card.x},${card.y}`,
        ability: ability.kind,
        team: "ally",
        family: card.cardType,
        targets: hitCells,
      });
      return true;
    }
    default:
      return false;
  }
}

// -----------------------------------------------------------------------------
// Economy: a ring deployed on the board cashes itself in for the whole party.
// -----------------------------------------------------------------------------
function cashIn(state: GameState, card: CardState, ability: AbilityDef, emit: Emit): boolean {
  // Bribe: a ring placed next to a greedy goblin buys it off — the party takes
  // the goblin's gold and the satisfied goblin leaves the board without a fight.
  const goblin = adjacentTradeMinion(state, card);
  if (goblin) {
    const gold = Math.max(1, goblin.rewardGold);
    awardGoldToAll(state, gold);
    emit(ServerEvent.GoldAwarded, { pos: { x: goblin.x, y: goblin.y }, w: goblin.w, h: goblin.h, gold });
    emit(ServerEvent.Log, { message: `A goblin took the ring and left, paying ${gold}g!`, level: "info" });
    // Remove directly so cleanupDead grants no kill reward / sword / streak.
    state.entities.delete(goblin.entityId);
    return true;
  }

  const gold = Math.max(0, Math.round(ability.power));
  if (gold <= 0) return false;
  awardGoldToAll(state, gold);
  emit(ServerEvent.GoldAwarded, { pos: { x: card.x, y: card.y }, w: card.w, h: card.h, gold });
  emit(ServerEvent.Log, { message: `A ring was cashed in for ${gold}g for the party!`, level: "info" });
  return true;
}

/** A live, gold-bearing goblin (minion) touching this card — a bribe target. */
function adjacentTradeMinion(state: GameState, card: CardState): EntityState | null {
  const src = rectOf(card);
  let found: EntityState | null = null;
  state.entities.forEach((e) => {
    if (found) return;
    if (e.kind !== EntityKind.Minion || e.health <= 0 || e.rewardGold <= 0) return;
    if (footprintGap(src, rectOf(e)) <= 1) found = e;
  });
  return found;
}

// -----------------------------------------------------------------------------
// Spawn: summon short-lived token cards (a bee swarm) on empty cells nearby.
// -----------------------------------------------------------------------------
function findSpawnSpot(
  state: GameState,
  card: CardState,
  ability: AbilityDef,
): { x: number; y: number } | null {
  const spawnId = ability.spawnId;
  if (!spawnId) return null;
  const def = CARD_CATALOG[spawnId];
  if (!def) return null;
  const { w, h } = sizeFootprint(def.size);
  const range = ability.range ?? 1;
  const occ = occupiedCells(state);
  // Spiral-ish scan over the box around the card, nearest rings first.
  for (let r = 1; r <= range; r++) {
    for (let oy = -r; oy <= r + card.h - 1; oy++) {
      for (let ox = -r; ox <= r + card.w - 1; ox++) {
        const x = card.x + ox;
        const y = card.y + oy;
        if (!inBounds(state, x, y, w, h)) continue;
        if (cellsFree(x, y, w, h, occ)) return { x, y };
      }
    }
  }
  return null;
}

function spawnTokens(state: GameState, card: CardState, ability: AbilityDef, emit: Emit): boolean {
  const spawnId = ability.spawnId;
  if (!spawnId || !CARD_CATALOG[spawnId]) return false;
  const count = Math.max(1, Math.round(ability.power));
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const spot = findSpawnSpot(state, card, ability);
    if (!spot) break;
    const tok = createCard(spawnId, card.ownerId, CardTier.Base);
    tok.instanceId = newInstanceId(`${spawnId}_tok`);
    tok.location = "board";
    tok.x = spot.x;
    tok.y = spot.y;
    tok.token = true;
    tok.lifetimeMs = TOKEN_LIFETIME_MS;
    state.cards.set(tok.instanceId, tok);
    spawned++;
  }
  if (spawned > 0) {
    emit(ServerEvent.AbilityFired, {
      sourceCellKey: `${card.x},${card.y}`,
      ability: AbilityKind.Spawn,
      team: "ally",
      targets: [],
    });
  }
  return spawned > 0;
}

// -----------------------------------------------------------------------------
// Terrain: lay down burning ground on empty cells that sears adjacent foes.
// -----------------------------------------------------------------------------
function scorchAround(state: GameState, card: CardState, ability: AbilityDef): boolean {
  const range = ability.range ?? 1;
  const hazard = Math.max(1, Math.round(ability.power));
  const occ = occupiedCells(state);
  let created = 0;
  for (let oy = -range; oy < card.h + range; oy++) {
    for (let ox = -range; ox < card.w + range; ox++) {
      if (created >= 12) break;
      const x = card.x + ox;
      const y = card.y + oy;
      if (!inBounds(state, x, y, 1, 1)) continue;
      const key = `${x},${y}`;
      if (occ.has(key)) continue; // only scorch empty ground
      occ.add(key);
      const t = new EntityState();
      t.entityId = newInstanceId("scorch");
      t.kind = EntityKind.Terrain;
      t.art = "scorched";
      t.x = x;
      t.y = y;
      t.w = 1;
      t.h = 1;
      t.health = 1;
      t.maxHealth = 0;
      t.attackPower = hazard;
      t.cooldownTotalMs = SCORCH_CADENCE_MS;
      t.cooldownRemainingMs = SCORCH_CADENCE_MS;
      t.lifetimeMs = SCORCH_DURATION_MS;
      t.blocking = false;
      state.entities.set(t.entityId, t);
      created++;
    }
  }
  return created > 0;
}

// -----------------------------------------------------------------------------
// Utility: a lockpick cracks the nearest chest open from anywhere on the board.
// -----------------------------------------------------------------------------
function nearestChest(state: GameState, card: CardState): EntityState | null {
  const src = rectOf(card);
  let best: EntityState | null = null;
  let bestGap = Infinity;
  state.entities.forEach((e) => {
    if (e.kind !== EntityKind.Chest || e.health <= 0) return;
    const gap = footprintGap(src, rectOf(e));
    if (gap < bestGap) {
      bestGap = gap;
      best = e;
    }
  });
  return best;
}

function openNearestChest(state: GameState, card: CardState, emit: Emit): boolean {
  const chest = nearestChest(state, card);
  if (!chest) return false;
  // Drop its health to 0 so cleanupDead handles the loot/discovery uniformly.
  chest.hidden = false;
  chest.health = 0;
  emit(ServerEvent.Log, { message: "A lockpick sprang a chest open!", level: "info" });
  return true;
}

function sizeFootprint(size: string): { w: number; h: number } {
  // Mirror SIZE_FOOTPRINT without importing the map into the hot path twice.
  if (size === "large") return { w: 3, h: 3 };
  if (size === "medium") return { w: 2, h: 3 };
  if (size === "tiny") return { w: 1, h: 1 };
  return { w: 2, h: 2 };
}

function occupiedCells(state: GameState): Set<string> {
  const occ = new Set<string>();
  state.cards.forEach((c) => {
    if (c.location !== "board") return;
    for (let dy = 0; dy < c.h; dy++)
      for (let dx = 0; dx < c.w; dx++) occ.add(`${c.x + dx},${c.y + dy}`);
  });
  state.entities.forEach((e) => {
    if (!e.blocking) return;
    for (let dy = 0; dy < e.h; dy++)
      for (let dx = 0; dx < e.w; dx++) occ.add(`${e.x + dx},${e.y + dy}`);
  });
  return occ;
}

function cellsFree(x: number, y: number, w: number, h: number, occ: Set<string>): boolean {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) if (occ.has(`${x + dx},${y + dy}`)) return false;
  return true;
}

function healAllies(
  state: GameState,
  card: CardState,
  ability: AbilityDef,
  emit: Emit,
): boolean {
  const src = rectOf(card);
  let healed = false;
  for (const ally of boardCards(state)) {
    if (ally.ownerId !== card.ownerId) continue;
    if (ally.maxHealth <= 0 || ally.health >= ally.maxHealth) continue;
    if (!withinShape(src, rectOf(ally), ability.shape, ability.range ?? 1)) continue;
    ally.health = Math.min(ally.maxHealth, ally.health + ability.power);
    healed = true;
  }
  if (healed) {
    emit(ServerEvent.AbilityFired, {
      sourceCellKey: `${card.x},${card.y}`,
      ability: ability.kind,
      team: "ally",
      targets: [],
    });
  }
  return healed;
}

function findEnemyTargets(
  state: GameState,
  card: CardState,
  ability: AbilityDef,
): EntityState[] {
  const enemies: EntityState[] = [];
  state.entities.forEach((e) => {
    // A guarded (invulnerable) boss is no target — attacks fall to its guardians.
    if (isEnemyEntity(e) && canDamage(e)) enemies.push(e);
  });
  if (enemies.length === 0) return [];

  const src = rectOf(card);
  const range = ability.range ?? 1;

  const inReach = enemies.filter((e) => withinShape(src, rectOf(e), ability.shape, range));
  if (inReach.length === 0) return [];

  // AoE abilities (area shapes, or point shapes flagged `aoe`) strike everything
  // in reach. Single-target abilities hit only the nearest foe (closest gap,
  // tie-broken by lowest remaining health so they help finish a kill).
  if (abilityIsAoe(ability)) return inReach;

  let best = inReach[0];
  let bestGap = footprintGap(src, rectOf(best));
  for (const e of inReach) {
    const gap = footprintGap(src, rectOf(e));
    if (gap < bestGap || (gap === bestGap && e.health < best.health)) {
      best = e;
      bestGap = gap;
    }
  }
  return [best];
}

// -----------------------------------------------------------------------------
// Enemies (minions, boss)
// -----------------------------------------------------------------------------
function enemyRange(e: EntityState): number {
  return e.kind === EntityKind.Boss ? 2 : 1;
}

function tickEnemies(state: GameState, dtMs: number, emit: Emit): void {
  state.entities.forEach((e) => {
    if (e.kind !== EntityKind.Minion && e.kind !== EntityKind.Boss) return;
    if (e.health <= 0) return;
    if (e.hidden) return;

    // Bosses also wield a signature ability on their own cadence — it threatens
    // the field even while the boss is still shielded by its guardians.
    if (e.kind === EntityKind.Boss && e.signature) {
      e.signatureRemainingMs -= dtMs;
      if (e.signatureRemainingMs <= 0) {
        e.signatureRemainingMs = e.signatureTotalMs;
        fireBossSignature(state, e, emit);
      }
    }

    // Nearby player debuffs (fear totems, etc.) slow and weaken this enemy.
    const mods = computeEnemyMods(state, e);
    const base = e.baseCooldownMs > 0 ? e.baseCooldownMs : e.cooldownTotalMs;
    const effective = Math.max(1, base * mods.cooldownMultiplier);
    e.cooldownTotalMs = effective;

    // Enemies engage (and charge) only when a player card is within reach.
    // They strike every card in range at once, so a card touching several foes
    // is hit by all of them, and a foe touching several cards hits all of them.
    const targets = playerCardsInRange(state, e, enemyRange(e));
    e.attacking = targets.length > 0;
    if (targets.length === 0) {
      e.cooldownRemainingMs = effective;
      return;
    }

    if (e.cooldownRemainingMs > effective) e.cooldownRemainingMs = effective;
    e.cooldownRemainingMs -= dtMs;
    if (e.cooldownRemainingMs > 0) return;
    e.cooldownRemainingMs = effective;

    const dmg = Math.max(1, Math.round(e.attackPower * mods.damageMultiplier));
    const hitCells: GridPos[] = [];
    for (const target of targets) {
      applyDamageToCard(state, target, dmg, e, emit);
      hitCells.push({ x: target.x, y: target.y });
    }
    emit(ServerEvent.AbilityFired, {
      sourceCellKey: `${e.x},${e.y}`,
      ability: "attack",
      team: "enemy",
      family: e.family,
      targets: hitCells,
    });
  });
}

// -----------------------------------------------------------------------------
// Boss signature abilities
// -----------------------------------------------------------------------------
/** Dispatch a boss's signature by its kind id (see config/bosses.ts). */
function fireBossSignature(state: GameState, boss: EntityState, emit: Emit): void {
  const radius = boss.signatureRadius || 2;
  const targets = playerCardsInRange(state, boss, radius);

  switch (boss.signature) {
    case "entangle": {
      // Root the single biggest threat in range (highest max health).
      if (targets.length === 0) return;
      let victim = targets[0];
      for (const c of targets) if (c.maxHealth > victim.maxHealth) victim = c;
      victim.frozenMs = ENTANGLE_MS;
      emit(ServerEvent.AbilityFired, {
        sourceCellKey: `${boss.x},${boss.y}`,
        ability: "attack",
        team: "enemy",
        family: boss.family,
        targets: [{ x: victim.x, y: victim.y }],
      });
      emit(ServerEvent.Log, { message: "The boss entangles a card in thorns!", level: "warn" });
      return;
    }
    case "deepFreeze": {
      // Flash-freeze everything nearby at once.
      if (targets.length === 0) return;
      const cells: GridPos[] = [];
      for (const c of targets) {
        c.frozenMs = DEEP_FREEZE_MS;
        cells.push({ x: c.x, y: c.y });
      }
      emit(ServerEvent.AbilityFired, {
        sourceCellKey: `${boss.x},${boss.y}`,
        ability: "attack",
        team: "enemy",
        family: boss.family,
        targets: cells,
      });
      emit(ServerEvent.Log, { message: "A deep freeze locks your cards in ice!", level: "warn" });
      return;
    }
    case "emberAoe": {
      if (targets.length === 0) return;
      const dmg = Math.max(1, Math.round(boss.attackPower * EMBER_AOE_FRAC));
      const cells: GridPos[] = [];
      for (const c of targets) {
        applyDamageToCard(state, c, dmg, boss, emit);
        cells.push({ x: c.x, y: c.y });
      }
      emit(ServerEvent.AbilityFired, {
        sourceCellKey: `${boss.x},${boss.y}`,
        ability: "attack",
        team: "enemy",
        family: boss.family,
        targets: cells,
      });
      emit(ServerEvent.Log, { message: "Embers rain across the field!", level: "warn" });
      return;
    }
    case "summonQuake": {
      // Quake everything nearby, then call in reinforcements.
      const cells: GridPos[] = [];
      const dmg = Math.max(1, Math.round(boss.attackPower * QUAKE_FRAC));
      for (const c of targets) {
        applyDamageToCard(state, c, dmg, boss, emit);
        cells.push({ x: c.x, y: c.y });
      }
      const summoned = summonMinionsNearBoss(state, boss, SUMMON_QUAKE_COUNT);
      emit(ServerEvent.AbilityFired, {
        sourceCellKey: `${boss.x},${boss.y}`,
        ability: "attack",
        team: "enemy",
        family: boss.family,
        targets: cells,
      });
      emit(ServerEvent.Log, {
        message: `The Sovereign quakes the floor and summons ${summoned} minions!`,
        level: "warn",
      });
      return;
    }
  }
}

/** Spawn up to `count` fresh minions on free cells ringing the boss. */
function summonMinionsNearBoss(state: GameState, boss: EntityState, count: number): number {
  const occ = occupiedCells(state);
  let summoned = 0;
  for (let r = 1; r <= 3 && summoned < count; r++) {
    for (let oy = -r; oy <= boss.h - 1 + r && summoned < count; oy++) {
      for (let ox = -r; ox <= boss.w - 1 + r && summoned < count; ox++) {
        const x = boss.x + ox;
        const y = boss.y + oy;
        if (!inBounds(state, x, y, 2, 2)) continue;
        if (!cellsFree(x, y, 2, 2, occ)) continue;
        const floor = state.floor;
        const m = new EntityState();
        m.entityId = newInstanceId("summon");
        m.kind = EntityKind.Minion;
        m.family = boss.family;
        m.art = "goblin";
        m.w = 2;
        m.h = 2;
        m.x = x;
        m.y = y;
        m.maxHealth = Math.round(BALANCE.minion.baseHealth + floor * BALANCE.minion.healthPerFloor);
        m.health = m.maxHealth;
        m.attackPower = Math.max(
          1,
          Math.round(BALANCE.minion.baseAttack + floor * BALANCE.minion.attackPerFloor),
        );
        m.cooldownTotalMs = BALANCE.minion.cooldownMs;
        m.cooldownRemainingMs = BALANCE.minion.cooldownMs;
        m.baseCooldownMs = BALANCE.minion.cooldownMs;
        m.blocking = true;
        m.rewardGold = BALANCE.minion.baseRewardGold;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) occ.add(`${x + dx},${y + dy}`);
        state.entities.set(m.entityId, m);
        summoned++;
      }
    }
  }
  return summoned;
}

function playerCardsInRange(state: GameState, e: EntityState, range: number): CardState[] {
  const src = rectOf(e);
  const out: CardState[] = [];
  for (const c of boardCards(state)) {
    if (c.maxHealth <= 0) continue; // can't damage inert objects meaningfully
    if (footprintGap(src, rectOf(c)) <= range) out.push(c);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Terrain (scorched earth left by rockets)
// -----------------------------------------------------------------------------
function tickTerrain(state: GameState, dtMs: number, emit: Emit): void {
  const enemies: EntityState[] = [];
  const chests: EntityState[] = [];
  state.entities.forEach((e) => {
    if (isEnemyEntity(e)) enemies.push(e);
    else if (e.kind === EntityKind.Chest && e.health > 0) chests.push(e);
  });

  const expired: string[] = [];
  const burnedChests = new Set<string>();
  state.entities.forEach((e) => {
    if (e.kind !== EntityKind.Terrain) return;
    e.lifetimeMs -= dtMs;
    if (e.lifetimeMs <= 0) {
      expired.push(e.entityId);
      return;
    }
    if (e.attackPower <= 0) return;
    e.cooldownRemainingMs -= dtMs;
    if (e.cooldownRemainingMs > 0) return;
    e.cooldownRemainingMs = e.cooldownTotalMs;
    const src = rectOf(e);
    for (const en of enemies) {
      if (!canDamage(en)) continue; // a guarded boss is immune to burning ground too
      if (footprintGap(src, rectOf(en)) <= 1) {
        en.health -= e.attackPower;
        en.takingDamage = true;
        emit(ServerEvent.Damage, { pos: { x: en.x, y: en.y }, amount: e.attackPower });
      }
    }
    // Burning ground consumes any chest it touches: the treasure is lost.
    for (const ch of chests) {
      if (!burnedChests.has(ch.entityId) && footprintGap(src, rectOf(ch)) <= 1) {
        burnedChests.add(ch.entityId);
      }
    }
  });
  // Destroy burned chests directly so cleanupDead never awards their loot.
  for (const id of burnedChests) {
    const ch = state.entities.get(id);
    if (!ch) continue;
    state.entities.delete(id);
    emit(ServerEvent.Log, { message: "A chest burned to ash — its treasure was lost.", level: "warn" });
  }
  for (const id of expired) state.entities.delete(id);
}

// -----------------------------------------------------------------------------
// Damage application
// -----------------------------------------------------------------------------
function damageEntity(
  state: GameState,
  e: EntityState,
  amount: number,
  source: CardState,
  emit: Emit,
  crit = false,
): void {
  if (e.hidden) e.hidden = false; // hitting a hidden thing reveals it
  // A guarded boss shrugs off the blow entirely (no chip damage leaks through).
  if (!canDamage(e)) return;
  e.health -= amount;
  e.takingDamage = true;
  emit(ServerEvent.Damage, { pos: { x: e.x, y: e.y }, amount, crit });
}

function applyDamageToCard(
  state: GameState,
  card: CardState,
  rawAmount: number,
  attacker: EntityState,
  emit: Emit,
): void {
  let amount = rawAmount;

  // 1) Mirrors reflect a fraction back at the attacker (unless it's a guarded,
  // invulnerable boss — its shield bounces the reflection too).
  const reflectFrac = canDamage(attacker) ? reflectFromNeighbors(state, card) : 0;
  if (reflectFrac > 0) {
    const reflected = Math.round(amount * reflectFrac);
    if (reflected > 0) {
      attacker.health -= reflected;
      attacker.takingDamage = true;
      amount -= reflected;
      emit(ServerEvent.Damage, {
        pos: { x: attacker.x, y: attacker.y },
        amount: reflected,
        reflected: true,
      });
    }
  }

  // 2) Walls take the hit *for* the card by soaking up to a fraction of the
  // blow, redirecting that onto their own health. The fraction scales with the
  // wall's tier (Wood 50% -> Iron 80%). Whatever the walls can't physically
  // soak (they ran out of health) passes through to the card — no damage is
  // ever silently lost.
  if (amount > 0) {
    const frac = wallShieldFraction(state, card);
    if (frac > 0) {
      const want = Math.round(amount * frac);
      const soaked = distributeToWalls(state, card, want, emit);
      amount -= soaked;
    }
  }

  if (amount <= 0) return;
  card.health -= amount;
  card.takingDamage = true;
  emit(ServerEvent.Damage, { pos: { x: card.x, y: card.y }, amount });
}

/** Chip neighboring ally walls to soak up to `amount`; returns the amount soaked. */
function distributeToWalls(
  state: GameState,
  card: CardState,
  amount: number,
  emit: Emit,
): number {
  let remaining = amount;
  state.cards.forEach((n) => {
    if (remaining <= 0) return;
    if (n.location !== "board" || n.ownerId !== card.ownerId) return;
    if (n.health <= 0) return;
    const nDef = CARD_CATALOG[n.defId];
    if (!nDef) return;
    const isWall = getTierStats(nDef, n.tier).abilities.some(
      (a) => a.kind === AbilityKind.Shield,
    );
    if (!isWall) return;
    if (footprintGap(rectOf(card), rectOf(n)) > 1) return;
    const chip = Math.min(n.health, remaining);
    n.health -= chip;
    n.takingDamage = true;
    remaining -= chip;
    emit(ServerEvent.Damage, { pos: { x: n.x, y: n.y }, amount: chip });
  });
  return amount - remaining;
}

// -----------------------------------------------------------------------------
// Death / rewards / discoveries
// -----------------------------------------------------------------------------
function cleanupDead(state: GameState, emit: Emit): void {
  // Dead player cards leave the board (persistent included; they fall this climb).
  const deadCards: string[] = [];
  state.cards.forEach((c) => {
    if (c.location === "board" && c.maxHealth > 0 && c.health <= 0) deadCards.push(c.instanceId);
  });
  for (const id of deadCards) state.cards.delete(id);

  // Dead entities: rewards, discoveries, boss key.
  const deadEntities: string[] = [];
  state.entities.forEach((e) => {
    if (e.health <= 0 && e.maxHealth > 0) deadEntities.push(e.entityId);
  });

  for (const id of deadEntities) {
    const e = state.entities.get(id);
    if (!e) continue;

    if (e.rewardGold > 0) {
      let gold = e.rewardGold;
      // Slaying foes in quick succession builds a combo that pays bonus gold.
      if (e.kind === EntityKind.Minion || e.kind === EntityKind.Boss) {
        state.killStreak = state.streakTimerMs > 0 ? state.killStreak + 1 : 1;
        state.streakTimerMs = BALANCE.economy.killStreakWindowMs;
        gold += Math.min(state.killStreak - 1, BALANCE.economy.killStreakMaxBonus);
      }
      awardGoldToAll(state, gold);
      // Tell clients where the gold came from so each can fly coins to their
      // own wallet. Gold is shared (co-op), so every client animates this.
      emit(ServerEvent.GoldAwarded, {
        pos: { x: e.x, y: e.y },
        w: e.w,
        h: e.h,
        gold,
      });
    }

    // A slain goblin drops a wooden sword into every player's hand - a small,
    // 1x1 weapon they keep and can place next shopping phase. Boss guardians
    // don't drop loot (they're an obstacle to clear, not a goblin payday).
    if (e.kind === EntityKind.Minion && !e.bossGuard) {
      grantToAll(state, "wooden_sword");
      emit(ServerEvent.Log, { message: "A goblin dropped a wooden sword!", level: "info" });
    }

    if (e.kind === EntityKind.Boss) {
      state.keyAcquired = true;
      emit(ServerEvent.FloorCleared, { floor: state.floor });
    }

    if (e.kind === EntityKind.Chest) {
      // Discovery: unlock the card into every player's collection.
      if (e.rewardCardId) {
        state.players.forEach((p) => {
          if (!p.collection.includes(e.rewardCardId)) p.collection.push(e.rewardCardId);
        });
      }
      emit(ServerEvent.Discovery, {
        pos: { x: e.x, y: e.y },
        rewardCardId: e.rewardCardId,
        gold: e.rewardGold,
        message: `Discovered ${e.rewardCardId || "treasure"}!`,
      });
    }

    state.entities.delete(id);
  }

  // Guardians down? Drop the boss's shield so it can finally be hurt.
  let boss: EntityState | null = null;
  let liveGuards = 0;
  state.entities.forEach((e) => {
    if (e.kind === EntityKind.Boss && e.health > 0) boss = e;
    if (e.bossGuard && e.health > 0) liveGuards++;
  });
  if (boss && (boss as EntityState).invulnerable && liveGuards === 0) {
    (boss as EntityState).invulnerable = false;
    emit(ServerEvent.BossVulnerable, {
      pos: { x: (boss as EntityState).x, y: (boss as EntityState).y },
    });
    emit(ServerEvent.Log, {
      message: "The guardians have fallen — the boss is exposed!",
      level: "warn",
    });
  }

  // Non-boss floors have no boss to slay: the key is earned by clearing the
  // floor of every foe. (Boss floors still gate on the boss death above.)
  if (!state.keyAcquired && enemiesRemaining(state) === 0) {
    state.keyAcquired = true;
    emit(ServerEvent.FloorCleared, { floor: state.floor });
  }
}

function awardGoldToAll(state: GameState, gold: number): void {
  state.players.forEach((p) => (p.gold += gold));
}

/** Grant a fresh card (by catalog id) into every player's hand. */
function grantToAll(state: GameState, defId: string): void {
  state.players.forEach((p) => {
    const card = createCard(defId, p.id, CardTier.Base);
    state.cards.set(card.instanceId, card);
  });
}

/** True when no live minions or boss remain (used to detect floor clear too). */
export function enemiesRemaining(state: GameState): number {
  let n = 0;
  state.entities.forEach((e) => {
    if ((e.kind === EntityKind.Minion || e.kind === EntityKind.Boss) && e.health > 0) n++;
  });
  return n;
}
