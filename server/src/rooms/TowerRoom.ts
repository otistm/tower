import { Client, Room } from "@colyseus/core";
import {
  BuyCardPayload,
  CARD_CATALOG,
  CardTier,
  ClientMessage,
  EvolveCardPayload,
  GamePhase,
  InspectPayload,
  PlaceCardPayload,
  PickUpCardPayload,
  SellCardPayload,
  ServerEvent,
  SetViewportPayload,
  SIZE_FOOTPRINT,
  getTierStats,
} from "@tower/shared";
import { BALANCE } from "../config/balance.js";
import { GameState } from "../schema/GameState.js";
import { PlayerState } from "../schema/PlayerState.js";
import { computeBaseCooldown, createCard } from "../systems/cardFactory.js";
import { updateCombat } from "../systems/combat.js";
import { canPlace } from "../systems/grid.js";
import { generateFloor } from "../systems/towerGen.js";
import { rollShop } from "../systems/shop.js";
import { FLOOR_UNLOCKS, STARTER_POOL } from "../config/progression.js";

const STARTER_COLLECTION = STARTER_POOL;
const PLAYER_COLORS = ["#ffcc00", "#33ccff", "#66ff99", "#ff6699", "#cc99ff"];

/** Hard caps so a malicious/huge client can't blow up the board. */
const MAX_BOARD_COLS = 64;
const MAX_BOARD_ROWS = 48;

/** One room == one co-op tower climb. */
export class TowerRoom extends Room<GameState> {
  maxClients = 4;
  private floorClearedAt = 0;
  /** When >0, the battle auto-starts at this timestamp (AFK ready fallback). */
  private readyDeadline = 0;
  /** The floor's generated (minimum) board size, before client-driven growth. */
  private baseBoardWidth = 0;
  private baseBoardHeight = 0;
  /** Each connected client's requested visible board size (in cells). */
  private viewportByClient = new Map<string, { cols: number; rows: number }>();

  onCreate(): void {
    this.setState(new GameState());
    this.state.phase = GamePhase.Shopping;
    this.state.maxFloor = BALANCE.maxFloor;
    this.regenFloor(1);
    this.state.rerollCount = 0;
    rollShop(this.state);

    this.registerHandlers();
    this.setSimulationInterval((dt) => this.update(dt), BALANCE.tickMs);
  }

  /**
   * Generate a floor at its base size, then grow the board to cover the largest
   * connected client's viewport. Entities stay clustered in the base region so
   * the extra cells are open, playable space to explore.
   */
  private regenFloor(floor: number): void {
    generateFloor(this.state, floor);
    this.baseBoardWidth = this.state.boardWidth;
    this.baseBoardHeight = this.state.boardHeight;
    this.ensureBoardSize();
  }

