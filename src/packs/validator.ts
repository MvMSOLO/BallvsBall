import { CONFIG, type Rarity } from "../config";
import type { Ability, Action, AimHint, BallDef, Condition, RoleHint, VisualSpec } from "../sim/types";

export interface Issue {
  level: "error" | "warning";
  path: string;
  message: string;
  snippet?: string;
}

export interface ValidateResult {
  ok: boolean;
  ball: BallDef | null;
  issues: Issue[];
  power: number;
}

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
const FACES = ["grin", "angry", "sleepy", "cool", "cute", "robot", "ghost", "wink", "focus"];
const PATTERNS = ["none", "stripes", "dots", "checker", "spiral", "hex", "stars"];
const PARTICLES = ["sparks", "smoke", "bubbles", "stars", "leaves", "embers", "snow", "none"];
const SHAPES = ["sphere", "spiky", "faceted", "ringed", "horned"];
const AIMS: AimHint[] = ["wall", "enemy", "corner", "center", "any"];
const ROLES: RoleHint[] = ["trap", "burst", "sustain", "control", "scaling", "ranged"];
const TRIGGERS = ["onSpawn", "onTick", "onWallHit", "onBallHit", "onDamaged", "onDealDamage", "onHpBelow", "onTimer", "onKill", "onRoundStart"];
const STATUSES = ["poison", "burn", "freeze", "stun", "root", "slow", "haste", "shield", "regen", "weaken"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampNum(n: number, min: number, max: number, path: string, label: string, issues: Issue[]): number {
  if (n < min || n > max) {
    const c = Math.min(max, Math.max(min, n));
    issues.push({ level: "warning", path, message: `${label} ${n} clamped to ${c}` });
    return c;
  }
  return n;
}

export function powerScore(ball: BallDef): number {
  let s = ball.stats.hp / 8 + ball.stats.speed * 0.7 + ball.stats.contactDamage * 1.4;
  s += (1.6 - ball.stats.radius) * 2;
  for (const ab of ball.abilities) {
    s += 3 + ab.actions.length * 2.2;
    const cd = ab.cooldown ?? ab.interval ?? 2;
    s += Math.max(0, 4 - cd);
  }
  return Math.round(s * 10) / 10;
}

export function validateBall(raw: unknown, file = "ball.json"): ValidateResult {
  const issues: Issue[] = [];
  if (!isObj(raw)) {
    return { ok: false, ball: null, issues: [{ level: "error", path: file, message: "ball must be a JSON object" }], power: 0 };
  }
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(id)) {
    issues.push({ level: "error", path: "id", message: "id must match /^[a-z][a-z0-9_]{1,40}$/" });
  }
  const name = readLang(raw.name, "name", issues, true);
  const description = readLang(raw.description, "description", issues, false);
  const rarity = raw.rarity;
  if (typeof rarity !== "string" || !RARITIES.includes(rarity as Rarity)) {
    issues.push({ level: "error", path: "rarity", message: "rarity must be common|rare|epic|legendary|mythic" });
  }
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : [];
  if (!isObj(raw.stats)) {
    issues.push({ level: "error", path: "stats", message: "stats object is required" });
  }
  const statsRaw = isObj(raw.stats) ? raw.stats : {};
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const stats = {
    hp: clampNum(num(statsRaw.hp, NaN), 60, 220, "stats.hp", "hp", issues),
    radius: clampNum(num(statsRaw.radius, NaN), 0.55, 1.8, "stats.radius", "radius", issues),
    mass: clampNum(num(statsRaw.mass, NaN), 0.4, 3.5, "stats.mass", "mass", issues),
    speed: clampNum(num(statsRaw.speed, NaN), 8, 22, "stats.speed", "speed", issues),
    contactDamage: clampNum(num(statsRaw.contactDamage, NaN), 2, 16, "stats.contactDamage", "contactDamage", issues),
  };
  if (!Number.isFinite(num(statsRaw.hp, NaN))) issues.push({ level: "error", path: "stats.hp", message: "hp is required" });
  if (!Number.isFinite(num(statsRaw.speed, NaN))) issues.push({ level: "error", path: "stats.speed", message: "speed is required" });
  if (!Number.isFinite(num(statsRaw.contactDamage, NaN))) issues.push({ level: "error", path: "stats.contactDamage", message: "contactDamage is required" });

  const visual = normalizeVisual(raw.visual, issues);
  const abilities: Ability[] = [];
  if (!Array.isArray(raw.abilities)) {
    issues.push({ level: "error", path: "abilities", message: "abilities must be an array" });
  } else {
    if (raw.abilities.length > MAX_AB_FILE) {
      issues.push({ level: "warning", path: "abilities", message: `ability count ${raw.abilities.length} clamped to ${MAX_AB_FILE}` });
    }
    const list = raw.abilities.slice(0, MAX_AB_FILE);
    for (let i = 0; i < list.length; i++) {
      const ab = normalizeAbility(list[i], `abilities[${i}]`, issues);
      if (ab) abilities.push(ab);
    }
  }
  let bestAim: AimHint = "any";
  let role: RoleHint = "burst";
  if (!isObj(raw.ai_hints)) {
    issues.push({ level: "warning", path: "ai_hints", message: "ai_hints missing; defaulted to any/burst" });
  } else {
    if (typeof raw.ai_hints.bestAim === "string" && AIMS.includes(raw.ai_hints.bestAim as AimHint)) bestAim = raw.ai_hints.bestAim as AimHint;
    else issues.push({ level: "warning", path: "ai_hints.bestAim", message: "bestAim invalid; defaulted to any" });
    if (typeof raw.ai_hints.role === "string" && ROLES.includes(raw.ai_hints.role as RoleHint)) role = raw.ai_hints.role as RoleHint;
    else issues.push({ level: "warning", path: "ai_hints.role", message: "role invalid; defaulted to burst" });
  }
  const script = typeof raw.script === "string" ? raw.script : undefined;
  if (script && /while\s*\(|for\s*\(/.test(script)) {
    issues.push({ level: "warning", path: "script", message: "script contains a loop; keep it tiny or it will be time-budget killed" });
  }
  const hasError = issues.some((i) => i.level === "error");
  if (hasError || !id || typeof rarity !== "string") {
    return { ok: false, ball: null, issues, power: 0 };
  }
  const ball: BallDef = {
    id,
    name,
    description,
    rarity: rarity as Rarity,
    tags,
    stats,
    visual,
    abilities,
    ai_hints: { bestAim, role },
    script,
  };
  const power = powerScore(ball);
  const budget = CONFIG.powerBudget[ball.rarity];
  if (power < budget[0] || power > budget[1]) {
    issues.push({
      level: "warning",
      path: "power",
      message: `power ${power} outside ${ball.rarity} budget ${budget[0]}-${budget[1]}`,
    });
  }
  return { ok: true, ball, issues, power };
}

const MAX_AB_FILE = 6;

function readLang(v: unknown, path: string, issues: Issue[], required: boolean): Record<string, string> {
  const out: Record<string, string> = { en: "Ball" };
  if (!isObj(v) || typeof v.en !== "string" || !v.en.trim()) {
    if (required) issues.push({ level: "error", path: path + ".en", message: "English string is required" });
    else issues.push({ level: "warning", path: path + ".en", message: "missing English text; fallback used" });
    return out;
  }
  out.en = v.en.slice(0, 180);
  if (typeof v.uz === "string") out.uz = v.uz.slice(0, 180);
  if (typeof v.ru === "string") out.ru = v.ru.slice(0, 180);
  return out;
}

function normalizeVisual(v: unknown, issues: Issue[]): VisualSpec {
  const o = isObj(v) ? v : {};
  if (!isObj(v)) issues.push({ level: "warning", path: "visual", message: "visual missing; auto look applied" });
  const face = typeof o.face === "string" && FACES.includes(o.face) ? o.face : "grin";
  if (typeof o.face === "string" && !FACES.includes(o.face)) issues.push({ level: "warning", path: "visual.face", message: `face ${o.face} fallback grin` });
  const pattern = typeof o.pattern === "string" && PATTERNS.includes(o.pattern) ? o.pattern : "none";
  const particles = typeof o.particles === "string" && PARTICLES.includes(o.particles) ? o.particles : "none";
  const shape = typeof o.shape === "string" && SHAPES.includes(o.shape) ? o.shape : "sphere";
  const trail = isObj(o.trail) ? o.trail : {};
  return {
    baseColor: colorOf(o.baseColor, "#d7dde6"),
    accentColor: colorOf(o.accentColor, "#1c2430"),
    face,
    pattern,
    emissive: clampNum(typeof o.emissive === "number" ? o.emissive : 0.15, 0, 1, "visual.emissive", "emissive", issues),
    trail: {
      color: colorOf(trail.color, "#ffffff"),
      length: clampNum(typeof trail.length === "number" ? trail.length : 0.5, 0, 1.5, "visual.trail.length", "trail", issues),
    },
    particles,
    shape,
  };
}

function colorOf(v: unknown, fb: string): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb;
}

function normalizeAbility(v: unknown, path: string, issues: Issue[]): Ability | null {
  if (!isObj(v)) {
    issues.push({ level: "error", path, message: "ability must be an object" });
    return null;
  }
  const trigger = typeof v.trigger === "string" ? v.trigger : "";
  if (!TRIGGERS.includes(trigger)) {
    issues.push({ level: "error", path: path + ".trigger", message: `unknown trigger ${trigger || "(missing)"}` });
    return null;
  }
  if (!Array.isArray(v.actions) || v.actions.length === 0) {
    issues.push({ level: "error", path: path + ".actions", message: "actions must be a non-empty array" });
    return null;
  }
  const actions: Action[] = [];
  for (let i = 0; i < Math.min(8, v.actions.length); i++) {
    const a = normalizeAction(v.actions[i], `${path}.actions[${i}]`, issues, 0);
    if (a) actions.push(a);
  }
  if (!actions.length) {
    issues.push({ level: "error", path: path + ".actions", message: "no valid actions" });
    return null;
  }
  const conditions: Condition[] = [];
  if (Array.isArray(v.conditions)) {
    for (const c of v.conditions) {
      if (!isObj(c) || typeof c.type !== "string" || typeof c.value !== "number") continue;
      conditions.push({ type: c.type as Condition["type"], value: c.value });
    }
  }
  const ab: Ability = { trigger, actions };
  if (typeof v.cooldown === "number") ab.cooldown = clampNum(v.cooldown, 0.05, 40, path + ".cooldown", "cooldown", issues);
  if (typeof v.interval === "number") ab.interval = clampNum(v.interval, 0.15, 30, path + ".interval", "interval", issues);
  if (typeof v.seconds === "number") ab.seconds = clampNum(v.seconds, 0.1, 80, path + ".seconds", "seconds", issues);
  if (typeof v.percent === "number") ab.percent = clampNum(v.percent, 1, 99, path + ".percent", "percent", issues);
  if (conditions.length) ab.conditions = conditions;
  return ab;
}

function visualOf(o: Record<string, unknown>): Action["visual"] {
  if (!isObj(o.visual)) return undefined;
  const vis = o.visual;
  return {
    color: typeof vis.color === "string" ? vis.color : undefined,
    particle: typeof vis.particle === "string" ? vis.particle : undefined,
    sound: typeof vis.sound === "string" ? vis.sound : undefined,
  };
}

function normalizeAction(v: unknown, path: string, issues: Issue[], depth: number): Action | null {
  if (!isObj(v) || typeof v.type !== "string") {
    issues.push({ level: "error", path, message: "action needs a type" });
    return null;
  }
  if (depth > 2) {
    issues.push({ level: "error", path, message: "action nesting too deep" });
    return null;
  }
  const num = (k: string, fb: number) => (typeof v[k] === "number" && Number.isFinite(v[k] as number) ? (v[k] as number) : fb);
  const vis = visualOf(v);
  const withVis = <T extends Action>(a: T): T => {
    if (vis) a.visual = vis;
    return a;
  };
  switch (v.type) {
    case "damage":
      return withVis({ type: "damage", amount: clampNum(num("amount", 0), 0, CONFIG.maxHitDamage, path + ".amount", "damage", issues), radius: v.radius ? clampNum(num("radius", 0), 0, 8, path + ".radius", "radius", issues) : undefined });
    case "heal":
      return withVis({ type: "heal", amount: clampNum(num("amount", 0), 0, CONFIG.maxHeal, path + ".amount", "heal", issues) });
    case "applyStatus": {
      const status = typeof v.status === "string" ? v.status : "";
      if (!STATUSES.includes(status)) {
        issues.push({ level: "error", path: path + ".status", message: `unknown status ${status}` });
        return null;
      }
      return withVis({
        type: "applyStatus",
        status,
        duration: clampNum(num("duration", 1), 0.05, 10, path + ".duration", "duration", issues),
        magnitude: clampNum(num("magnitude", 1), 0, status === "shield" ? 60 : CONFIG.maxDps, path + ".magnitude", "magnitude", issues),
      });
    }
    case "modifyStat": {
      const stat = v.stat;
      const mode = v.mode;
      if (stat !== "speed" && stat !== "mass" && stat !== "radius" && stat !== "contactDamage") {
        issues.push({ level: "error", path: path + ".stat", message: "bad stat" });
        return null;
      }
      if (mode !== "add" && mode !== "mul") {
        issues.push({ level: "error", path: path + ".mode", message: "mode must be add or mul" });
        return null;
      }
      return withVis({
        type: "modifyStat",
        stat,
        mode,
        amount: clampNum(num("amount", 1), mode === "mul" ? 0.4 : -8, mode === "mul" ? 2.2 : 12, path + ".amount", "amount", issues),
        duration: clampNum(num("duration", 2), 0.1, 20, path + ".duration", "duration", issues),
      });
    }
    case "knockback":
      return withVis({ type: "knockback", force: clampNum(num("force", 8), 0, 28, path + ".force", "force", issues) });
    case "pull":
      return withVis({ type: "pull", force: clampNum(num("force", 8), 0, 28, path + ".force", "force", issues) });
    case "dash":
      return withVis({ type: "dash", distance: clampNum(num("distance", 4), 0.4, 10, path + ".distance", "distance", issues) });
    case "teleport": {
      const mode = v.mode;
      if (mode !== "center" && mode !== "behindEnemy" && mode !== "random" && mode !== "away") {
        issues.push({ level: "error", path: path + ".mode", message: "bad teleport mode" });
        return null;
      }
      return withVis({ type: "teleport", mode });
    }
    case "grow":
      return withVis({ type: "grow", amount: clampNum(num("amount", 0.3), 0.05, 0.8, path + ".amount", "grow", issues), duration: clampNum(num("duration", 3), 0.2, 12, path + ".duration", "duration", issues) });
    case "shrink":
      return withVis({ type: "shrink", amount: clampNum(num("amount", 0.3), 0.05, 0.6, path + ".amount", "shrink", issues), duration: clampNum(num("duration", 3), 0.2, 12, path + ".duration", "duration", issues) });
    case "split":
      return withVis({
        type: "split",
        count: Math.round(clampNum(num("count", 2), 2, CONFIG.maxSummonCount, path + ".count", "split", issues)),
        hpFraction: clampNum(num("hpFraction", 0.8), 0.3, 1, path + ".hpFraction", "hpFraction", issues),
      });
    case "spawnZone": {
      const shape = v.shape;
      if (shape !== "line" && shape !== "circle" && shape !== "ring" && shape !== "web" && shape !== "field") {
        issues.push({ level: "error", path: path + ".shape", message: `unknown zone shape ${String(shape)}` });
        return null;
      }
      return withVis({
        type: "spawnZone",
        shape,
        duration: clampNum(num("duration", 4), 0.3, CONFIG.maxZoneDuration, path + ".duration", "zone duration", issues),
        damagePerSecond: clampNum(num("damagePerSecond", 4), 0, CONFIG.maxDps, path + ".damagePerSecond", "dps", issues),
        slow: clampNum(num("slow", 0), 0, 0.7, path + ".slow", "slow", issues),
        radius: clampNum(num("radius", 1.7), 0.4, 4.5, path + ".radius", "radius", issues),
        length: clampNum(num("length", 4), 0.5, 10, path + ".length", "length", issues),
        follow: Boolean(v.follow),
      });
    }
    case "spawnProjectile": {
      const pattern = v.pattern;
      if (pattern !== "straight" && pattern !== "homing" && pattern !== "bouncing" && pattern !== "piercing" && pattern !== "explosive") {
        issues.push({ level: "error", path: path + ".pattern", message: "unknown projectile pattern" });
        return null;
      }
      return withVis({
        type: "spawnProjectile",
        pattern,
        damage: clampNum(num("damage", 6), 0, 25, path + ".damage", "projectile damage", issues),
        speed: clampNum(num("speed", 16), 6, 32, path + ".speed", "projectile speed", issues),
        radius: clampNum(num("radius", 0.28), 0.12, 0.7, path + ".radius", "radius", issues),
        count: Math.round(clampNum(num("count", 1), 1, 5, path + ".count", "count", issues)),
        ttl: clampNum(num("ttl", 2.2), 0.3, 5, path + ".ttl", "ttl", issues),
      });
    }
    case "spawnTurret":
      return withVis({
        type: "spawnTurret",
        hp: clampNum(num("hp", 30), 8, 80, path + ".hp", "turret hp", issues),
        duration: clampNum(num("duration", 8), 1, 14, path + ".duration", "duration", issues),
        projectileDamage: clampNum(num("projectileDamage", 6), 1, 18, path + ".projectileDamage", "projectile damage", issues),
        interval: clampNum(num("interval", 1), 0.35, 3, path + ".interval", "interval", issues),
      });
    case "spawnSummon":
      return withVis({
        type: "spawnSummon",
        hp: clampNum(num("hp", 28), 8, 80, path + ".hp", "summon hp", issues),
        speed: clampNum(num("speed", 12), 6, 20, path + ".speed", "speed", issues),
        contactDamage: clampNum(num("contactDamage", 5), 1, 14, path + ".contactDamage", "contact", issues),
        radius: clampNum(num("radius", 0.55), 0.35, 1.1, path + ".radius", "radius", issues),
        duration: clampNum(num("duration", 8), 1, 14, path + ".duration", "duration", issues),
        count: Math.round(clampNum(num("count", 1), 1, CONFIG.maxSummonCount, path + ".count", "count", issues)),
      });
    case "spawnOrbiter":
      return withVis({
        type: "spawnOrbiter",
        count: Math.round(clampNum(num("count", 2), 1, 4, path + ".count", "orbiters", issues)),
        radius: clampNum(num("radius", 1.8), 0.8, 3.2, path + ".radius", "orbit", issues),
        damage: clampNum(num("damage", 5), 1, 16, path + ".damage", "damage", issues),
        orbit: clampNum(num("orbit", 2.2), 0.6, 5, path + ".orbit", "spin", issues),
        duration: clampNum(num("duration", 10), 0.4, 30, path + ".duration", "duration", issues),
      });
    case "createBeam":
      return withVis({ type: "createBeam", damage: clampNum(num("damage", 10), 0, CONFIG.maxHitDamage, path + ".damage", "beam", issues), width: clampNum(num("width", 0.4), 0.1, 2, path + ".width", "width", issues) });
    case "chainLightning":
      return withVis({
        type: "chainLightning",
        damage: clampNum(num("damage", 8), 0, CONFIG.maxHitDamage, path + ".damage", "chain", issues),
        jumps: Math.round(clampNum(num("jumps", 2), 1, 4, path + ".jumps", "jumps", issues)),
        range: clampNum(num("range", 6), 1, 14, path + ".range", "range", issues),
      });
    case "explode":
      return withVis({
        type: "explode",
        radius: clampNum(num("radius", 2), 0.5, 8, path + ".radius", "radius", issues),
        damage: clampNum(num("damage", 8), 0, 35, path + ".damage", "explode damage", issues),
        knockback: clampNum(num("knockback", 8), 0, 28, path + ".knockback", "knockback", issues),
      });
    case "lifesteal":
      return withVis({ type: "lifesteal", fraction: clampNum(num("fraction", 0.3), 0, 0.6, path + ".fraction", "lifesteal", issues) });
    case "thorns":
      return withVis({ type: "thorns", fraction: clampNum(num("fraction", 0.25), 0, 0.6, path + ".fraction", "thorns", issues), duration: clampNum(num("duration", 8), 0.2, 20, path + ".duration", "duration", issues) });
    case "reviveOnce":
      return withVis({ type: "reviveOnce", hpFraction: clampNum(num("hpFraction", 0.35), 0.15, 0.6, path + ".hpFraction", "revive", issues) });
    case "randomChoice":
    case "repeat":
    case "scaleWith": {
      if (!Array.isArray(v.actions)) {
        issues.push({ level: "error", path: path + ".actions", message: "nested actions required" });
        return null;
      }
      const nested: Action[] = [];
      for (let i = 0; i < Math.min(6, v.actions.length); i++) {
        const child = normalizeAction(v.actions[i], `${path}.actions[${i}]`, issues, depth + 1);
        if (child) nested.push(child);
      }
      if (!nested.length) return null;
      if (v.type === "randomChoice") return withVis({ type: "randomChoice", actions: nested });
      if (v.type === "repeat") {
        return withVis({
          type: "repeat",
          count: Math.round(clampNum(num("count", 2), 1, 6, path + ".count", "repeat", issues)),
          interval: clampNum(num("interval", 0.4), 0.15, 5, path + ".interval", "interval", issues),
          actions: nested,
        });
      }
      const counter = v.counter === "walls" || v.counter === "time" || v.counter === "hpLost" || v.counter === "hits" ? v.counter : "hits";
      return withVis({
        type: "scaleWith",
        counter,
        per: clampNum(num("per", 2), 0.2, 30, path + ".per", "per", issues),
        bonus: clampNum(num("bonus", 0.1), 0, 0.5, path + ".bonus", "bonus", issues),
        actions: nested,
      });
    }
    default:
      issues.push({ level: "error", path: path + ".type", message: `unknown action ${v.type}` });
      return null;
  }
}

export interface PackFile {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  enabled: boolean;
  balls: string[];
}

export function validatePackMeta(raw: unknown): { ok: boolean; pack: PackFile | null; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isObj(raw)) return { ok: false, pack: null, issues: [{ level: "error", path: "pack.json", message: "pack.json must be an object" }] };
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) issues.push({ level: "error", path: "id", message: "bad pack id" });
  const balls = Array.isArray(raw.balls) ? raw.balls.filter((b): b is string => typeof b === "string") : [];
  if (!balls.length) issues.push({ level: "error", path: "balls", message: "pack lists no balls" });
  const authors = ["claude", "chatgpt", "grok", "human", "template"];
  const author = typeof raw.author === "string" ? raw.author : "human";
  if (!authors.includes(author)) issues.push({ level: "warning", path: "author", message: `author ${author} is not claude|chatgpt|grok|human` });
  if (issues.some((i) => i.level === "error")) return { ok: false, pack: null, issues };
  return {
    ok: true,
    pack: {
      id,
      name: typeof raw.name === "string" ? raw.name : id,
      author,
      version: typeof raw.version === "string" ? raw.version : "0.0.0",
      description: typeof raw.description === "string" ? raw.description : "",
      enabled: raw.enabled !== false,
      balls,
    },
    issues,
  };
}
