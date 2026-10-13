import type { Rarity } from "../config";

export type AimHint = "wall" | "enemy" | "corner" | "center" | "any";
export type RoleHint = "trap" | "burst" | "sustain" | "control" | "scaling" | "ranged";

export interface TrailSpec {
  color: string;
  length: number;
}

export interface VisualSpec {
  baseColor: string;
  accentColor: string;
  face: string;
  pattern: string;
  emissive: number;
  trail: TrailSpec;
  particles: string;
  shape: string;
}

export interface ActionVisual {
  color?: string;
  particle?: string;
  sound?: string;
}

interface ABase {
  visual?: ActionVisual;
}

export type Action =
  | (ABase & { type: "damage"; amount: number; radius?: number })
  | (ABase & { type: "heal"; amount: number })
  | (ABase & { type: "applyStatus"; status: string; duration: number; magnitude: number })
  | (ABase & {
      type: "modifyStat";
      stat: "speed" | "mass" | "radius" | "contactDamage";
      mode: "add" | "mul";
      amount: number;
      duration: number;
    })
  | (ABase & { type: "knockback"; force: number })
  | (ABase & { type: "pull"; force: number })
  | (ABase & { type: "dash"; distance: number })
  | (ABase & { type: "teleport"; mode: "center" | "behindEnemy" | "random" | "away" })
  | (ABase & { type: "grow"; amount: number; duration: number })
  | (ABase & { type: "shrink"; amount: number; duration: number })
  | (ABase & { type: "split"; count: number; hpFraction: number })
  | (ABase & {
      type: "spawnZone";
      shape: "line" | "circle" | "ring" | "web" | "field";
      duration: number;
      damagePerSecond: number;
      slow?: number;
      radius?: number;
      length?: number;
      follow?: boolean;
    })
  | (ABase & {
      type: "spawnProjectile";
      pattern: "straight" | "homing" | "bouncing" | "piercing" | "explosive";
      damage: number;
      speed: number;
      radius?: number;
      count?: number;
      ttl?: number;
    })
  | (ABase & {
      type: "spawnTurret";
      hp: number;
      duration: number;
      projectileDamage: number;
      interval: number;
    })
  | (ABase & {
      type: "spawnSummon";
      hp: number;
      speed: number;
      contactDamage: number;
      radius: number;
      duration: number;
      count?: number;
    })
  | (ABase & {
      type: "spawnOrbiter";
      count: number;
      radius: number;
      damage: number;
      orbit: number;
      duration: number;
    })
  | (ABase & { type: "createBeam"; damage: number; width?: number })
  | (ABase & { type: "chainLightning"; damage: number; jumps: number; range: number })
  | (ABase & { type: "explode"; radius: number; damage: number; knockback: number })
  | (ABase & { type: "lifesteal"; fraction: number })
  | (ABase & { type: "thorns"; fraction: number; duration: number })
  | (ABase & { type: "reviveOnce"; hpFraction: number })
  | (ABase & { type: "randomChoice"; actions: Action[] })
  | (ABase & { type: "repeat"; count: number; interval: number; actions: Action[] })
  | (ABase & {
      type: "scaleWith";
      counter: "hits" | "walls" | "time" | "hpLost";
      per: number;
      bonus: number;
      actions: Action[];
    });

export interface Condition {
  type:
    | "hpBelow"
    | "hpAbove"
    | "enemyDistanceBelow"
    | "enemyDistanceAbove"
    | "hitCountAtLeast"
    | "chance"
    | "cooldownReady";
  value: number;
}

export interface Ability {
  trigger: string;
  cooldown?: number;
  interval?: number;
  seconds?: number;
  percent?: number;
  conditions?: Condition[];
  actions: Action[];
}

export interface BallDef {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  rarity: Rarity;
  tags: string[];
  stats: { hp: number; radius: number; mass: number; speed: number; contactDamage: number };
  visual: VisualSpec;
  abilities: Ability[];
  ai_hints: { bestAim: AimHint; role: RoleHint };
  /** Optional sandboxed script source (zip imports). Built-in packs may omit this. */
  script?: string;
}

export interface ScriptCtx {
  rng: () => number;
  time: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  enemyX: number;
  enemyY: number;
  enemyHp: number;
  damage: (amount: number) => void;
  heal: (amount: number) => void;
  knockback: (force: number) => void;
  pull: (force: number) => void;
  status: (name: string, duration: number, magnitude: number) => void;
  explode: (radius: number, damage: number, knockback: number) => void;
}

export interface ScriptHooks {
  onSpawn?: (ctx: ScriptCtx) => void;
  onTick?: (ctx: ScriptCtx) => void;
  onWallHit?: (ctx: ScriptCtx) => void;
  onBallHit?: (ctx: ScriptCtx) => void;
  onDamaged?: (ctx: ScriptCtx) => void;
  onDeath?: (ctx: ScriptCtx) => void;
}
