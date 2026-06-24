/**
 * Headless balance playtest. Drives the real server systems (generateFloor,
 * createCard, updateCombat) exactly as TowerRoom would, so we can verify a floor
 * is actually clearable without flaky drag-and-drop UI automation.
 *
 * Run: npx tsx src/dev/playtest.ts
 */
import { BALANCE } from "../config/balance.js";
import { CardState } from "../schema/CardState.js";
import { GameState } from "../schema/GameState.js";
import { PlayerState } from "../schema/PlayerState.js";
import { createCard } from "../systems/cardFactory.js";
import { updateCombat } from "../systems/combat.js";
import { generateFloor } from "../systems/towerGen.js";
import { canPlace } from "../systems/grid.js";
import { CardTier, EntityKind, GamePhase } from "@tower/shared";

const TICK = BALANCE.tickMs;
const PLAYER = "p1";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function rectGap(a: Rect, b: Rect): number {
  const hx = Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), 0);
  const hy = Math.max(b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1), 0);
  return Math.max(hx, hy);
}
function rowsOverlap(a: Rect, b: Rect): boolean {
  return a.y <= b.y + b.h - 1 && b.y <= a.y + a.h - 1;
}

function bossRect(state: GameState): Rect {
  let r: Rect = { x: Math.floor(state.boardWidth / 2), y: 0, w: 3, h: 3 };
  state.entities.forEach((e) => {
    if (e.kind === EntityKind.Boss) r = { x: e.x, y: e.y, w: e.w, h: e.h };
  });
  return r;
}

/**
 * Place a card as a thoughtful player would: hug the target rect (gap 1 when
 * possible), and for row/line attackers prefer a row that overlaps the target
 * so their attack actually lands on it.
 */
function placeHugging(
  state: GameState,
  card: CardState,
  target: Rect,
  preferRow: boolean,
): boolean {
  let best: { x: number; y: number } | null = null;
  let bestCost = Infinity;
  for (let y = 0; y < state.boardHeight; y++) {
    for (let x = 0; x < state.boardWidth; x++) {
      if (!canPlace(state, x, y, card.w, card.h)) continue;
      const rect: Rect = { x, y, w: card.w, h: card.h };
      const gap = rectGap(rect, target);
      let cost = gap * 10;
      if (preferRow && !rowsOverlap(rect, target)) cost += 6;
      if (cost < bestCost) {
        bestCost = cost;
        best = { x, y };
      }
    }
  }
  if (!best) return false;
  card.location = "board";
  card.x = best.x;
  card.y = best.y;
  state.cards.set(card.instanceId, card);
  return true;
}

function bossHp(state: GameState): number {
  let hp = 0;
  state.entities.forEach((e) => {
    if (e.kind === EntityKind.Boss) hp = e.health;
  });
  return hp;
}

function counts(state: GameState) {
  let minions = 0;
  let survivors = 0;
  state.entities.forEach((e) => {
    if (e.kind === EntityKind.Minion && e.health > 0) minions++;
  });
  state.cards.forEach((c) => {
    if (c.location === "board" && c.health > 0 && !c.token) survivors++;
  });
  return { minions, survivors };
}

/** Which catalog ids behave as front-line attackers vs. tucked-behind support. */
const ATTACKERS = new Set(["tiger", "lawnmower", "dragon", "rocket"]);
const ROW_ATTACKERS = new Set(["lawnmower"]);

interface Plan {
  attackers: string[];
  support: string[];
}

