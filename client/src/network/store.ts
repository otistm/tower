import { Client, Room } from "colyseus.js";
import {
  BuyCardPayload,
  ClientMessage,
  EvolveCardPayload,
  PlaceCardPayload,
  PickUpCardPayload,
  SellCardPayload,
  ServerEvent,
} from "@tower/shared";
import { create } from "zustand";
import { ROOM_NAME, SERVER_URL } from "../config";
import { emitGoldAwarded, GoldAward } from "../ui/board/coinFx";
import { AbilityFiredVfx, emitAbilityFired } from "../ui/board/strikeFx";
import { DamageVfx, emitDamage } from "../ui/board/dmgFx";
import {
  CardSnapshot,
  EntitySnapshot,
  GameSnapshot,
  PlayerSnapshot,
  ShopOfferSnapshot,
} from "./types";

/** Colyseus MapSchema/ArraySchema both expose forEach; type loosely. */
interface IterableLike<T> {
  forEach: (cb: (value: T, key: string | number) => void) => void;
}

function mapToRecord<S, T>(
  map: IterableLike<S> | undefined,
  keyField: keyof T,
  pick: (v: S) => T,
): Record<string, T> {
  const out: Record<string, T> = {};
  map?.forEach((v) => {
    const obj = pick(v);
    out[String(obj[keyField])] = obj;
  });
  return out;
}

/**
 * Build a plain snapshot from the (reflected) Colyseus state by iterating its
 * collections. We avoid `state.toJSON()` because the reflected schema does not
 * reliably serialize nested map/array fields on the client.
 */
function serializeState(state: any): GameSnapshot {
  const cards = mapToRecord<any, CardSnapshot>(state.cards, "instanceId", (c) => ({
    instanceId: c.instanceId,
    defId: c.defId,
    ownerId: c.ownerId,
    location: c.location,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    size: c.size,
    cardType: c.cardType,
    durability: c.durability,
    tier: c.tier,
    health: c.health,
    maxHealth: c.maxHealth,
    cooldownTotalMs: c.cooldownTotalMs,
    cooldownRemainingMs: c.cooldownRemainingMs,
    attacking: c.attacking,
    takingDamage: c.takingDamage,
    shield: c.shield,
  }));

  const entities = mapToRecord<any, EntitySnapshot>(state.entities, "entityId", (e) => ({
    entityId: e.entityId,
    kind: e.kind,
    family: e.family,
    art: e.art,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    health: e.health,
    maxHealth: e.maxHealth,
    attackPower: e.attackPower,
    cooldownTotalMs: e.cooldownTotalMs,
    cooldownRemainingMs: e.cooldownRemainingMs,
    blocking: e.blocking,
    hidden: e.hidden,
    rewardCardId: e.rewardCardId,
    rewardGold: e.rewardGold,
    attacking: e.attacking,
    takingDamage: e.takingDamage,
  }));

  const players = mapToRecord<any, PlayerSnapshot>(state.players, "id", (p) => {
    const collection: string[] = [];
    p.collection?.forEach((id: string) => collection.push(id));
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      gold: p.gold,
      ready: p.ready,
      connected: p.connected,
      collection,
    };
  });

  const shop: ShopOfferSnapshot[] = [];
  state.shop?.forEach((o: any) =>
    shop.push({
      defId: o.defId,
      name: o.name,
      art: o.art,
      size: o.size,
      cardType: o.cardType,
      rarity: o.rarity,
      cost: o.cost,
      sold: o.sold,
    }),
  );

  return {
    phase: state.phase,
    floor: state.floor,
    maxFloor: state.maxFloor,
    weather: state.weather,
    boardWidth: state.boardWidth,
    boardHeight: state.boardHeight,
    timeRemainingMs: state.timeRemainingMs,
    keyAcquired: state.keyAcquired,
    killStreak: state.killStreak,
    shopLocked: state.shopLocked,
    cards,
    entities,
    players,
    shop,
  };
}

