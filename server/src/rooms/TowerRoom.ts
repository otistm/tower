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
import { STARTER_POOL, rollShop } from "../systems/shop.js";

const STARTER_COLLECTION = STARTER_POOL;
const PLAYER_COLORS = ["#ffcc00", "#33ccff", "#66ff99", "#ff6699", "#cc99ff"];

/** One room == one co-op tower climb. */
export class TowerRoom extends Room<GameState> {
  maxClients = 4;
  private floorClearedAt = 0;
  /** When >0, the battle auto-starts at this timestamp (AFK ready fallback). */
  private readyDeadline = 0;

  onCreate(): void {
    this.setState(new GameState());
    this.state.phase = GamePhase.Shopping;
    this.state.maxFloor = BALANCE.maxFloor;
    generateFloor(this.state, 1);
    rollShop(this.state);

    this.registerHandlers();
    this.setSimulationInterval((dt) => this.update(dt), BALANCE.tickMs);
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------
  onJoin(client: Client, options: { name?: string } = {}): void {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = options.name?.slice(0, 16) || `Climber ${this.state.players.size + 1}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    player.gold = BALANCE.startingGold; // gold is granted at the start of the first floor
    player.connected = true;
    for (const id of STARTER_COLLECTION) player.collection.push(id);
    this.state.players.set(client.sessionId, player);

    // Refresh the shop so newly joined collections widen the pool (unless locked).
    if (this.state.phase === GamePhase.Shopping && !this.state.shopLocked) rollShop(this.state);
  }

  onLeave(client: Client, consented: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    // Keep their cards on the board so co-op partners can carry on.
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
    this.onMessage(ClientMessage.Inspect, (_client, _msg: InspectPayload) => {
      /* inspection is purely client-side off synced state; no-op server side */
    });
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
    if (!player || player.gold < BALANCE.shop.rerollCost) return;
    player.gold -= BALANCE.shop.rerollCost;
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
    generateFloor(this.state, next);
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