/** Run one floor battle with a given board plan; return the outcome. */
function runTrial(plan: Plan, floor: number) {
  const state = new GameState();
  state.maxFloor = BALANCE.maxFloor;
  const player = new PlayerState();
  player.id = PLAYER;
  player.gold = BALANCE.startingGold;
  state.players.set(PLAYER, player);

  generateFloor(state, floor);

  const boss = bossRect(state);
  let placed = 0;
  const attackerIds: string[] = [];
  const attackerRects: Rect[] = [];
  // Attackers hug the boss (row attackers align to a boss row).
  for (const defId of plan.attackers) {
    const card = createCard(defId, PLAYER, CardTier.Base);
    if (placeHugging(state, card, boss, ROW_ATTACKERS.has(defId))) {
      placed++;
      attackerIds.push(card.instanceId);
      attackerRects.push({ x: card.x, y: card.y, w: card.w, h: card.h });
    }
  }
  // Support tucks into the middle of the attacker cluster so its heal/shield
  // aura covers the whole front line (what a competent player would do).
  const cx =
    attackerRects.reduce((s, r) => s + r.x + r.w / 2, 0) / Math.max(1, attackerRects.length);
  const cy =
    attackerRects.reduce((s, r) => s + r.y + r.h / 2, 0) / Math.max(1, attackerRects.length);
  const cluster: Rect = { x: Math.floor(cx), y: Math.floor(cy), w: 1, h: 1 };
  for (const defId of plan.support) {
    const card = createCard(defId, PLAYER, CardTier.Base);
    if (placeHugging(state, card, cluster, false)) placed++;
  }

  state.phase = GamePhase.Battle;
  const maxTicks = Math.ceil(BALANCE.battleDurationMs / TICK);
  let tick = 0;
  for (; tick < maxTicks; tick++) {
    if (state.keyAcquired) break;
    updateCombat(state, TICK, () => {});
    // mirror the room's loss check
    let real = 0;
    state.cards.forEach((c) => {
      if (!c.token) real++;
    });
    if (real === 0) break;
  }

  const { minions, survivors } = counts(state);
  let attackersAlive = 0;
  for (const id of attackerIds) {
    const c = state.cards.get(id);
    if (c && c.health > 0) attackersAlive++;
  }
  return {
    cleared: state.keyAcquired,
    seconds: (tick * TICK) / 1000,
    survivors,
    attackersAlive,
    attackersPlaced: attackerIds.length,
    placed,
    minionsLeft: minions,
    bossHpLeft: Math.max(0, bossHp(state)),
    weather: state.weather,
    board: `${state.boardWidth}x${state.boardHeight}`,
  };
}

function summarize(label: string, plan: Plan, floor: number, trials: number) {
  const total = plan.attackers.length + plan.support.length;
  const runs = Array.from({ length: trials }, () => runTrial(plan, floor));
  const wins = runs.filter((r) => r.cleared);
  const winRate = (wins.length / trials) * 100;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const clearTimes = wins.map((r) => r.seconds);
  console.log(`\n=== ${label} (floor ${floor}, ${trials} trials) ===`);
  console.log(`  board: ${runs[0].board}, cards placed: ${runs[0].placed}/${total}`);
  console.log(`  clear rate: ${winRate.toFixed(0)}%`);
  if (wins.length) {
    console.log(
      `  clear time: avg ${avg(clearTimes).toFixed(1)}s  (min ${Math.min(
        ...clearTimes,
      ).toFixed(1)}s, max ${Math.max(...clearTimes).toFixed(1)}s of ${
        BALANCE.battleDurationMs / 1000
      }s)`,
    );
    console.log(`  avg survivors: ${avg(wins.map((r) => r.survivors)).toFixed(1)}/${total}`);
  }
  const losses = runs.filter((r) => !r.cleared);
  if (losses.length) {
    console.log(
      `  losses: avg boss HP left ${avg(losses.map((r) => r.bossHpLeft)).toFixed(
        0,
      )}, avg attackers alive ${avg(losses.map((r) => r.attackersAlive)).toFixed(1)}/${
        runs[0].attackersPlaced
      }`,
    );
  }
}

console.log("TOWER balance playtest");
console.log(
  `startingGold=${BALANCE.startingGold}  floor1 board=${BALANCE.board.width(1)}x${BALANCE.board.height(
    1,
  )}  boss HP=${BALANCE.boss.baseHealth + BALANCE.boss.healthPerFloor}`,
);

const TRIALS = 20;

// A representative ~20-gold floor-1 board: two attackers + heal + wall + haste.
summarize(
  "Solid board (tiger+lawnmower+moss+wall+wind)",
  { attackers: ["tiger", "lawnmower"], support: ["moss", "wall", "wind"] },
  1,
  TRIALS,
);

// Under-investment: should usually NOT clear, proving floor 1 isn't trivial.
summarize("Minimal board (tiger+moss)", { attackers: ["tiger"], support: ["moss"] }, 1, TRIALS);

// Sanity on the ramp. A floor-3 player has an accumulated board (carryover
// cards + extra gold), so model a bigger formation than the floor-1 opener.
summarize(
  "Accumulated board on floor 3",
  { attackers: ["tiger", "lawnmower", "dragon"], support: ["moss", "wall", "wind", "furnace"] },
  3,
  TRIALS,
);