export interface ToastMessage {
  id: number;
  text: string;
  level: "info" | "warn" | "error";
}

interface GameStoreState {
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  room: Room | null;
  sessionId: string | null;
  snapshot: GameSnapshot | null;
  selectedCell: { x: number; y: number } | null;
  toasts: ToastMessage[];

  connect: (name: string) => Promise<void>;
  disconnect: () => void;
  selectCell: (cell: { x: number; y: number } | null) => void;
  pushToast: (text: string, level?: ToastMessage["level"]) => void;

  buyCard: (offerIndex: number) => void;
  sellCard: (cardInstanceId: string) => void;
  placeCard: (cardInstanceId: string, x: number, y: number) => void;
  pickUpCard: (cardInstanceId: string) => void;
  evolveCard: (a: string, b: string) => void;
  readyUp: () => void;
  rerollShop: () => void;
  lockShop: () => void;
}

let toastId = 0;

export const useGameStore = create<GameStoreState>((set, get) => ({
  status: "idle",
  error: null,
  room: null,
  sessionId: null,
  snapshot: null,
  selectedCell: null,
  toasts: [],

  connect: async (name: string) => {
    if (get().status === "connecting" || get().status === "connected") return;
    set({ status: "connecting", error: null });
    try {
      const client = new Client(SERVER_URL);
      const room = await client.joinOrCreate(ROOM_NAME, { name });

      room.onStateChange((state) => {
        set({ snapshot: serializeState(state) });
      });

      room.onMessage(ServerEvent.Log, (msg: { message: string; level?: ToastMessage["level"] }) => {
        get().pushToast(msg.message, msg.level ?? "info");
      });
      room.onMessage(ServerEvent.Discovery, (msg: { message: string }) => {
        get().pushToast(msg.message, "info");
      });
      room.onMessage(ServerEvent.FloorCleared, (msg: { floor: number }) => {
        get().pushToast(`Floor ${msg.floor} cleared! The key is yours.`, "info");
      });
      room.onMessage(ServerEvent.GoldAwarded, (msg: GoldAward) => emitGoldAwarded(msg));
      room.onMessage(ServerEvent.AbilityFired, (msg: AbilityFiredVfx) => emitAbilityFired(msg));
      room.onMessage(ServerEvent.Damage, (msg: DamageVfx) => emitDamage(msg));

      room.onError((code, message) => set({ status: "error", error: `${code}: ${message}` }));
      room.onLeave(() => set({ status: "idle", room: null }));

      set({
        status: "connected",
        room,
        sessionId: room.sessionId,
        snapshot: serializeState(room.state),
      });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  disconnect: () => {
    get().room?.leave();
    set({ status: "idle", room: null, snapshot: null });
  },

  selectCell: (cell) => set({ selectedCell: cell }),

  pushToast: (text, level = "info") => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, level }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },

  buyCard: (offerIndex) =>
    get().room?.send(ClientMessage.BuyCard, { offerIndex } satisfies BuyCardPayload),
  sellCard: (cardInstanceId) =>
    get().room?.send(ClientMessage.SellCard, { cardInstanceId } satisfies SellCardPayload),
  placeCard: (cardInstanceId, x, y) =>
    get().room?.send(ClientMessage.PlaceCard, {
      cardInstanceId,
      pos: { x, y },
    } satisfies PlaceCardPayload),
  pickUpCard: (cardInstanceId) =>
    get().room?.send(ClientMessage.PickUpCard, { cardInstanceId } satisfies PickUpCardPayload),
  evolveCard: (a, b) =>
    get().room?.send(ClientMessage.EvolveCard, {
      cardInstanceIdA: a,
      cardInstanceIdB: b,
    } satisfies EvolveCardPayload),
  readyUp: () => get().room?.send(ClientMessage.ReadyUp, {}),
  rerollShop: () => get().room?.send(ClientMessage.RerollShop, {}),
  lockShop: () => get().room?.send(ClientMessage.LockShop, {}),
}));
