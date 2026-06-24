# Tower - Co-op Card Autobattler

Climb a tower of grid-based floors with friends. Defeat each floor's boss to claim
the key to the next floor. Buy, discover, evolve, and trade cards as you ascend.

This repository is the structural foundation: an authoritative multiplayer server,
a synced game model, and a playable client skeleton with a full-screen board and
card hand.

## Stack

- **Client:** [React](https://react.dev/) with a DOM/CSS board (a single
  `translate(x,y) scale(z)` camera over a grid of cells) plus the UI overlay (hand
  carousel, shop, HUD, inspector). Drag-and-drop uses a pointer-following clone with
  a camera-aware snap preview and a sell zone. State is synced with
  [colyseus.js](https://docs.colyseus.io/).
- **Server:** [Colyseus](https://colyseus.io/) on Node.js holds the authoritative
  game state and runs the autobattle simulation loop.
- **Shared:** A TypeScript package of domain types and the card catalog, consumed by
  both sides.

## Workspace layout

```text
shared/   # @tower/shared  - enums, card catalog, network message contracts
server/   # @tower/server  - Colyseus rooms, schema, combat/synergy/tower systems
client/   # @tower/client  - React UI overlay + DOM/CSS board (ui/board)
```

### Server systems (`server/src/systems`)

- `grid.ts` - occupancy, footprint and placement validation.
- `cardFactory.ts` - builds live card instances from catalog defs.
- `synergy.ts` - adjacency synergies, aura buffs/debuffs, weather, shields, reflects.
- `combat.ts` - the autobattler tick loop (cooldowns by size, attacks, deaths, loot).
- `towerGen.ts` - procedural floor layout (boss, minions, obstacles, chests, door).
- `shop.ts` - rolls offers from the union of players' unlocked collections.

## Core rules modeled

- **Card sizes** small (1x1), medium (1x2), large (2x2); smaller = faster cooldown.
- **Card types** Stuff, Living, Boom, Thinking, Built - each reacts to weather.
- **3-tier evolution** combine two identical cards to evolve (e.g. tiger pup -> tiger
  -> grand tiger).
- **Persistent vs consumable** consumables are destroyed after one use (e.g. rocket).
- **Synergies** adjacency effects (dragon + furnace = more fire; wind = faster;
  wall = shield; mirror = reflect).
- **Economy** gold is earned (boss/minion kills, chest discoveries), never given
  blindly; cards can be sold only in shops.
- **Collections** only cards a player has unlocked appear in the shop.
- **Win/lose** clear a floor by taking the boss's key; lose by running out of time
  or cards.

## Getting started

```bash
# from the repo root
npm install

# build the shared package once (the dev script also does this)
npm run build:shared

# run server + client together
npm run dev
```

- Client: http://localhost:5173
- Server: ws://localhost:2567 (Colyseus monitor at http://localhost:2567/colyseus)

Open the client in two browser windows to test co-op. Enter a name, buy cards in the
shop, drag them onto the board, then press **Ready** to start the autobattle.

## Notes / next steps

- Card art is currently placeholder gradients; the design calls for full-bleed images
  per card (swap `CardFace` and the Phaser sprite rects for textures).
- Trading between players has message contracts defined but no UI yet.
- Mini-boards / hidden shops via portals are stubbed as board entities.
