import {
  AbilityKind,
  CardDef,
  CardDurability,
  CardSize,
  CardTier,
  CardType,
  Rarity,
  TargetShape,
  TargetTeam,
} from "./types.js";

/**
 * The card catalog. Every card has 3 tiers. Two of tier N combine into one tier N+1.
 * Art keys reference full-bleed images (loaded client-side); placeholders for now.
 */
export const CARD_CATALOG: Record<string, CardDef> = {
  // ---------------------------------------------------------------------------
  // LIVING - the tiger evolution line (pup -> tiger -> grand tiger)
  // ---------------------------------------------------------------------------
  tiger: {
    id: "tiger",
    family: "tiger",
    type: CardType.Living,
    size: CardSize.Medium,
    durability: CardDurability.Persistent,
    rarity: Rarity.Uncommon,
    lore: "A scary animal that bites - and feeds. A living predator mends itself on the hunt.",
    tiers: [
      {
        name: "Tiger Pup",
        maxHealth: 40,
        cooldownMultiplier: 1.0,
        sellValue: 2,
        buyCost: 5,
        art: "tiger_pup",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 6,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 2,
            lifesteal: 0.15,
            description: "Pounces on the nearest foe, healing for a little of the damage.",
          },
        ],
      },
      {
        name: "Tiger",
        maxHealth: 90,
        cooldownMultiplier: 0.9,
        sellValue: 6,
        buyCost: 0,
        art: "tiger",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 14,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 3,
            lifesteal: 0.3,
            description: "Bites ferociously and feeds, healing on the kill.",
          },
        ],
      },
      {
        name: "Grand Tiger",
        maxHealth: 180,
        cooldownMultiplier: 0.8,
        sellValue: 16,
        buyCost: 0,
        art: "grand_tiger",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 30,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 3,
            lifesteal: 0.4,
            description: "A devastating maul that can strike several foes and feast on them.",
          },
        ],
      },
    ],
    synergies: [
      {
        withCardId: "wind",
        effect: { cooldownMultiplier: 0.7 },
        description: "Wind at its back: the tiger attacks faster.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // BOOM - the dragon line (drake -> dragon -> elder dragon)
  // ---------------------------------------------------------------------------
  dragon: {
    id: "dragon",
    family: "dragon",
    type: CardType.Boom,
    size: CardSize.Large,
    durability: CardDurability.Persistent,
    rarity: Rarity.Epic,
    lore: "Breathes fire. Boom is the only thing that truly breaks stuff.",
    tiers: [
      {
        name: "Drake",
        maxHealth: 70,
        cooldownMultiplier: 1.0,
        sellValue: 8,
        buyCost: 14,
        art: "drake",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 18,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 4,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "Spits a small burst of flame that melts Stuff.",
          },
        ],
      },
      {
        name: "Dragon",
        maxHealth: 140,
        cooldownMultiplier: 0.95,
        sellValue: 20,
        buyCost: 0,
        art: "dragon",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 36,
            target: TargetTeam.Enemies,
            shape: TargetShape.Row,
            range: 5,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "Breathes a line of fire across the row, melting Stuff.",
          },
        ],
      },
      {
        name: "Elder Dragon",
        maxHealth: 260,
        cooldownMultiplier: 0.9,
        sellValue: 48,
        buyCost: 0,
        art: "elder_dragon",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 64,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            range: 6,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "An inferno scorches everything nearby and liquefies Stuff.",
          },
        ],
      },
    ],
    synergies: [
      {
        withCardId: "furnace",
        effect: { damageMultiplier: 1.5 },
        description: "Next to a furnace, the dragon's fire roars hotter.",
      },
      {
        withCardId: "wind",
        effect: { cooldownMultiplier: 0.7 },
        description: "Wind fans the flames: the dragon attacks faster.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // BOOM - rocket (consumable single-blast that scorches terrain)
  // ---------------------------------------------------------------------------
  rocket: {
    id: "rocket",
    family: "rocket",
    type: CardType.Boom,
    size: CardSize.Medium,
    durability: CardDurability.Consumable,
    rarity: Rarity.Rare,
    lore: "Blasts off, leaving scorched earth and a cloud of smoke. Used once, then gone.",
    tiers: [
      {
        name: "Bottle Rocket",
        cooldownMultiplier: 1.0,
        sellValue: 3,
        buyCost: 6,
        art: "rocket_bottle",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 40,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            range: 1,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "Explodes on launch, scorching the earth and shattering Stuff.",
          },
          {
            kind: AbilityKind.Terrain,
            power: 6,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 1,
            description: "Leaves burning ground that sears nearby foes.",
          },
        ],
      },
      {
        name: "Rocket",
        cooldownMultiplier: 1.0,
        sellValue: 8,
        buyCost: 0,
        art: "rocket",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 80,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            range: 1,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "A bigger blast with a wider scorch radius; pulverizes Stuff.",
          },
          {
            kind: AbilityKind.Terrain,
            power: 12,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 1,
            description: "Leaves burning ground that sears nearby foes.",
          },
        ],
      },
      {
        name: "Missile",
        cooldownMultiplier: 1.0,
        sellValue: 18,
        buyCost: 0,
        art: "missile",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 160,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            range: 2,
            bonusVsType: CardType.Stuff,
            bonusMultiplier: 1.5,
            description: "Massive detonation devastating a wide area, vaporizing Stuff.",
          },
          {
            kind: AbilityKind.Terrain,
            power: 24,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 2,
            description: "Leaves a blazing crater that burns everything near it.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // BUILT - lawnmower (cuts grass / Living-type and terrain)
  // ---------------------------------------------------------------------------
  lawnmower: {
    id: "lawnmower",
    family: "lawnmower",
    type: CardType.Built,
    size: CardSize.Medium,
    durability: CardDurability.Persistent,
    rarity: Rarity.Uncommon,
    lore: "Cuts grass. A tool that sits still until someone plays with it.",
    tiers: [
      {
        name: "Push Mower",
        maxHealth: 30,
        cooldownMultiplier: 1.1,
        sellValue: 2,
        buyCost: 5,
        art: "mower_push",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 10,
            target: TargetTeam.Enemies,
            shape: TargetShape.Row,
            range: 3,
            bonusVsType: CardType.Living,
            bonusMultiplier: 1.6,
            description: "Mows down every foe in its row - and shreds Living foes.",
          },
        ],
      },
      {
        name: "Riding Mower",
        maxHealth: 60,
        cooldownMultiplier: 1.0,
        sellValue: 7,
        buyCost: 0,
        art: "mower_riding",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 20,
            target: TargetTeam.Enemies,
            shape: TargetShape.Row,
            range: 5,
            bonusVsType: CardType.Living,
            bonusMultiplier: 1.6,
            description: "Faster mow across the whole row; tears Living foes apart.",
          },
        ],
      },
      {
        name: "Mega Mower",
        maxHealth: 110,
        cooldownMultiplier: 0.9,
        sellValue: 16,
        buyCost: 0,
        art: "mower_mega",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 38,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            range: 2,
            bonusVsType: CardType.Living,
            bonusMultiplier: 1.6,
            description: "Shreds everything around it, mulching Living foes.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // BUILT - furnace (boosts adjacent Boom; spawns heat)
  // ---------------------------------------------------------------------------
  furnace: {
    id: "furnace",
    family: "furnace",
    type: CardType.Built,
    size: CardSize.Medium,
    durability: CardDurability.Persistent,
    rarity: Rarity.Uncommon,
    lore: "A roaring fire box. Its heat makes nearby allies hit harder.",
    tiers: [
      {
        name: "Stove",
        maxHealth: 50,
        cooldownMultiplier: 1.0,
        sellValue: 3,
        buyCost: 6,
        art: "furnace_stove",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 1.2,
            target: TargetTeam.Allies,
            shape: TargetShape.Adjacent,
            description: "Heats adjacent allies, boosting their attack damage.",
          },
        ],
      },
      {
        name: "Furnace",
        maxHealth: 90,
        cooldownMultiplier: 1.0,
        sellValue: 8,
        buyCost: 0,
        art: "furnace",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 1.4,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Strongly empowers the attacks of all surrounding allies.",
          },
        ],
      },
      {
        name: "Forge",
        maxHealth: 160,
        cooldownMultiplier: 1.0,
        sellValue: 18,
        buyCost: 0,
        art: "forge",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 1.7,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "A blazing forge that supercharges nearby power.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // STUFF - wind (speeds up neighbors)  [classified Boom-adjacent but air = Stuff/Boom]
  // ---------------------------------------------------------------------------
  wind: {
    id: "wind",
    family: "wind",
    type: CardType.Boom,
    size: CardSize.Small,
    durability: CardDurability.Persistent,
    rarity: Rarity.Common,
    lore: "A gust of moving air. Speeds up the things around it.",
    tiers: [
      {
        name: "Breeze",
        cooldownMultiplier: 1.0,
        sellValue: 1,
        buyCost: 3,
        art: "wind_breeze",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 0.85,
            target: TargetTeam.Allies,
            shape: TargetShape.Adjacent,
            description: "Reduces adjacent allies' cooldowns.",
          },
        ],
      },
      {
        name: "Gust",
        cooldownMultiplier: 1.0,
        sellValue: 4,
        buyCost: 0,
        art: "wind_gust",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 0.75,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Speeds up surrounding allies more.",
          },
        ],
      },
      {
        name: "Gale",
        cooldownMultiplier: 1.0,
        sellValue: 10,
        buyCost: 0,
        art: "wind_gale",
        abilities: [
          {
            kind: AbilityKind.Buff,
            power: 0.6,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "A powerful gale greatly hastens nearby allies.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // STUFF - wall (shields connected cards until destroyed)
  // ---------------------------------------------------------------------------
  wall: {
    id: "wall",
    family: "wall",
    type: CardType.Stuff,
    size: CardSize.Medium,
    durability: CardDurability.Persistent,
    rarity: Rarity.Common,
    lore: "A heavy barrier. Protects connected cards until it is destroyed.",
    tiers: [
      {
        name: "Wood Wall",
        maxHealth: 120,
        cooldownMultiplier: 1.0,
        sellValue: 1,
        buyCost: 4,
        art: "wall_wood",
        abilities: [
          {
            kind: AbilityKind.Shield,
            power: 0.5,
            target: TargetTeam.Allies,
            shape: TargetShape.Adjacent,
            description: "Absorbs damage for adjacent allies.",
          },
        ],
      },
      {
        name: "Stone Wall",
        maxHealth: 280,
        cooldownMultiplier: 1.0,
        sellValue: 5,
        buyCost: 0,
        art: "wall_stone",
        abilities: [
          {
            kind: AbilityKind.Shield,
            power: 0.65,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Shields surrounding allies from harm.",
          },
        ],
      },
      {
        name: "Iron Bulwark",
        maxHealth: 600,
        cooldownMultiplier: 1.0,
        sellValue: 14,
        buyCost: 0,
        art: "wall_iron",
        abilities: [
          {
            kind: AbilityKind.Shield,
            power: 0.8,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Nearly impervious protection for nearby cards.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // STUFF - mirror (reflects attacks)
  // ---------------------------------------------------------------------------
  mirror: {
    id: "mirror",
    family: "mirror",
    type: CardType.Stuff,
    size: CardSize.Small,
    durability: CardDurability.Persistent,
    rarity: Rarity.Rare,
    lore: "A polished surface that reflects attacks back at attackers.",
    tiers: [
      {
        name: "Hand Mirror",
        maxHealth: 40,
        cooldownMultiplier: 1.0,
        sellValue: 3,
        buyCost: 7,
        art: "mirror_hand",
        abilities: [
          {
            kind: AbilityKind.Reflect,
            power: 0.4,
            target: TargetTeam.Allies,
            shape: TargetShape.Adjacent,
            description: "Reflects 40% of damage aimed at neighbors.",
          },
        ],
      },
      {
        name: "Mirror",
        maxHealth: 80,
        cooldownMultiplier: 1.0,
        sellValue: 8,
        buyCost: 0,
        art: "mirror",
        abilities: [
          {
            kind: AbilityKind.Reflect,
            power: 0.6,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Reflects 60% of incoming damage nearby.",
          },
        ],
      },
      {
        name: "Hall of Mirrors",
        maxHealth: 140,
        cooldownMultiplier: 1.0,
        sellValue: 18,
        buyCost: 0,
        art: "mirror_hall",
        abilities: [
          {
            kind: AbilityKind.Reflect,
            power: 0.9,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Reflects almost all damage back at attackers.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // STUFF / ECONOMY - diamond ring (sell for gold; trade to goblins for hidden shop)
  // ---------------------------------------------------------------------------
  diamond_ring: {
    id: "diamond_ring",
    family: "diamond_ring",
    type: CardType.Stuff,
    size: CardSize.Small,
    durability: CardDurability.Consumable,
    rarity: Rarity.Rare,
    lore: "A precious ring. Sells for gold, or buys goblin passage to a hidden shop.",
    tiers: [
      {
        name: "Silver Ring",
        cooldownMultiplier: 1.0,
        sellValue: 12,
        buyCost: 10,
        art: "ring_silver",
        abilities: [
          {
            kind: AbilityKind.Economy,
            power: 12,
            target: TargetTeam.Allies,
            shape: TargetShape.SelfCell,
            description: "Can be sold for gold or traded to goblins.",
          },
        ],
      },
      {
        name: "Gold Ring",
        cooldownMultiplier: 1.0,
        sellValue: 30,
        buyCost: 0,
        art: "ring_gold",
        abilities: [
          {
            kind: AbilityKind.Economy,
            power: 30,
            target: TargetTeam.Allies,
            shape: TargetShape.SelfCell,
            description: "Worth even more gold; opens better goblin deals.",
          },
        ],
      },
      {
        name: "Diamond Ring",
        cooldownMultiplier: 1.0,
        sellValue: 75,
        buyCost: 0,
        art: "ring_diamond",
        abilities: [
          {
            kind: AbilityKind.Economy,
            power: 75,
            target: TargetTeam.Allies,
            shape: TargetShape.SelfCell,
            description: "A fortune in a ring; grants entry to hidden shops.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // LIVING - moss (self-healing spreader)
  // ---------------------------------------------------------------------------
  moss: {
    id: "moss",
    family: "moss",
    type: CardType.Living,
    size: CardSize.Small,
    durability: CardDurability.Persistent,
    rarity: Rarity.Common,
    lore: "Green moss that grows and mends. Heals nearby living things.",
    tiers: [
      {
        name: "Moss Patch",
        maxHealth: 25,
        cooldownMultiplier: 1.0,
        sellValue: 1,
        buyCost: 3,
        art: "moss_patch",
        abilities: [
          {
            kind: AbilityKind.Heal,
            power: 5,
            target: TargetTeam.Allies,
            shape: TargetShape.Adjacent,
            description: "Heals adjacent allies a little each tick.",
          },
        ],
      },
      {
        name: "Moss Bed",
        maxHealth: 55,
        cooldownMultiplier: 0.95,
        sellValue: 4,
        buyCost: 0,
        art: "moss_bed",
        abilities: [
          {
            kind: AbilityKind.Heal,
            power: 11,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "Heals surrounding allies.",
          },
        ],
      },
      {
        name: "Ancient Grove",
        maxHealth: 120,
        cooldownMultiplier: 0.9,
        sellValue: 12,
        buyCost: 0,
        art: "grove",
        abilities: [
          {
            kind: AbilityKind.Heal,
            power: 24,
            target: TargetTeam.Allies,
            shape: TargetShape.Surrounding,
            description: "A grove that strongly mends all nearby life.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // THINKING - fear totem (debuffs enemies; never deals physical damage)
  // ---------------------------------------------------------------------------
  fear_totem: {
    id: "fear_totem",
    family: "fear_totem",
    type: CardType.Thinking,
    size: CardSize.Small,
    durability: CardDurability.Persistent,
    rarity: Rarity.Uncommon,
    lore: "Radiates dread. Makes enemies hesitate and weakens them, but never wounds.",
    tiers: [
      {
        name: "Eerie Idol",
        maxHealth: 30,
        cooldownMultiplier: 1.0,
        sellValue: 2,
        buyCost: 5,
        art: "totem_eerie",
        abilities: [
          {
            kind: AbilityKind.Debuff,
            power: 1.2,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            description: "Frightens nearby foes, slowing their cooldowns.",
          },
        ],
      },
      {
        name: "Fear Totem",
        maxHealth: 60,
        cooldownMultiplier: 1.0,
        sellValue: 6,
        buyCost: 0,
        art: "totem_fear",
        abilities: [
          {
            kind: AbilityKind.Debuff,
            power: 1.4,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            description: "Greater dread weakens foes' attacks.",
          },
        ],
      },
      {
        name: "Nightmare Obelisk",
        maxHealth: 110,
        cooldownMultiplier: 1.0,
        sellValue: 16,
        buyCost: 0,
        art: "obelisk_nightmare",
        abilities: [
          {
            kind: AbilityKind.Debuff,
            power: 1.8,
            target: TargetTeam.Enemies,
            shape: TargetShape.Surrounding,
            description: "Crippling terror cuts enemy power dramatically.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // LIVING - beehive (SPAWN: summons short-lived bee tokens that swarm foes)
  // ---------------------------------------------------------------------------
  beehive: {
    id: "beehive",
    family: "beehive",
    type: CardType.Living,
    size: CardSize.Medium,
    durability: CardDurability.Persistent,
    rarity: Rarity.Uncommon,
    lore: "A buzzing hive. Sends out swarms of bees that harry nearby enemies.",
    tiers: [
      {
        name: "Wild Hive",
        maxHealth: 45,
        cooldownMultiplier: 1.2,
        sellValue: 3,
        buyCost: 6,
        art: "beehive_wild",
        abilities: [
          {
            kind: AbilityKind.Spawn,
            power: 1,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 2,
            spawnId: "bee",
            description: "Releases a bee to swarm the nearest foe.",
          },
        ],
      },
      {
        name: "Beehive",
        maxHealth: 85,
        cooldownMultiplier: 1.1,
        sellValue: 8,
        buyCost: 0,
        art: "beehive",
        abilities: [
          {
            kind: AbilityKind.Spawn,
            power: 2,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 2,
            spawnId: "bee",
            description: "Releases two bees to swarm foes.",
          },
        ],
      },
      {
        name: "Great Apiary",
        maxHealth: 150,
        cooldownMultiplier: 1.0,
        sellValue: 18,
        buyCost: 0,
        art: "apiary",
        abilities: [
          {
            kind: AbilityKind.Spawn,
            power: 3,
            target: TargetTeam.Empty,
            shape: TargetShape.Surrounding,
            range: 2,
            spawnId: "bee",
            description: "Unleashes a furious swarm of bees.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // LIVING - bee (TOKEN: summoned by the beehive; not bought or discovered)
  // ---------------------------------------------------------------------------
  bee: {
    id: "bee",
    family: "bee",
    type: CardType.Living,
    size: CardSize.Small,
    durability: CardDurability.Persistent,
    rarity: Rarity.Common,
    token: true,
    lore: "A single angry bee. Stings foes, then is gone.",
    tiers: [
      {
        name: "Bee",
        maxHealth: 10,
        cooldownMultiplier: 0.7,
        sellValue: 0,
        buyCost: 0,
        art: "bee",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 4,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 2,
            description: "Stings the nearest foe.",
          },
        ],
      },
      {
        name: "Bee",
        maxHealth: 10,
        cooldownMultiplier: 0.7,
        sellValue: 0,
        buyCost: 0,
        art: "bee",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 4,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 2,
            description: "Stings the nearest foe.",
          },
        ],
      },
      {
        name: "Bee",
        maxHealth: 10,
        cooldownMultiplier: 0.7,
        sellValue: 0,
        buyCost: 0,
        art: "bee",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 4,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 2,
            description: "Stings the nearest foe.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // BUILT - lockpick (UTILITY: cracks open the nearest chest for its loot)
  // ---------------------------------------------------------------------------
  lockpick: {
    id: "lockpick",
    family: "lockpick",
    type: CardType.Built,
    size: CardSize.Small,
    durability: CardDurability.Consumable,
    rarity: Rarity.Uncommon,
    lore: "A clever tool. Springs open a chest's lock from across the room, then snaps.",
    tiers: [
      {
        name: "Lockpick",
        cooldownMultiplier: 1.0,
        sellValue: 2,
        buyCost: 4,
        art: "lockpick",
        abilities: [
          {
            kind: AbilityKind.Utility,
            power: 1,
            target: TargetTeam.Any,
            shape: TargetShape.Global,
            description: "Cracks open the nearest chest for its loot.",
          },
        ],
      },
      {
        name: "Skeleton Key",
        cooldownMultiplier: 1.0,
        sellValue: 6,
        buyCost: 0,
        art: "key_skeleton",
        abilities: [
          {
            kind: AbilityKind.Utility,
            power: 2,
            target: TargetTeam.Any,
            shape: TargetShape.Global,
            description: "Opens the nearest chest, loot and all.",
          },
        ],
      },
      {
        name: "Master Key",
        cooldownMultiplier: 1.0,
        sellValue: 14,
        buyCost: 0,
        art: "key_master",
        abilities: [
          {
            kind: AbilityKind.Utility,
            power: 3,
            target: TargetTeam.Any,
            shape: TargetShape.Global,
            description: "Throws open the nearest chest instantly.",
          },
        ],
      },
    ],
    synergies: [],
  },

  // ---------------------------------------------------------------------------
  // BUILT - wooden sword (a 1x1 trinket dropped by slain goblins)
  // ---------------------------------------------------------------------------
  wooden_sword: {
    id: "wooden_sword",
    family: "wooden_sword",
    type: CardType.Built,
    size: CardSize.Tiny,
    durability: CardDurability.Persistent,
    rarity: Rarity.Common,
    dropOnly: true,
    lore: "A crude blade looted from a fallen goblin. Small, but it bites.",
    tiers: [
      {
        name: "Wooden Sword",
        maxHealth: 18,
        cooldownMultiplier: 1.0,
        sellValue: 1,
        buyCost: 0,
        art: "sword_wood",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 3,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 1,
            description: "Jabs the nearest foe for a little damage.",
          },
        ],
      },
      {
        name: "Iron Sword",
        maxHealth: 36,
        cooldownMultiplier: 0.95,
        sellValue: 4,
        buyCost: 0,
        art: "sword_iron",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 7,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 1,
            description: "A sharper blade that cuts deeper.",
          },
        ],
      },
      {
        name: "Knight's Blade",
        maxHealth: 64,
        cooldownMultiplier: 0.9,
        sellValue: 10,
        buyCost: 0,
        art: "sword_knight",
        abilities: [
          {
            kind: AbilityKind.Attack,
            power: 13,
            target: TargetTeam.Enemies,
            shape: TargetShape.Nearest,
            range: 1,
            description: "A keen blade that strikes hard and fast.",
          },
        ],
      },
    ],
    synergies: [],
  },
};

/** All catalog ids, convenient for shop rolls / iteration. */
export const ALL_CARD_IDS: string[] = Object.keys(CARD_CATALOG);

/**
 * Card ids that can appear in shops or chests: everything except summoned
 * tokens (e.g. bees), which are only ever created by Spawn abilities.
 */
export const SHOP_CARD_IDS: string[] = ALL_CARD_IDS.filter(
  (id) => !CARD_CATALOG[id].token && !CARD_CATALOG[id].dropOnly,
);

/** Helper to fetch a tier's stats (0-indexed by CardTier value - 1). */
export function getTierStats(def: CardDef, tier: CardTier) {
  return def.tiers[tier - 1];
}
