/**
 * Central balance knobs for the tower climb. Previously these numbers were
 * scattered across the room, floor generator, and shop; keeping them in one
 * data-driven place lets us tune the game without hunting through systems.
 */
export const BALANCE = {
  /** Gold each player starts the run with (≈4-5 floor-1 cards). */
  startingGold: 22,
  /** Length of one battle phase before the time-out loss. */
  battleDurationMs: 150_000,
  /** Fixed simulation step. */
  tickMs: 100,
  /**
   * The summit. Clearing this floor's boss wins the run (Victory) instead of
   * generating another floor. Gives the climb a finish line and a payoff.
   */
  maxFloor: 10,
  /** Celebration pause on the Floor Cleared screen before advancing. */
  floorClearedCelebrationMs: 3000,
  /**
   * Once at least one player readies up, the rest of the party has this long to
   * follow before the battle auto-starts. Stops one idle player from stalling
   * everyone indefinitely.
   */
  readyTimeoutMs: 30_000,

  shop: {
    size: 5,
    rerollCost: 1,
    /** Per-floor cost inflation applied to a card's base buy cost. */
    costFloorScale: 0.15,
  },

  economy: {
    /** Guaranteed stipend each new floor so a bad battle can't bankrupt you. */
    floorIncome: 5,
    /** Saved-gold interest: 1 gold per this many banked, granted each floor. */
    interestPer: 10,
    /** Cap on interest so hoarding can't snowball forever. */
    interestMax: 5,
    /** Chain kills within this window to build a combo. */
    killStreakWindowMs: 2500,
    /** Max bonus gold added to a single kill from the combo. */
    killStreakMaxBonus: 5,
  },

  /**
   * The board grows as you climb: floor 1 is compact (foes are reachable and
   * the starting gold buys a meaningful share of the board), ramping to the
   * full arena by ~floor 5.
   */
  board: {
    maxWidth: 16,
    maxHeight: 12,
    width: (floor: number): number => Math.min(16, 11 + floor),
    height: (floor: number): number => Math.min(12, 7 + floor),
  },

  boss: {
    // Stats are baseX + floor*perFloor, so floor 1 = base + one step.
    // Floor 1 ≈ 160 HP / 7 atk; ramps to ~880 HP / 37 atk by floor 10.
    // Bosses hit every card in range (AoE), so per-hit damage stays modest
    // and the swing is slow, giving a healed front line time to work.
    baseHealth: 80,
    healthPerFloor: 80,
    baseAttack: 4,
    attackPerFloor: 3,
    cooldownMs: 4000,
    baseRewardGold: 30,
    rewardGoldPerFloor: 15,
  },

  minion: {
    // Floor 1 minion ≈ 36 HP / 4 atk.
    baseHealth: 24,
    healthPerFloor: 12,
    baseAttack: 2,
    attackPerFloor: 2,
    cooldownMs: 2500,
    baseRewardGold: 3,
    /** Minions scale with depth (floor 1 = 2) so early foes don't gang up. */
    count: (floor: number): number => 1 + floor,
  },
} as const;
