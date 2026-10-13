/** All tunables for BALL ARENA. Gameplay code reads this object — do not scatter magic numbers. */

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type Lang = "en" | "uz" | "ru";
export type QualityName = "auto" | "low" | "medium" | "high";
export type Difficulty = "easy" | "normal" | "hard";

export interface GameConfig {
  arenaSize: number;
  arenaHalf: number;
  wallHeight: number;
  simHz: number;
  maxCatchup: number;
  maxSpeed: number;
  restitution: number;
  speedNormalize: number;
  hitCooldown: number;
  minHitSpeed: number;
  contactScale: number;
  maxHitDamage: number;
  maxDps: number;
  maxHeal: number;
  maxEntitiesPerBall: number;
  maxZoneDuration: number;
  maxSummonCount: number;
  hearts: number;
  pickSeconds: number;
  aimSeconds: number;
  countdown: number;
  roundEndPause: number;
  introSeconds: number;
  suddenDeathAt: number;
  roundHardCap: number;
  suddenDps: number;
  suddenRamp: number;
  borderWidth: number;
  borderGrow: number;
  rerollCosts: number[];
  firstRerollFree: boolean;
  freePickAny: boolean;
  starterCoins: number;
  starterDiamonds: number;
  gachaCost: number;
  crateCost: number;
  duplicateCoins: number;
  duplicateFragments: number;
  craftFragments: number;
  winCoinsBase: number;
  loseCoins: number;
  xpWin: number;
  xpLose: number;
  spawnY: number;
  botThink: Record<Difficulty, [number, number]>;
  smartCandidates: number;
  smartHorizon: number;
  matchmakeMin: number;
  matchmakeMax: number;
  adminPin: string;
  saveVersion: number;
  starterBalls: string[];
  gachaWeights: Record<Rarity, number>;
  powerBudget: Record<Rarity, [number, number]>;
  dailyRewards: { coins: number; diamonds: number }[];
  diamondPacks: { id: string; amount: number; label: string }[];
}

export const CONFIG: GameConfig = {
  arenaSize: 24,
  arenaHalf: 12,
  wallHeight: 2,
  simHz: 120,
  maxCatchup: 5,
  maxSpeed: 34,
  restitution: 1,
  speedNormalize: 3.4,
  hitCooldown: 0.25,
  minHitSpeed: 1.25,
  contactScale: 0.085,
  maxHitDamage: 40,
  maxDps: 22,
  maxHeal: 28,
  maxEntitiesPerBall: 56,
  maxZoneDuration: 12,
  maxSummonCount: 4,
  hearts: 3,
  pickSeconds: 30,
  aimSeconds: 15,
  countdown: 3,
  roundEndPause: 2.4,
  introSeconds: 2.6,
  suddenDeathAt: 45,
  roundHardCap: 90,
  suddenDps: 6,
  suddenRamp: 1.35,
  borderWidth: 1.15,
  borderGrow: 0.045,
  rerollCosts: [3, 3, 5, 8, 12, 20],
  firstRerollFree: true,
  freePickAny: false,
  starterCoins: 500,
  starterDiamonds: 20,
  gachaCost: 100,
  crateCost: 150,
  duplicateCoins: 40,
  duplicateFragments: 12,
  craftFragments: 80,
  winCoinsBase: 100,
  loseCoins: 25,
  xpWin: 45,
  xpLose: 18,
  spawnY: 8.7,
  botThink: { easy: [8, 22], normal: [5, 15], hard: [4, 11] },
  smartCandidates: 16,
  smartHorizon: 7,
  matchmakeMin: 2,
  matchmakeMax: 5,
  adminPin: "0000",
  saveVersion: 1,
  starterBalls: [
    "web_weaver",
    "crimson_leech",
    "boom_pebble",
    "jolt_mite",
    "aegis_lump",
    "glass_hail",
    "sprout_turret",
    "magma_pocket",
  ],
  gachaWeights: { common: 56, rare: 25, epic: 12, legendary: 6, mythic: 1 },
  powerBudget: {
    common: [18, 62],
    rare: [28, 78],
    epic: [36, 96],
    legendary: [48, 118],
    mythic: [58, 140],
  },
  dailyRewards: [
    { coins: 80, diamonds: 0 },
    { coins: 40, diamonds: 1 },
    { coins: 120, diamonds: 0 },
    { coins: 60, diamonds: 2 },
    { coins: 200, diamonds: 3 },
    { coins: 100, diamonds: 2 },
    { coins: 250, diamonds: 5 },
  ],
  diamondPacks: [
    { id: "handful", amount: 10, label: "10" },
    { id: "pouch", amount: 30, label: "30" },
    { id: "crate", amount: 80, label: "80" },
  ],
};

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1);
}

export function xpForNext(level: number): number {
  const next = level;
  return next * next * 40;
}