  /** Expand the board to the max requested by any client (never below base). */
  private ensureBoardSize(): void {
    let cols = this.baseBoardWidth;
    let rows = this.baseBoardHeight;
    for (const v of this.viewportByClient.values()) {
      cols = Math.max(cols, v.cols);
      rows = Math.max(rows, v.rows);
    }
    this.state.boardWidth = Math.min(MAX_BOARD_COLS, cols);
    this.state.boardHeight = Math.min(MAX_BOARD_ROWS, rows);
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------
  onJoin(client: Client, options: { name?: string } = {}): void {
    // If the room is sitting on a finished game with nobody still connected,
    // start a fresh climb so a returning player isn't trapped in a dead room.
    const someoneConnected = [...this.state.players.values()].some((p) => p.connected);
    const gameOver =
      this.state.phase === GamePhase.Defeat || this.state.phase === GamePhase.Victory;
    if (gameOver && !someoneConnected) this.resetGame();

    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options.name?.slice(0, 16) || `Climber ${this.state.players.size + 1}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    player.gold = BALANCE.startingGold; // gold is granted at the start of the first floor
    player.connected = true;
    for (const id of STARTER_COLLECTION) player.collection.push(id);
    this.state.players.set(client.sessionId, player);

    // Refresh the shop so newly joined collections widen the pool (unless locked).
    if (this.state.phase === GamePhase.Shopping && !this.state.shopLocked) {
      this.state.rerollCount = 0;
      rollShop(this.state);
    }
  }

  onLeave(client: Client, consented: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    // Drop their viewport from the board-size calculation, but keep their cards
    // on the board so co-op partners can carry on.
    this.viewportByClient.delete(client.sessionId);
    this.ensureBoardSize();
  }

  // ---------------------------------------------------------------------------
  // Message handlers
  // ---------------------------------------------------------------------------
  private registerHandlers(): void {
    this.onMessage(ClientMessage.BuyCard, (client, msg: BuyCardPayload) =>
      this.handleBuy(client, msg),
    );
    this.onMessage(ClientMessage.SellCard, (client, msg: SellCardPayload) =>
      this.handleSell(client, msg),
    );
    this.onMessage(ClientMessage.PlaceCard, (client, msg: PlaceCardPayload) =>
      this.handlePlace(client, msg),
    );
    this.onMessage(ClientMessage.PickUpCard, (client, msg: PickUpCardPayload) =>
      this.handlePickUp(client, msg),
    );
    this.onMessage(ClientMessage.EvolveCard, (client, msg: EvolveCardPayload) =>
      this.handleEvolve(client, msg),
    );
    this.onMessage(ClientMessage.ReadyUp, (client) => this.handleReady(client));
    this.onMessage(ClientMessage.RerollShop, (client) => this.handleReroll(client));
    this.onMessage(ClientMessage.LockShop, (client) => this.handleLockShop(client));
    this.onMessage(ClientMessage.Restart, (client) => this.handleRestart(client));
    this.onMessage(ClientMessage.SetViewport, (client, msg: SetViewportPayload) =>
      this.handleSetViewport(client, msg),
    );
    this.onMessage(ClientMessage.Inspect, (_client, _msg: InspectPayload) => {
      /* inspection is purely client-side off synced state; no-op server side */
    });
  }

  private handleSetViewport(client: Client, msg: SetViewportPayload): void {
    if (!this.state.players.has(client.sessionId)) return;
    const cols = Math.max(1, Math.min(MAX_BOARD_COLS, Math.floor(msg.cols)));
    const rows = Math.max(1, Math.min(MAX_BOARD_ROWS, Math.floor(msg.rows)));
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    this.viewportByClient.set(client.sessionId, { cols, rows });
    this.ensureBoardSize();
  }

  private handleBuy(client: Client, msg: BuyCardPayload): void {
    if (this.state.phase !== GamePhase.Shopping) return;
    const player = this.state.players.get(client.sessionId);
    const offer = this.state.shop[msg.offerIndex];
    if (!player || !offer || offer.sold) return;
    if (player.gold < offer.cost) return;

    player.gold -= offer.cost;
    offer.sold = true;
    if (!player.collection.includes(offer.defId)) player.collection.push(offer.defId);

    const card = createCard(offer.defId, player.id, CardTier.Base);
    this.state.cards.set(card.instanceId, card);
  }

  private handleSell(client: Client, msg: SellCardPayload): void {
    // Selling only allowed in a shop (Shopping phase).
    if (this.state.phase !== GamePhase.Shopping) return;
    const player = this.state.players.get(client.sessionId);
    const card = this.state.cards.get(msg.cardInstanceId);
    if (!player || !card || card.ownerId !== player.id) return;

    const def = CARD_CATALOG[card.defId];
    if (!def) return;
    player.gold += getTierStats(def, card.tier as CardTier).sellValue;
    this.state.cards.delete(card.instanceId);
  }

  private handlePlace(client: Client, msg: PlaceCardPayload): void {
    const player = this.state.players.get(client.sessionId);
    const card = this.state.cards.get(msg.cardInstanceId);
    if (!player || !card || card.ownerId !== player.id) return;

    if (!canPlace(this.state, msg.pos.x, msg.pos.y, card.w, card.h, card.instanceId)) {
      this.sendLog(client, "Can't place there.", "warn");
      return;
    }
    card.location = "board";
    card.x = msg.pos.x;
    card.y = msg.pos.y;
  }

  private handlePickUp(client: Client, msg: PickUpCardPayload): void {
    const player = this.state.players.get(client.sessionId);
    const card = this.state.cards.get(msg.cardInstanceId);
    if (!player || !card || card.ownerId !== player.id) return;
    card.location = "hand";
    card.x = -1;
    card.y = -1;
  }

  private handleEvolve(client: Client, msg: EvolveCardPayload): void {
    const player = this.state.players.get(client.sessionId);
    const a = this.state.cards.get(msg.cardInstanceIdA);
    const b = this.state.cards.get(msg.cardInstanceIdB);
    if (!player || !a || !b) return;
    if (a.ownerId !== player.id || b.ownerId !== player.id) return;
    if (a.instanceId === b.instanceId) return;
    if (a.defId !== b.defId || a.tier !== b.tier) return;
    if (a.tier >= CardTier.Grand) return;

    const nextTier = (a.tier + 1) as CardTier;
    this.state.cards.delete(a.instanceId);
    this.state.cards.delete(b.instanceId);
    const evolved = createCard(a.defId, player.id, nextTier);
    this.state.cards.set(evolved.instanceId, evolved);
    this.sendLog(client, `Evolved into ${getTierStats(CARD_CATALOG[a.defId], nextTier).name}!`);
  }

  private handleReady(client: Client): void {
    if (this.state.phase !== GamePhase.Shopping) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = true;

    const connected = [...this.state.players.values()].filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.ready)) {
      this.startBattle();
      return;
    }
    // Some are ready but not all: give the stragglers a grace window, then go.
    if (this.readyDeadline === 0 && connected.some((p) => p.ready)) {
      this.readyDeadline = Date.now() + BALANCE.readyTimeoutMs;
      const secs = Math.round(BALANCE.readyTimeoutMs / 1000);
      this.broadcast(ServerEvent.Log, {
        message: `A climber is ready. Battle starts in ${secs}s if the party doesn't.`,
        level: "info",
      });
    }
  }

  private handleReroll(client: Client): void {
    if (this.state.phase !== GamePhase.Shopping) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    // Each reroll on a floor costs 1 more than the last (1, 2, 3, ...).
    const cost = BALANCE.shop.rerollCost + this.state.rerollCount;
    if (player.gold < cost) return;
    player.gold -= cost;
    this.state.rerollCount += 1;
    // An explicit reroll overrides any lock.
    this.state.shopLocked = false;
    rollShop(this.state);
  }

  private handleLockShop(client: Client): void {
    if (this.state.phase !== GamePhase.Shopping) return;
    if (!this.state.players.has(client.sessionId)) return;
    this.state.shopLocked = !this.state.shopLocked;
  }

  /** Per-floor stipend + interest on savings; softens a bad battle. */
  private grantFloorEconomy(): void {
    const { floorIncome, interestPer, interestMax } = BALANCE.economy;
    this.state.players.forEach((p) => {
      if (!p.connected) return;
      const interest = Math.min(interestMax, Math.floor(p.gold / interestPer));
      p.gold += floorIncome + interest;
    });
    this.broadcast(ServerEvent.Log, {
      message: `Floor income: +${floorIncome}g plus interest on your savings.`,
      level: "info",
    });
  }

  // ---------------------------------------------------------------------------
  // Phase transitions
  // ---------------------------------------------------------------------------
  private startBattle(): void {
    this.readyDeadline = 0;
    this.state.phase = GamePhase.Battle;
    this.state.timeRemainingMs = BALANCE.battleDurationMs;
    this.state.killStreak = 0;
    this.state.streakTimerMs = 0;
    this.state.players.forEach((p) => (p.ready = false));
    // Reset cooldowns so the battle starts fresh.
    this.state.cards.forEach((c) => {
      if (c.location === "board") {
        const def = CARD_CATALOG[c.defId];
        if (def) {
          c.cooldownTotalMs = computeBaseCooldown(def, c.tier as CardTier);
          c.cooldownRemainingMs = c.cooldownTotalMs;
        }
      }
    });
  }

  private advanceFloor(): void {
    const next = this.state.floor + 1;
    this.regenFloor(next);
    // Each floor's shop starts cheap to reroll again.
    this.state.rerollCount = 0;
    // Clearing a floor widens your toolbox: new cards unlock into every
    // collection before the shop rolls, so they can appear immediately.
    this.applyFloorUnlocks(next);
    // A locked shop carries its offers into the new floor; otherwise reroll.
    if (!this.state.shopLocked) rollShop(this.state);
    this.state.phase = GamePhase.Shopping;
    this.state.timeRemainingMs = 0;
    this.state.killStreak = 0;
    this.state.streakTimerMs = 0;
    this.floorClearedAt = 0;
    this.readyDeadline = 0;
    this.grantFloorEconomy();
    // Return surviving board cards to their owners' hands for re-placement;
    // summoned tokens (bees, etc.) don't persist between floors.
    const tokenIds: string[] = [];
    this.state.cards.forEach((c) => {
      if (c.token) {
        tokenIds.push(c.instanceId);
        return;
      }
      c.location = "hand";
      c.x = -1;
      c.y = -1;
      c.attacking = false;
      c.takingDamage = false;
    });
    for (const id of tokenIds) this.state.cards.delete(id);
    this.state.players.forEach((p) => (p.ready = false));
  }

  private endGame(victory: boolean): void {
    this.state.phase = victory ? GamePhase.Victory : GamePhase.Defeat;
  }

  /** Unlock the cards granted for reaching `floor` into every collection. */
  private applyFloorUnlocks(floor: number): void {
    const unlocks = FLOOR_UNLOCKS[floor];
    if (!unlocks || unlocks.length === 0) return;
    const fresh: string[] = [];
    this.state.players.forEach((p) => {
      for (const id of unlocks) {
        if (!p.collection.includes(id)) {
          p.collection.push(id);
          if (!fresh.includes(id)) fresh.push(id);
        }
      }
    });
    if (fresh.length > 0) {
      const names = fresh.map((id) => getTierStats(CARD_CATALOG[id], CardTier.Base).name).join(", ");
      this.broadcast(ServerEvent.Log, {
        message: `New cards unlocked: ${names}!`,
        level: "info",
      });
    }
  }

  /** Player chose to climb again from the Defeat/Victory screen. */
  private handleRestart(client: Client): void {
    if (this.state.phase !== GamePhase.Defeat && this.state.phase !== GamePhase.Victory) return;
    if (!this.state.players.has(client.sessionId)) return;
    this.resetGame();
    this.broadcast(ServerEvent.Log, { message: "A new climb begins!", level: "info" });
  }

  /** Tear down a finished run and rebuild a fresh floor-1 Shopping state. */
  private resetGame(): void {
    this.state.cards.clear();
    // Drop players who already disconnected; keep the active party.
    const stale: string[] = [];
    this.state.players.forEach((p, id) => {
      if (!p.connected) stale.push(id);
    });
    for (const id of stale) this.state.players.delete(id);
    this.state.players.forEach((p) => {
      p.gold = BALANCE.startingGold;
      p.ready = false;
      // A fresh climb starts from the tight starter toolkit again.
      p.collection.clear();
      for (const id of STARTER_COLLECTION) p.collection.push(id);
    });
    this.state.killStreak = 0;
    this.state.streakTimerMs = 0;
    this.state.timeRemainingMs = 0;
    this.state.shopLocked = false;
    this.floorClearedAt = 0;
    this.readyDeadline = 0;
    this.regenFloor(1);
    this.state.rerollCount = 0;
    rollShop(this.state);
    this.state.phase = GamePhase.Shopping;
  }

  // ---------------------------------------------------------------------------
  // Simulation loop
  // ---------------------------------------------------------------------------
  private update(dt: number): void {
    if (this.state.phase === GamePhase.Shopping) {
      // AFK fallback: once the grace window lapses, start without the stragglers.
      if (this.readyDeadline > 0 && Date.now() >= this.readyDeadline) {
        this.startBattle();
      }
      return;
    }

    if (this.state.phase === GamePhase.Battle) {
      updateCombat(this.state, dt, (event: ServerEvent, payload: unknown) =>
        this.broadcast(event, payload),
      );

      this.state.timeRemainingMs = Math.max(0, this.state.timeRemainingMs - dt);

      // Win: key acquired -> brief celebration, then advance.
      if (this.state.keyAcquired) {
        this.state.phase = GamePhase.FloorCleared;
        this.floorClearedAt = Date.now();
        return;
      }

      // Lose: out of time, or no real cards left to fight with (tokens don't count).
      let realCards = 0;
      this.state.cards.forEach((c) => {
        if (!c.token) realCards++;
      });
      if (this.state.timeRemainingMs <= 0 || realCards === 0) {
        this.endGame(false);
      }
      return;
    }

    if (this.state.phase === GamePhase.FloorCleared) {
      if (Date.now() - this.floorClearedAt > BALANCE.floorClearedCelebrationMs) {
        // Reaching the summit's key wins the run instead of generating more.
        if (this.state.floor >= this.state.maxFloor) this.endGame(true);
        else this.advanceFloor();
      }
    }
  }

  private sendLog(client: Client, message: string, level: "info" | "warn" | "error" = "info") {
    client.send(ServerEvent.Log, { message, level });
  }
}
