import { CONFIG, type GameConfig } from "../config";
import type { Ability, Action, BallDef, ScriptCtx, ScriptHooks } from "./types";
import { rngNext, seedOf } from "./rng";

/**
 * Deterministic 2D circle arena. SoA slots, no allocations in stepFight.
 * Slot 0 and slot 1 are the heart balls and are never freed.
 * World axes: +X right, +Y up (opponent for side 0). Mapped to three.js X / -Z.
 */

export const MAX_ENT = 128;
export const MAX_AB = 6;
export const ST_N = 10;
export const MAX_DELAY = 40;

export const K_BALL = 1;
export const K_SUMMON = 2;
export const K_PROJ = 3;
export const K_ZONE = 4;
export const K_TURRET = 5;
export const K_ORBIT = 6;

const S_POISON = 0;
const S_BURN = 1;
const S_FREEZE = 2;
const S_STUN = 3;
const S_ROOT = 4;
const S_SLOW = 5;
const S_HASTE = 6;
const S_SHIELD = 7;
const S_REGEN = 8;
const S_WEAKEN = 9;

const SUB_LINE = 1;
const SUB_RING = 2;
const SUB_WEB = 3;
const P_HOMING = 1;
const P_BOUNCE = 2;
const P_PIERCE = 3;
const P_BOOM = 4;

const FX_HIT = 1;
const FX_WALL = 2;
const FX_BOOM = 3;
const FX_HEAL = 4;
const FX_SPAWN = 5;
const FX_DASH = 6;
const FX_BEAM = 7;
const FX_ZONE = 8;
const FX_SHIELD = 9;
const FX_CHAIN = 10;
const FX_PROJECTILE = 11;
const FX_ORBIT = 12;
const FX_THORNS = 13;
const FX_STATUS = 14;
const FX_PULL = 15;

export interface Fight {
  cfg: GameConfig;
  defs: [BallDef, BallDef];
  scripts: [ScriptHooks | null, ScriptHooks | null];
  scriptOff: [number, number];
  rng: { s: number };
  tick: number;
  time: number;
  over: boolean;
  winner: -1 | 0 | 1;
  sudden: boolean;
  oob: number;
  nans: number;
  errors: string[];
  dmg0: number;
  dmg1: number;
  depth: number;
  scriptCalls: number;
  aliveN: number;
  active: Uint8Array;
  kind: Uint8Array;
  owner: Int8Array;
  sub: Uint8Array;
  gen: Uint8Array;
  parent: Int16Array;
  defSlot: Int8Array;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  r: Float64Array;
  mass: Float64Array;
  hp: Float64Array;
  maxHp: Float64Array;
  speed: Float64Array;
  contact: Float64Array;
  ttl: Float64Array;
  age: Float64Array;
  p0: Float64Array;
  p1: Float64Array;
  p2: Float64Array;
  stT: Float64Array;
  stM: Float64Array;
  abCd: Float64Array;
  abOnce: Uint8Array;
  abMask: Uint8Array;
  spMul: Float64Array;
  spAdd: Float64Array;
  spT: Float64Array;
  ctMul: Float64Array;
  ctAdd: Float64Array;
  ctT: Float64Array;
  radAdd: Float64Array;
  radT: Float64Array;
  thorns: Float64Array;
  thornsT: Float64Array;
  lifesteal: Float64Array;
  reviveFrac: Float64Array;
  revived: Uint8Array;
  hits: Float64Array;
  walls: Float64Array;
  hpLost: Float64Array;
  safeX: Float64Array;
  safeY: Float64Array;
  safeHp: Float64Array;
  ownedN: Int16Array;
  free: Int16Array;
  freeN: number;
  cdA: Int16Array;
  cdB: Int16Array;
  cdUntil: Float64Array;
  cdN: number;
  dOn: Uint8Array;
  dTime: Float64Array;
  dEnt: Int16Array;
  dLeft: Uint8Array;
  dInt: Float64Array;
  dScale: Float64Array;
  dRef: (Action[] | null)[];
  fxT: Uint8Array;
  fxX: Float64Array;
  fxY: Float64Array;
  fxX2: Float64Array;
  fxY2: Float64Array;
  fxM: Float64Array;
  fxO: Int8Array;
  fxColor: (string | undefined)[];
  fxSound: (string | undefined)[];
  fxW: number;
  lastDealt: number;
  H: number;
  ctx: ScriptCtx;
  ctxId: number;
}

export interface FightInput {
  seed: number;
  a: BallDef;
  b: BallDef;
  dirAX: number;
  dirAY: number;
  dirBX: number;
  dirBY: number;
  config?: GameConfig;
  scripts?: [ScriptHooks | null, ScriptHooks | null];
  /** Stop early for bot aim search. Winner is whoever is ahead if the cap hits. */
  maxTime?: number;
}

export interface FightResult {
  winner: -1 | 0 | 1;
  time: number;
  hash: string;
  oob: number;
  nans: number;
  errors: string[];
  dmgA: number;
  dmgB: number;
  sudden: boolean;
  ticks: number;
  hpA: number;
  hpB: number;
}

function emptyFight(cfg: GameConfig): Fight {
  const ctx = {} as ScriptCtx;
  const f: Fight = {
    cfg,
    defs: [null as unknown as BallDef, null as unknown as BallDef],
    scripts: [null, null],
    scriptOff: [0, 0],
    rng: { s: 1 },
    tick: 0,
    time: 0,
    over: false,
    winner: -1,
    sudden: false,
    oob: 0,
    nans: 0,
    errors: [],
    dmg0: 0,
    dmg1: 0,
    depth: 0,
    scriptCalls: 0,
    aliveN: 0,
    active: new Uint8Array(MAX_ENT),
    kind: new Uint8Array(MAX_ENT),
    owner: new Int8Array(MAX_ENT),
    sub: new Uint8Array(MAX_ENT),
    gen: new Uint8Array(MAX_ENT),
    parent: new Int16Array(MAX_ENT),
    defSlot: new Int8Array(MAX_ENT),
    x: new Float64Array(MAX_ENT),
    y: new Float64Array(MAX_ENT),
    vx: new Float64Array(MAX_ENT),
    vy: new Float64Array(MAX_ENT),
    r: new Float64Array(MAX_ENT),
    mass: new Float64Array(MAX_ENT),
    hp: new Float64Array(MAX_ENT),
    maxHp: new Float64Array(MAX_ENT),
    speed: new Float64Array(MAX_ENT),
    contact: new Float64Array(MAX_ENT),
    ttl: new Float64Array(MAX_ENT),
    age: new Float64Array(MAX_ENT),
    p0: new Float64Array(MAX_ENT),
    p1: new Float64Array(MAX_ENT),
    p2: new Float64Array(MAX_ENT),
    stT: new Float64Array(MAX_ENT * ST_N),
    stM: new Float64Array(MAX_ENT * ST_N),
    abCd: new Float64Array(MAX_ENT * MAX_AB),
    abOnce: new Uint8Array(MAX_ENT),
    abMask: new Uint8Array(MAX_ENT),
    spMul: new Float64Array(MAX_ENT),
    spAdd: new Float64Array(MAX_ENT),
    spT: new Float64Array(MAX_ENT),
    ctMul: new Float64Array(MAX_ENT),
    ctAdd: new Float64Array(MAX_ENT),
    ctT: new Float64Array(MAX_ENT),
    radAdd: new Float64Array(MAX_ENT),
    radT: new Float64Array(MAX_ENT),
    thorns: new Float64Array(MAX_ENT),
    thornsT: new Float64Array(MAX_ENT),
    lifesteal: new Float64Array(MAX_ENT),
    reviveFrac: new Float64Array(MAX_ENT),
    revived: new Uint8Array(MAX_ENT),
    hits: new Float64Array(MAX_ENT),
    walls: new Float64Array(MAX_ENT),
    hpLost: new Float64Array(MAX_ENT),
    safeX: new Float64Array(MAX_ENT),
    safeY: new Float64Array(MAX_ENT),
    safeHp: new Float64Array(MAX_ENT),
    ownedN: new Int16Array(2),
    free: new Int16Array(MAX_ENT),
    freeN: 0,
    cdA: new Int16Array(48),
    cdB: new Int16Array(48),
    cdUntil: new Float64Array(48),
    cdN: 0,
    dOn: new Uint8Array(MAX_DELAY),
    dTime: new Float64Array(MAX_DELAY),
    dEnt: new Int16Array(MAX_DELAY),
    dLeft: new Uint8Array(MAX_DELAY),
    dInt: new Float64Array(MAX_DELAY),
    dScale: new Float64Array(MAX_DELAY),
    dRef: new Array<Action[] | null>(MAX_DELAY).fill(null),
    fxT: new Uint8Array(48),
    fxX: new Float64Array(48),
    fxY: new Float64Array(48),
    fxX2: new Float64Array(48),
    fxY2: new Float64Array(48),
    fxM: new Float64Array(48),
    fxO: new Int8Array(48),
    fxColor: new Array<string | undefined>(48).fill(undefined),
    fxSound: new Array<string | undefined>(48).fill(undefined),
    fxW: 0,
    lastDealt: 0,
    H: cfg.arenaHalf,
    ctx,
    ctxId: 0,
  };
  bindCtx(f);
  return f;
}

function bindCtx(f: Fight): void {
  const c = f.ctx;
  c.rng = () => {
    bump(f);
    return rngNext(f.rng);
  };
  c.damage = (n) => {
    bump(f);
    const e = enemyOf(f, f.ctxId);
    if (e >= 0) hurt(f, e, n * 1, f.ctxId, true);
  };
  c.heal = (n) => {
    bump(f);
    heal(f, f.ctxId, n);
  };
  c.knockback = (n) => {
    bump(f);
    knock(f, f.ctxId, n, 1);
  };
  c.pull = (n) => {
    bump(f);
    knock(f, f.ctxId, n, -1);
  };
  c.status = (name, dur, mag) => {
    bump(f);
    const e = enemyOf(f, f.ctxId);
    if (e >= 0) status(f, e, statusIndex(name), dur, mag);
  };
  c.explode = (radius, dmg, kb) => {
    bump(f);
    explode(f, f.ctxId, radius, dmg, kb, 1);
  };
}

function bump(f: Fight): void {
  f.scriptCalls++;
  if (f.scriptCalls > 80) throw new Error("script budget");
}

function statusIndex(name: string): number {
  switch (name) {
    case "poison":
      return S_POISON;
    case "burn":
      return S_BURN;
    case "freeze":
      return S_FREEZE;
    case "stun":
      return S_STUN;
    case "root":
      return S_ROOT;
    case "slow":
      return S_SLOW;
    case "haste":
      return S_HASTE;
    case "shield":
      return S_SHIELD;
    case "regen":
      return S_REGEN;
    case "weaken":
      return S_WEAKEN;
    default:
      return -1;
  }
}

function cl(n: number, a: number, b: number): number {
  return n < a ? a : n > b ? b : n;
}

export function createFight(input: FightInput): Fight {
  const f = emptyFight(input.config ?? CONFIG);
  resetFight(f, input);
  return f;
}

export function resetFight(f: Fight, input: FightInput): void {
  const cfg = input.config ?? CONFIG;
  f.cfg = cfg;
  f.H = cfg.arenaHalf;
  f.defs[0] = input.a;
  f.defs[1] = input.b;
  f.scripts[0] = input.scripts?.[0] ?? null;
  f.scripts[1] = input.scripts?.[1] ?? null;
  f.scriptOff[0] = 0;
  f.scriptOff[1] = 0;
  f.rng.s = seedOf(input.seed);
  f.tick = 0;
  f.time = 0;
  f.over = false;
  f.winner = -1;
  f.sudden = false;
  f.oob = 0;
  f.nans = 0;
  f.errors.length = 0;
  f.dmg0 = 0;
  f.dmg1 = 0;
  f.depth = 0;
  f.aliveN = 0;
  f.cdN = 0;
  f.fxW = 0;
  f.freeN = 0;
  f.active.fill(0);
  for (let i = MAX_ENT - 1; i >= 2; i--) f.free[f.freeN++] = i;
  for (let i = 0; i < MAX_DELAY; i++) {
    f.dOn[i] = 0;
    f.dRef[i] = null;
  }
  initMain(f, 0, input.a, input.dirAX, input.dirAY);
  initMain(f, 1, input.b, input.dirBX, input.dirBY);
  fireTrigger(f, 0, "onSpawn", 1);
  fireTrigger(f, 1, "onSpawn", 0);
  fireTrigger(f, 0, "onRoundStart", 1);
  fireTrigger(f, 1, "onRoundStart", 0);
  callScript(f, 0, "onSpawn", 1);
  callScript(f, 1, "onSpawn", 0);
}

function initMain(f: Fight, i: number, def: BallDef, dx: number, dy: number): void {
  clearSlot(f, i);
  f.active[i] = 1;
  f.aliveN++;
  f.kind[i] = K_BALL;
  f.owner[i] = i;
  f.defSlot[i] = i;
  f.parent[i] = -1;
  const st = def.stats;
  f.r[i] = cl(st.radius, 0.45, 2.2);
  f.mass[i] = Math.max(0.25, st.mass);
  f.hp[i] = st.hp;
  f.maxHp[i] = st.hp;
  f.speed[i] = st.speed;
  f.contact[i] = st.contactDamage;
  f.ttl[i] = -1;
  f.spMul[i] = 1;
  f.ctMul[i] = 1;
  f.x[i] = 0;
  f.y[i] = i === 0 ? -f.cfg.spawnY : f.cfg.spawnY;
  const len = Math.hypot(dx, dy);
  const sp = st.speed;
  if (len < 1e-6) {
    f.vx[i] = 0;
    f.vy[i] = i === 0 ? sp : -sp;
  } else {
    f.vx[i] = (dx / len) * sp;
    f.vy[i] = (dy / len) * sp;
  }
  place(f, i, f.x[i], f.y[i]);
  f.safeX[i] = f.x[i];
  f.safeY[i] = f.y[i];
  f.safeHp[i] = f.hp[i];
  f.ownedN[i] = 1;
  const abs = def.abilities;
  for (let a = 0; a < abs.length && a < MAX_AB; a++) {
    if (abs[a].trigger === "onTick") {
      f.abCd[i * MAX_AB + a] = abs[a].interval ?? abs[a].cooldown ?? 1;
    }
  }
}

function clearSlot(f: Fight, i: number): void {
  f.kind[i] = 0;
  f.owner[i] = -1;
  f.sub[i] = 0;
  f.gen[i] = 0;
  f.parent[i] = -1;
  f.defSlot[i] = -1;
  f.x[i] = 0;
  f.y[i] = 0;
  f.vx[i] = 0;
  f.vy[i] = 0;
  f.r[i] = 0.4;
  f.mass[i] = 1;
  f.hp[i] = 1;
  f.maxHp[i] = 1;
  f.speed[i] = 0;
  f.contact[i] = 0;
  f.ttl[i] = -1;
  f.age[i] = 0;
  f.p0[i] = 0;
  f.p1[i] = 0;
  f.p2[i] = 0;
  f.abOnce[i] = 0;
  f.abMask[i] = 0;
  f.spMul[i] = 1;
  f.spAdd[i] = 0;
  f.spT[i] = 0;
  f.ctMul[i] = 1;
  f.ctAdd[i] = 0;
  f.ctT[i] = 0;
  f.radAdd[i] = 0;
  f.radT[i] = 0;
  f.thorns[i] = 0;
  f.thornsT[i] = 0;
  f.lifesteal[i] = 0;
  f.reviveFrac[i] = 0;
  f.revived[i] = 0;
  f.hits[i] = 0;
  f.walls[i] = 0;
  f.hpLost[i] = 0;
  const base = i * ST_N;
  for (let s = 0; s < ST_N; s++) {
    f.stT[base + s] = 0;
    f.stM[base + s] = 0;
  }
  const ab = i * MAX_AB;
  for (let a = 0; a < MAX_AB; a++) f.abCd[ab + a] = 0;
}

function spawn(f: Fight, owner: number): number {
  if (owner < 0 || owner > 1) return -1;
  if (f.ownedN[owner] >= f.cfg.maxEntitiesPerBall) return -1;
  if (f.freeN <= 0) return -1;
  const i = f.free[--f.freeN];
  clearSlot(f, i);
  f.active[i] = 1;
  f.aliveN++;
  f.owner[i] = owner;
  f.ownedN[owner]++;
  return i;
}

function kill(f: Fight, i: number): void {
  if (i < 2 || !f.active[i]) return;
  const ow = f.owner[i];
  f.active[i] = 0;
  f.aliveN--;
  if (ow === 0 || ow === 1) f.ownedN[ow] = Math.max(0, f.ownedN[ow] - 1);
  f.free[f.freeN++] = i;
}

function place(f: Fight, i: number, x: number, y: number): void {
  let rad = f.r[i];
  if (!(rad > 0.05)) rad = 0.05;
  const cap = f.H * 0.45;
  if (rad > cap) rad = cap;
  f.r[i] = rad;
  const m = f.H - rad;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    f.nans++;
    x = Number.isFinite(f.safeX[i]) ? f.safeX[i] : 0;
    y = Number.isFinite(f.safeY[i]) ? f.safeY[i] : 0;
    f.vx[i] = 0;
    f.vy[i] = 0;
  }
  if (x < -m) x = -m;
  else if (x > m) x = m;
  if (y < -m) y = -m;
  else if (y > m) y = m;
  f.x[i] = x;
  f.y[i] = y;
}

function capSpeed(f: Fight, i: number): void {
  const vx = f.vx[i];
  const vy = f.vy[i];
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
    f.nans++;
    f.vx[i] = 0;
    f.vy[i] = 0;
    return;
  }
  const max = f.cfg.maxSpeed;
  const s2 = vx * vx + vy * vy;
  if (s2 > max * max) {
    const k = max / Math.sqrt(s2);
    f.vx[i] = vx * k;
    f.vy[i] = vy * k;
  }
}

function locked(f: Fight, i: number): boolean {
  const b = i * ST_N;
  return f.stT[b + S_FREEZE] > 0 || f.stT[b + S_STUN] > 0 || f.stT[b + S_ROOT] > 0;
}

function speedMul(f: Fight, i: number): number {
  let m = 1;
  const b = i * ST_N;
  if (f.stT[b + S_SLOW] > 0) m *= 1 - cl(f.stM[b + S_SLOW], 0, 0.8);
  if (f.stT[b + S_HASTE] > 0) m *= 1 + cl(f.stM[b + S_HASTE], 0, 1.2);
  return m;
}

function targetSpeed(f: Fight, i: number): number {
  if (locked(f, i)) return 0;
  let s = f.speed[i] * f.spMul[i] + f.spAdd[i];
  s *= speedMul(f, i);
  if (s < 0) s = 0;
  if (s > f.cfg.maxSpeed) s = f.cfg.maxSpeed;
  return s;
}

function weakenMul(f: Fight, i: number): number {
  const b = i * ST_N;
  if (f.stT[b + S_WEAKEN] > 0) return 1 - cl(f.stM[b + S_WEAKEN], 0, 0.7);
  return 1;
}

function contactNow(f: Fight, i: number): number {
  return Math.max(0, (f.contact[i] * f.ctMul[i] + f.ctAdd[i]) * weakenMul(f, i));
}

function pushFx(f: Fight, t: number, x: number, y: number, m: number, o: number, x2 = x, y2 = y, color?: string, sound?: string): void {
  const w = f.fxW % 48;
  f.fxT[w] = t;
  f.fxX[w] = x;
  f.fxY[w] = y;
  f.fxX2[w] = x2;
  f.fxY2[w] = y2;
  f.fxM[w] = m;
  f.fxO[w] = o;
  f.fxColor[w] = color;
  f.fxSound[w] = sound;
  // Monotonic event counter lets rendering detect each new effect exactly once.
  f.fxW += 1;
}

function enemyOf(f: Fight, i: number): number {
  const ow = f.owner[i];
  if (ow === 0) return f.active[1] ? 1 : -1;
  if (ow === 1) return f.active[0] ? 0 : -1;
  return -1;
}

function hurt(f: Fight, target: number, amount: number, attacker: number, notify: boolean): number {
  if (amount <= 0 || !f.active[target] || !Number.isFinite(amount)) return 0;
  if (f.hp[target] <= 0 && (f.kind[target] === K_BALL || f.kind[target] === K_SUMMON)) return 0;
  const sh = target * ST_N + S_SHIELD;
  if (f.stM[sh] > 0 && f.stT[sh] > 0) {
    const abs = amount < f.stM[sh] ? amount : f.stM[sh];
    f.stM[sh] -= abs;
    amount -= abs;
    if (f.stM[sh] <= 0) f.stT[sh] = 0;
  }
  if (amount <= 0) return 0;
  amount = cl(amount, 0, f.cfg.maxHitDamage);
  const before = f.hp[target];
  const next = before - amount;
  f.hp[target] = next > 0 ? next : 0;
  const dealt = before - f.hp[target];
  if (!(dealt > 0)) return 0;
  f.hpLost[target] += dealt;
  f.lastDealt = dealt;
  if (attacker >= 0) {
    const ow = f.owner[attacker];
    if (ow === 0) f.dmg0 += dealt;
    else if (ow === 1) f.dmg1 += dealt;
    const ls = f.lifesteal[attacker];
    if (ls > 0) heal(f, attacker, dealt * ls);
    if (f.thornsT[target] > 0 && f.thorns[target] > 0 && attacker !== target && f.depth < 5) {
      hurt(f, attacker, dealt * f.thorns[target], -1, false);
    }
  }
  pushFx(f, FX_HIT, f.x[target], f.y[target], dealt, f.owner[target]);
  if (notify && f.depth < 6) {
    fireTrigger(f, target, "onDamaged", attacker);
    callScript(f, target, "onDamaged", attacker);
    if (attacker >= 0 && f.active[attacker]) {
      fireTrigger(f, attacker, "onDealDamage", target);
    }
  }
  return dealt;
}

function heal(f: Fight, i: number, amount: number): void {
  if (!f.active[i] || amount <= 0 || !Number.isFinite(amount)) return;
  amount = cl(amount, 0, f.cfg.maxHeal);
  const hp = f.hp[i] + amount;
  f.hp[i] = hp > f.maxHp[i] ? f.maxHp[i] : hp;
  pushFx(f, FX_HEAL, f.x[i], f.y[i], amount, f.owner[i]);
}

function status(f: Fight, i: number, si: number, duration: number, magnitude: number): void {
  if (!f.active[i] || si < 0) return;
  const dur = cl(duration, 0.05, 10);
  const slot = i * ST_N + si;
  if (si === S_SHIELD) {
    const mag = cl(magnitude, 0, 60);
    const sum = f.stM[slot] + mag;
    f.stM[slot] = sum > 80 ? 80 : sum;
    if (dur > f.stT[slot]) f.stT[slot] = dur;
    return;
  }
  let mag = magnitude;
  if (si === S_SLOW) mag = cl(mag, 0, 0.75);
  else if (si === S_HASTE) mag = cl(mag, 0, 1.2);
  else if (si === S_POISON || si === S_BURN || si === S_REGEN) mag = cl(mag, 0, f.cfg.maxDps);
  else if (si === S_WEAKEN) mag = cl(mag, 0, 0.7);
  else mag = cl(mag, 0, 5);
  if (mag >= f.stM[slot]) f.stM[slot] = mag;
  if (dur > f.stT[slot]) f.stT[slot] = dur;
}

function knock(f: Fight, self: number, force: number, sign: number): void {
  const e = enemyOf(f, self);
  if (e < 0) return;
  const dx = f.x[e] - f.x[self];
  const dy = f.y[e] - f.y[self];
  const d = Math.hypot(dx, dy) || 1;
  const fce = cl(force, 0, 28) * sign;
  f.vx[e] += (dx / d) * fce;
  f.vy[e] += (dy / d) * fce;
  capSpeed(f, e);
}

function explode(f: Fight, self: number, radius: number, damage: number, kb: number, scale: number): void {
  const rad = cl(radius, 0.4, 8);
  const dmg = cl(damage * scale, 0, f.cfg.maxHitDamage);
  const force = cl(kb, 0, 28);
  pushFx(f, FX_BOOM, f.x[self], f.y[self], rad, f.owner[self]);
  const ow = f.owner[self];
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i] || i === self) continue;
    const k = f.kind[i];
    if (k !== K_BALL && k !== K_SUMMON) continue;
    if (f.owner[i] === ow) continue;
    const dx = f.x[i] - f.x[self];
    const dy = f.y[i] - f.y[self];
    const d2 = dx * dx + dy * dy;
    const rr = rad + f.r[i];
    if (d2 > rr * rr) continue;
    hurt(f, i, dmg, self, true);
    const d = Math.sqrt(d2) || 1;
    f.vx[i] += (dx / d) * force;
    f.vy[i] += (dy / d) * force;
    capSpeed(f, i);
  }
}

function dash(f: Fight, i: number, distance: number): void {
  let dx = f.vx[i];
  let dy = f.vy[i];
  let sp = Math.hypot(dx, dy);
  if (sp < 0.2) {
    const e = enemyOf(f, i);
    if (e >= 0) {
      dx = f.x[e] - f.x[i];
      dy = f.y[e] - f.y[i];
      sp = Math.hypot(dx, dy) || 1;
    } else {
      dx = 0;
      dy = f.owner[i] === 0 ? 1 : -1;
      sp = 1;
    }
  }
  dx /= sp;
  dy /= sp;
  const dist = cl(distance, 0.2, 10);
  const steps = Math.ceil(dist / 0.35);
  const step = dist / steps;
  for (let s = 0; s < steps; s++) {
    f.x[i] += dx * step;
    f.y[i] += dy * step;
    if (resolveWall(f, i)) onWall(f, i);
  }
  place(f, i, f.x[i], f.y[i]);
}

function teleport(f: Fight, i: number, mode: string): void {
  const e = enemyOf(f, i);
  let x = 0;
  let y = 0;
  if (mode === "random") {
    const m = f.H - f.r[i] - 0.4;
    x = (rngNext(f.rng) * 2 - 1) * m;
    y = (rngNext(f.rng) * 2 - 1) * m;
  } else if (mode === "away") {
    x = f.x[i] < 0 ? f.H * 0.65 : -f.H * 0.65;
    y = f.y[i] < 0 ? f.H * 0.65 : -f.H * 0.65;
  } else if (mode === "behindEnemy" && e >= 0) {
    const dx = f.x[e] - f.x[i];
    const dy = f.y[e] - f.y[i];
    const d = Math.hypot(dx, dy) || 1;
    x = f.x[e] + (dx / d) * (f.r[i] + f.r[e] + 0.8);
    y = f.y[e] + (dy / d) * (f.r[i] + f.r[e] + 0.8);
  } else {
    x = 0;
    y = 0;
  }
  place(f, i, x, y);
  pushFx(f, FX_SPAWN, f.x[i], f.y[i], 1, f.owner[i]);
}

function countKind(f: Fight, owner: number, kind: number): number {
  let n = 0;
  for (let i = 2; i < MAX_ENT; i++) {
    if (f.active[i] && f.owner[i] === owner && f.kind[i] === kind) n++;
  }
  return n;
}

function schedule(f: Fight, ent: number, actions: Action[], delay: number, times: number, interval: number, scale: number): void {
  let slot = -1;
  for (let i = 0; i < MAX_DELAY; i++) {
    if (!f.dOn[i]) {
      slot = i;
      break;
    }
  }
  if (slot < 0) return;
  f.dOn[slot] = 1;
  f.dTime[slot] = delay;
  f.dEnt[slot] = ent;
  f.dLeft[slot] = times > 8 ? 8 : times;
  f.dInt[slot] = interval < 0.12 ? 0.12 : interval;
  f.dScale[slot] = scale;
  f.dRef[slot] = actions;
}

function runActions(f: Fight, self: number, other: number, actions: Action[], scale: number): void {
  if (!f.active[self] || f.depth > 7) return;
  for (let n = 0; n < actions.length; n++) {
    runOne(f, self, other, actions[n], scale);
  }
}

function runOne(f: Fight, self: number, other: number, a: Action, scale: number): void {
  if (!f.active[self]) return;
  const ow = f.owner[self];
  // Feed the renderer explicit ability activation events instead of inferring FX from animation alone.
  if (a.type === "spawnZone") pushFx(f, FX_ZONE, f.x[self], f.y[self], a.radius ?? 1.8, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "spawnProjectile") pushFx(f, FX_PROJECTILE, f.x[self], f.y[self], a.count ?? 1, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "spawnSummon" || a.type === "split") pushFx(f, FX_SPAWN, f.x[self], f.y[self], 1.25, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "spawnOrbiter") pushFx(f, FX_ORBIT, f.x[self], f.y[self], a.radius, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "chainLightning") pushFx(f, FX_CHAIN, f.x[self], f.y[self], a.range, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "pull") { const e = enemyOf(f, self); pushFx(f, FX_PULL, f.x[self], f.y[self], a.force, ow, e >= 0 ? f.x[e] : f.x[self], e >= 0 ? f.y[e] : f.y[self], a.visual?.color, a.visual?.sound); }
  else if (a.type === "thorns") pushFx(f, FX_THORNS, f.x[self], f.y[self], a.duration, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  else if (a.type === "applyStatus") {
    const supportive = a.status === "shield" || a.status === "regen" || a.status === "haste";
    const enemy = other >= 0 && f.active[other] ? other : enemyOf(f, self);
    const target = supportive ? self : enemy;
    const at = target >= 0 && f.active[target] ? target : self;
    pushFx(f, a.status === "shield" ? FX_SHIELD : FX_STATUS, f.x[at], f.y[at], a.duration, ow, undefined, undefined, a.visual?.color, a.visual?.sound);
  }
  switch (a.type) {
    case "damage": {
      const amt = cl(a.amount * scale, 0, f.cfg.maxHitDamage);
      const rad = a.radius ?? 0;
      if (rad > 0) explode(f, self, rad, a.amount, 0, scale);
      else if (other >= 0 && f.active[other]) hurt(f, other, amt, self, true);
      else {
        const e = enemyOf(f, self);
        if (e >= 0) hurt(f, e, amt, self, true);
      }
      break;
    }
    case "heal":
      heal(f, self, a.amount * scale);
      break;
    case "applyStatus": {
      const e = other >= 0 && f.active[other] ? other : enemyOf(f, self);
      const helpful = a.status === "shield" || a.status === "regen" || a.status === "haste";
      const tgt = helpful ? self : e;
      if (tgt >= 0) status(f, tgt, statusIndex(a.status), a.duration, a.magnitude);
      break;
    }
    case "modifyStat": {
      const dur = cl(a.duration, 0.1, 20);
      if (a.stat === "speed") {
        if (a.mode === "mul") f.spMul[self] = cl(a.amount, 0.4, 2.2);
        else f.spAdd[self] = cl(a.amount, -6, 10);
        f.spT[self] = dur;
      } else if (a.stat === "contactDamage") {
        if (a.mode === "mul") f.ctMul[self] = cl(a.amount, 0.4, 2.4);
        else f.ctAdd[self] = cl(a.amount, -4, 12);
        f.ctT[self] = dur;
      } else if (a.stat === "radius") {
        f.radAdd[self] = cl(a.mode === "mul" ? f.r[self] * (a.amount - 1) : a.amount, -0.6, 0.8);
        f.radT[self] = dur;
      } else if (a.stat === "mass") {
        const m = a.mode === "mul" ? f.mass[self] * a.amount : f.mass[self] + a.amount;
        f.mass[self] = cl(m, 0.25, 4);
      }
      break;
    }
    case "knockback":
      knock(f, self, a.force * scale, 1);
      break;
    case "pull":
      knock(f, self, a.force * scale, -1);
      break;
    case "dash": {
      const fromX = f.x[self];
      const fromY = f.y[self];
      dash(f, self, a.distance);
      pushFx(f, FX_DASH, fromX, fromY, a.distance, ow, f.x[self], f.y[self], a.visual?.color, a.visual?.sound);
      break;
    }
    case "teleport": {
      const fromX = f.x[self];
      const fromY = f.y[self];
      teleport(f, self, a.mode);
      pushFx(f, FX_DASH, fromX, fromY, 1.5, ow, f.x[self], f.y[self], a.visual?.color, a.visual?.sound);
      break;
    }
    case "grow":
      f.radAdd[self] = cl(Math.abs(a.amount), 0, 0.8);
      f.radT[self] = cl(a.duration, 0.2, 12);
      break;
    case "shrink":
      f.radAdd[self] = -cl(Math.abs(a.amount), 0, 0.6);
      f.radT[self] = cl(a.duration, 0.2, 12);
      break;
    case "split":
      doSplit(f, self, a.count, a.hpFraction);
      break;
    case "spawnZone":
      doZone(f, self, a);
      break;
    case "spawnProjectile":
      doProj(f, self, a);
      break;
    case "spawnTurret":
      doTurret(f, self, a);
      break;
    case "spawnSummon":
      doSummon(f, self, a);
      break;
    case "spawnOrbiter":
      doOrbit(f, self, a);
      break;
    case "createBeam": {
      const e = enemyOf(f, self);
      if (e >= 0) hurt(f, e, cl(a.damage * scale, 0, f.cfg.maxHitDamage), self, true);
      pushFx(f, FX_BEAM, f.x[self], f.y[self], 1.2, ow, e >= 0 ? f.x[e] : f.x[self], e >= 0 ? f.y[e] : f.y[self], a.visual?.color, a.visual?.sound);
      break;
    }
    case "chainLightning": {
      const e = enemyOf(f, self);
      if (e >= 0) {
        pushFx(f, FX_CHAIN, f.x[self], f.y[self], a.range, ow, f.x[e], f.y[e], a.visual?.color, a.visual?.sound);
        hurt(f, e, cl(a.damage * scale, 0, f.cfg.maxHitDamage), self, true);
        let jumps = a.jumps | 0;
        if (jumps > 4) jumps = 4;
        const range = cl(a.range, 1, 14);
        for (let i = 2; i < MAX_ENT && jumps > 0; i++) {
          if (!f.active[i] || f.owner[i] === ow) continue;
          if (f.kind[i] !== K_SUMMON && f.kind[i] !== K_BALL) continue;
          const dx = f.x[i] - f.x[e];
          const dy = f.y[i] - f.y[e];
          if (dx * dx + dy * dy > range * range) continue;
          hurt(f, i, cl(a.damage * 0.7 * scale, 0, f.cfg.maxHitDamage), self, true);
          jumps--;
        }
      }
      break;
    }
    case "explode":
      explode(f, self, a.radius, a.damage, a.knockback, scale);
      break;
    case "lifesteal":
      f.lifesteal[self] = cl(a.fraction, 0, 0.6);
      if (f.lastDealt > 0) heal(f, self, f.lastDealt * f.lifesteal[self]);
      break;
    case "thorns":
      f.thorns[self] = cl(a.fraction, 0, 0.6);
      f.thornsT[self] = cl(a.duration, 0.2, 20);
      break;
    case "reviveOnce":
      if (!f.revived[self]) f.reviveFrac[self] = cl(a.hpFraction, 0.15, 0.6);
      break;
    case "randomChoice": {
      const list = a.actions;
      if (list.length) {
        const idx = Math.floor(rngNext(f.rng) * list.length) % list.length;
        runOne(f, self, other, list[idx], scale);
      }
      break;
    }
    case "repeat": {
      const times = cl(a.count | 0, 1, 6);
      const interval = cl(a.interval, 0.15, 5);
      runActions(f, self, other, a.actions, scale);
      if (times > 1) schedule(f, self, a.actions, interval, times - 1, interval, scale);
      break;
    }
    case "scaleWith": {
      let counter = f.hits[self];
      if (a.counter === "walls") counter = f.walls[self];
      else if (a.counter === "time") counter = f.time;
      else if (a.counter === "hpLost") counter = f.hpLost[self];
      const per = a.per > 0.05 ? a.per : 0.05;
      const stacks = Math.floor(counter / per);
      const mul = 1 + stacks * cl(a.bonus, 0, 0.5);
      runActions(f, self, other, a.actions, scale * (mul > 3 ? 3 : mul));
      break;
    }
    default:
      break;
  }
}

function doSplit(f: Fight, self: number, count: number, hpFraction: number): void {
  if (f.gen[self] >= 2) return;
  if (f.kind[self] !== K_BALL && f.kind[self] !== K_SUMMON) return;
  const n = cl(count | 0, 2, f.cfg.maxSummonCount);
  const frac = cl(hpFraction, 0.3, 1);
  const share = Math.max(8, (f.hp[self] * frac) / n);
  f.hp[self] = share;
  f.maxHp[self] = Math.max(f.maxHp[self] * 0.6, share);
  f.r[self] = Math.max(0.45, f.r[self] * 0.78);
  f.gen[self] = f.gen[self] + 1;
  for (let k = 1; k < n; k++) {
    const s = spawn(f, f.owner[self]);
    if (s < 0) break;
    f.kind[s] = K_SUMMON;
    f.defSlot[s] = f.defSlot[self];
    f.gen[s] = f.gen[self];
    f.r[s] = f.r[self];
    f.mass[s] = f.mass[self];
    f.hp[s] = share;
    f.maxHp[s] = share;
    f.speed[s] = f.speed[self] * 0.95;
    f.contact[s] = f.contact[self] * 0.8;
    f.ttl[s] = 16;
    f.spMul[s] = 1;
    f.ctMul[s] = 1;
    const ang = (k / n) * Math.PI * 2;
    place(f, s, f.x[self] + Math.cos(ang) * (f.r[self] + f.r[s] + 0.15), f.y[self] + Math.sin(ang) * (f.r[self] + f.r[s] + 0.15));
    f.vx[s] = Math.cos(ang) * f.speed[s];
    f.vy[s] = Math.sin(ang) * f.speed[s];
    f.safeX[s] = f.x[s];
    f.safeY[s] = f.y[s];
    pushFx(f, FX_SPAWN, f.x[s], f.y[s], 1, f.owner[s]);
  }
}

function doZone(f: Fight, self: number, a: Extract<Action, { type: "spawnZone" }>): void {
  const shape = a.shape;
  const make = (ox: number, oy: number, sub: number, len: number) => {
    const z = spawn(f, f.owner[self]);
    if (z < 0) return;
    f.kind[z] = K_ZONE;
    f.sub[z] = sub;
    f.r[z] = cl(a.radius ?? 1.7, 0.4, 4.5);
    f.ttl[z] = cl(a.duration, 0.3, f.cfg.maxZoneDuration);
    f.p0[z] = cl(a.damagePerSecond, 0, f.cfg.maxDps);
    f.p1[z] = cl(a.slow ?? 0, 0, 0.7);
    f.p2[z] = cl(len, 0.5, 10);
    f.parent[z] = a.follow ? self : -1;
    f.mass[z] = 1;
    f.hp[z] = 1;
    f.maxHp[z] = 1;
    let dx = f.vx[self];
    let dy = f.vy[self];
    const dl = Math.hypot(dx, dy) || 1;
    f.vx[z] = dx / dl;
    f.vy[z] = dy / dl;
    place(f, z, f.x[self] + ox, f.y[self] + oy);
    f.safeX[z] = f.x[z];
    f.safeY[z] = f.y[z];
  };
  if (shape === "web") {
    make(0, 0, SUB_WEB, 0);
    make(1.1, 0, SUB_WEB, 0);
    make(-1.1, 0, SUB_WEB, 0);
    make(0, 1.1, SUB_WEB, 0);
  } else if (shape === "line") {
    make(0, 0, SUB_LINE, a.length ?? 4.5);
  } else if (shape === "ring") {
    make(0, 0, SUB_RING, a.radius ?? 2);
  } else {
    make(0, 0, 0, 0);
  }
}

function doProj(f: Fight, self: number, a: Extract<Action, { type: "spawnProjectile" }>): void {
  const count = cl(a.count ?? 1, 1, 5);
  let sub = 0;
  if (a.pattern === "homing") sub = P_HOMING;
  else if (a.pattern === "bouncing") sub = P_BOUNCE;
  else if (a.pattern === "piercing") sub = P_PIERCE;
  else if (a.pattern === "explosive") sub = P_BOOM;
  let dx = f.vx[self];
  let dy = f.vy[self];
  const e = enemyOf(f, self);
  if (e >= 0 && (a.pattern === "homing" || Math.hypot(dx, dy) < 0.2)) {
    dx = f.x[e] - f.x[self];
    dy = f.y[e] - f.y[self];
  }
  const base = Math.atan2(dy, dx);
  for (let k = 0; k < count; k++) {
    const p = spawn(f, f.owner[self]);
    if (p < 0) return;
    const spread = count === 1 ? 0 : (k - (count - 1) / 2) * 0.28;
    const ang = base + spread;
    f.kind[p] = K_PROJ;
    f.sub[p] = sub;
    f.r[p] = cl(a.radius ?? 0.28, 0.12, 0.7);
    f.mass[p] = 0.35;
    f.hp[p] = 1;
    f.maxHp[p] = 1;
    f.speed[p] = cl(a.speed, 6, 32);
    f.contact[p] = cl(a.damage, 0, 25);
    f.ttl[p] = cl(a.ttl ?? 2.4, 0.3, 5);
    f.p0[p] = sub === P_BOUNCE ? 3 : 0;
    f.vx[p] = Math.cos(ang) * f.speed[p];
    f.vy[p] = Math.sin(ang) * f.speed[p];
    place(f, p, f.x[self] + Math.cos(ang) * (f.r[self] + f.r[p] + 0.05), f.y[self] + Math.sin(ang) * (f.r[self] + f.r[p] + 0.05));
    f.safeX[p] = f.x[p];
    f.safeY[p] = f.y[p];
  }
}

function doTurret(f: Fight, self: number, a: Extract<Action, { type: "spawnTurret" }>): void {
  if (countKind(f, f.owner[self], K_TURRET) >= 3) return;
  const t = spawn(f, f.owner[self]);
  if (t < 0) return;
  f.kind[t] = K_TURRET;
  f.r[t] = 0.55;
  f.mass[t] = 2;
  f.hp[t] = cl(a.hp, 8, 80);
  f.maxHp[t] = f.hp[t];
  f.ttl[t] = cl(a.duration, 1, 14);
  f.p0[t] = cl(a.interval, 0.35, 3);
  f.p1[t] = cl(a.projectileDamage, 1, 18);
  f.p2[t] = 0.35;
  f.speed[t] = 0;
  place(f, t, f.x[self], f.y[self]);
  f.safeX[t] = f.x[t];
  f.safeY[t] = f.y[t];
  pushFx(f, FX_SPAWN, f.x[t], f.y[t], 1, f.owner[t]);
}

function doSummon(f: Fight, self: number, a: Extract<Action, { type: "spawnSummon" }>): void {
  const count = cl(a.count ?? 1, 1, f.cfg.maxSummonCount);
  if (countKind(f, f.owner[self], K_SUMMON) >= 6) return;
  for (let k = 0; k < count; k++) {
    const s = spawn(f, f.owner[self]);
    if (s < 0) return;
    f.kind[s] = K_SUMMON;
    f.defSlot[s] = -1;
    f.r[s] = cl(a.radius, 0.35, 1.1);
    f.mass[s] = 0.7;
    f.hp[s] = cl(a.hp, 8, 80);
    f.maxHp[s] = f.hp[s];
    f.speed[s] = cl(a.speed, 6, 20);
    f.contact[s] = cl(a.contactDamage, 1, 14);
    f.ttl[s] = cl(a.duration, 1, 14);
    f.spMul[s] = 1;
    f.ctMul[s] = 1;
    const ang = (k / count) * Math.PI * 2;
    place(f, s, f.x[self] + Math.cos(ang) * 1.3, f.y[self] + Math.sin(ang) * 1.3);
    f.vx[s] = Math.cos(ang) * f.speed[s];
    f.vy[s] = Math.sin(ang) * f.speed[s];
    f.safeX[s] = f.x[s];
    f.safeY[s] = f.y[s];
  }
}

function doOrbit(f: Fight, self: number, a: Extract<Action, { type: "spawnOrbiter" }>): void {
  if (countKind(f, f.owner[self], K_ORBIT) >= 8) return;
  const count = cl(a.count | 0, 1, 4);
  for (let k = 0; k < count; k++) {
    if (countKind(f, f.owner[self], K_ORBIT) >= 8) return;
    const o = spawn(f, f.owner[self]);
    if (o < 0) return;
    f.kind[o] = K_ORBIT;
    f.parent[o] = self;
    f.r[o] = 0.28;
    f.mass[o] = 0.4;
    f.hp[o] = 1;
    f.maxHp[o] = 1;
    f.contact[o] = cl(a.damage, 1, 16);
    f.ttl[o] = cl(a.duration, 0.4, 30);
    f.p0[o] = cl(a.radius, 0.8, 3.2);
    f.p1[o] = (k / count) * Math.PI * 2;
    f.p2[o] = cl(a.orbit, 0.6, 5);
    f.x[o] = f.x[self];
    f.y[o] = f.y[self];
    place(f, o, f.x[o], f.y[o]);
  }
}

function condOk(f: Fight, self: number, other: number, ab: Ability): boolean {
  const list = ab.conditions;
  if (!list || !list.length) return true;
  const hpPct = (f.hp[self] / f.maxHp[self]) * 100;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.type === "hpBelow" && !(hpPct < c.value)) return false;
    if (c.type === "hpAbove" && !(hpPct > c.value)) return false;
    if (c.type === "hitCountAtLeast" && !(f.hits[self] >= c.value)) return false;
    if (c.type === "chance" && !(rngNext(f.rng) < c.value)) return false;
    if (c.type === "enemyDistanceBelow" || c.type === "enemyDistanceAbove") {
      const e = other >= 0 && f.active[other] ? other : enemyOf(f, self);
      if (e < 0) return false;
      const dx = f.x[e] - f.x[self];
      const dy = f.y[e] - f.y[self];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (c.type === "enemyDistanceBelow" && !(d < c.value)) return false;
      if (c.type === "enemyDistanceAbove" && !(d > c.value)) return false;
    }
  }
  return true;
}

function fireTrigger(f: Fight, id: number, trigger: string, other: number): void {
  if (!f.active[id] || f.depth > 7) return;
  const slot = f.defSlot[id];
  if (slot < 0) return;
  const def = f.defs[slot];
  if (!def) return;
  const abs = def.abilities;
  const once =
    trigger === "onSpawn" ||
    trigger === "onRoundStart" ||
    trigger === "onHpBelow" ||
    trigger === "onTimer" ||
    trigger === "onKill";
  for (let a = 0; a < abs.length && a < MAX_AB; a++) {
    const ab = abs[a];
    if (ab.trigger !== trigger) continue;
    if (f.abMask[id] & (1 << a)) continue;
    const cdI = id * MAX_AB + a;
    if (f.abCd[cdI] > 0) continue;
    if (once && f.abOnce[id] & (1 << a)) continue;
    if (trigger === "onHpBelow") {
      const pct = ab.percent ?? 50;
      if ((f.hp[id] / f.maxHp[id]) * 100 > pct) continue;
    }
    if (trigger === "onTimer" && f.time + 1e-8 < (ab.seconds ?? 0)) continue;
    if (!condOk(f, id, other, ab)) continue;
    const cd = ab.cooldown ?? (trigger === "onTick" ? (ab.interval ?? 1) : 0);
    // Floor at one tick so a 0-cooldown trigger cannot re-enter inside its own effect.
    f.abCd[cdI] = cd > 0 ? cd : 1 / f.cfg.simHz;
    if (once) f.abOnce[id] = f.abOnce[id] | (1 << a);
    f.depth++;
    try {
      runActions(f, id, other, ab.actions, 1);
    } catch (err) {
      f.abMask[id] = f.abMask[id] | (1 << a);
      if (f.errors.length < 16) {
        const msg = err instanceof Error ? err.message : "ability error";
        f.errors.push(def.id + " ability " + a + " disabled: " + msg);
      }
    }
    f.depth--;
    if (f.depth < 0) f.depth = 0;
  }
}

function callScript(f: Fight, id: number, name: keyof ScriptHooks, other: number): void {
  const slot = f.defSlot[id];
  if (slot < 0 || f.scriptOff[slot]) return;
  const hooks = f.scripts[slot];
  const fn = hooks ? hooks[name] : undefined;
  if (!fn) return;
  const e = other >= 0 && f.active[other] ? other : enemyOf(f, id);
  f.ctxId = id;
  f.scriptCalls = 0;
  const c = f.ctx;
  c.time = f.time;
  c.x = f.x[id];
  c.y = f.y[id];
  c.hp = f.hp[id];
  c.maxHp = f.maxHp[id];
  c.vx = f.vx[id];
  c.vy = f.vy[id];
  c.enemyX = e >= 0 ? f.x[e] : 0;
  c.enemyY = e >= 0 ? f.y[e] : 0;
  c.enemyHp = e >= 0 ? f.hp[e] : 0;
  try {
    fn(c);
  } catch (err) {
    f.scriptOff[slot] = 1;
    if (f.errors.length < 16) {
      const msg = err instanceof Error ? err.message : "script error";
      f.errors.push(f.defs[slot].id + " script disabled: " + msg);
    }
  }
}

function resolveWall(f: Fight, i: number): boolean {
  const m = f.H - f.r[i];
  let hit = false;
  if (f.x[i] < -m) {
    f.x[i] = -m;
    if (f.vx[i] < 0) f.vx[i] = -f.vx[i];
    hit = true;
  } else if (f.x[i] > m) {
    f.x[i] = m;
    if (f.vx[i] > 0) f.vx[i] = -f.vx[i];
    hit = true;
  }
  if (f.y[i] < -m) {
    f.y[i] = -m;
    if (f.vy[i] < 0) f.vy[i] = -f.vy[i];
    hit = true;
  } else if (f.y[i] > m) {
    f.y[i] = m;
    if (f.vy[i] > 0) f.vy[i] = -f.vy[i];
    hit = true;
  }
  return hit;
}

function onWall(f: Fight, i: number): void {
  const k = f.kind[i];
  if (k === K_PROJ) {
    if (f.sub[i] === P_BOUNCE && f.p0[i] > 0) {
      f.p0[i] -= 1;
      pushFx(f, FX_WALL, f.x[i], f.y[i], 0.4, f.owner[i]);
      return;
    }
    if (f.sub[i] === P_BOOM) explode(f, i, 1.6, f.contact[i], 8, 1);
    kill(f, i);
    return;
  }
  if (k === K_BALL || k === K_SUMMON) {
    f.walls[i] += 1;
    pushFx(f, FX_WALL, f.x[i], f.y[i], 1, f.owner[i]);
    const other = enemyOf(f, i);
    fireTrigger(f, i, "onWallHit", other);
    callScript(f, i, "onWallHit", other);
  }
}

function normalize(f: Fight, i: number, dt: number): void {
  const k = f.kind[i];
  if (k !== K_BALL && k !== K_SUMMON) return;
  const ts = targetSpeed(f, i);
  if (ts <= 0.01) {
    f.vx[i] = 0;
    f.vy[i] = 0;
    return;
  }
  let sp = Math.hypot(f.vx[i], f.vy[i]);
  if (sp < 0.08) {
    const ang = rngNext(f.rng) * Math.PI * 2;
    f.vx[i] = Math.cos(ang) * ts;
    f.vy[i] = Math.sin(ang) * ts;
    return;
  }
  const desired = sp + (ts - sp) * Math.min(1, f.cfg.speedNormalize * dt);
  const capped = desired > f.cfg.maxSpeed ? f.cfg.maxSpeed : desired < 0 ? 0 : desired;
  const kk = capped / sp;
  f.vx[i] *= kk;
  f.vy[i] *= kk;
}

function moveOne(f: Fight, i: number, dt: number): void {
  const k = f.kind[i];
  if (k !== K_BALL && k !== K_SUMMON && k !== K_PROJ) return;
  if ((k === K_BALL || k === K_SUMMON) && f.hp[i] <= 0) return;
  if ((k === K_BALL || k === K_SUMMON) && locked(f, i)) {
    f.vx[i] = 0;
    f.vy[i] = 0;
    return;
  }
  capSpeed(f, i);
  const vx = f.vx[i];
  const vy = f.vy[i];
  const dist = Math.hypot(vx, vy) * dt;
  const maxStep = Math.max(0.22, f.r[i] * 0.5);
  const n = dist > maxStep ? Math.min(6, Math.ceil(dist / maxStep)) : 1;
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    if (!f.active[i]) return;
    f.x[i] += f.vx[i] * sdt;
    f.y[i] += f.vy[i] * sdt;
    if (resolveWall(f, i)) onWall(f, i);
  }
  if (f.active[i]) place(f, i, f.x[i], f.y[i]);
}

function pairCd(f: Fight, a: number, b: number): boolean {
  const now = f.time;
  for (let i = 0; i < f.cdN; i++) {
    const hit = (f.cdA[i] === a && f.cdB[i] === b) || (f.cdA[i] === b && f.cdB[i] === a);
    if (hit) {
      if (now < f.cdUntil[i]) return false;
      f.cdUntil[i] = now + f.cfg.hitCooldown;
      return true;
    }
  }
  if (f.cdN < 48) {
    const i = f.cdN++;
    f.cdA[i] = a;
    f.cdB[i] = b;
    f.cdUntil[i] = now + f.cfg.hitCooldown;
    return true;
  }
  f.cdA[0] = a;
  f.cdB[0] = b;
  f.cdUntil[0] = now + f.cfg.hitCooldown;
  return true;
}

function collideBodies(f: Fight): void {
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    const ki = f.kind[i];
    if (ki !== K_BALL && ki !== K_SUMMON) continue;
    if (f.hp[i] <= 0) continue;
    for (let j = i + 1; j < MAX_ENT; j++) {
      if (!f.active[j]) continue;
      const kj = f.kind[j];
      if (kj !== K_BALL && kj !== K_SUMMON) continue;
      if (f.hp[j] <= 0) continue;
      const dx = f.x[j] - f.x[i];
      const dy = f.y[j] - f.y[i];
      const rr = f.r[i] + f.r[j];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      let nx: number;
      let ny: number;
      if (d < 1e-6) {
        nx = 1;
        ny = 0;
        d = 1e-6;
        f.x[i] -= 0.02;
      } else {
        nx = dx / d;
        ny = dy / d;
      }
      const overlap = rr - d;
      const im1 = 1 / f.mass[i];
      const im2 = 1 / f.mass[j];
      const inv = im1 + im2;
      f.x[i] -= nx * overlap * (im1 / inv);
      f.y[i] -= ny * overlap * (im1 / inv);
      f.x[j] += nx * overlap * (im2 / inv);
      f.y[j] += ny * overlap * (im2 / inv);
      place(f, i, f.x[i], f.y[i]);
      place(f, j, f.x[j], f.y[j]);
      const rvx = f.vx[i] - f.vx[j];
      const rvy = f.vy[i] - f.vy[j];
      const rel = rvx * nx + rvy * ny;
      if (rel < 0) {
        const jimp = (-(1 + f.cfg.restitution) * rel) / inv;
        f.vx[i] += jimp * im1 * nx;
        f.vy[i] += jimp * im1 * ny;
        f.vx[j] -= jimp * im2 * nx;
        f.vy[j] -= jimp * im2 * ny;
      }
      capSpeed(f, i);
      capSpeed(f, j);
      if (f.owner[i] !== f.owner[j] && f.owner[i] >= 0 && f.owner[j] >= 0) {
        const relSp = Math.hypot(f.vx[i] - f.vx[j], f.vy[i] - f.vy[j]);
        if (relSp >= f.cfg.minHitSpeed && pairCd(f, i, j)) {
          const di = contactNow(f, j) * relSp * f.cfg.contactScale;
          const dj = contactNow(f, i) * relSp * f.cfg.contactScale;
          hurt(f, i, di, j, true);
          hurt(f, j, dj, i, true);
          f.hits[i] += 1;
          f.hits[j] += 1;
          fireTrigger(f, i, "onBallHit", j);
          fireTrigger(f, j, "onBallHit", i);
          callScript(f, i, "onBallHit", j);
          callScript(f, j, "onBallHit", i);
        }
      }
    }
  }
}

function projectileHits(f: Fight): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_PROJ) continue;
    for (let j = 0; j < MAX_ENT; j++) {
      if (!f.active[i]) break;
      if (i === j || !f.active[j]) continue;
      const k = f.kind[j];
      if (k !== K_BALL && k !== K_SUMMON && k !== K_TURRET) continue;
      if (f.owner[j] === f.owner[i]) continue;
      const dx = f.x[j] - f.x[i];
      const dy = f.y[j] - f.y[i];
      const rr = f.r[i] + f.r[j];
      if (dx * dx + dy * dy > rr * rr) continue;
      hurt(f, j, f.contact[i], i, true);
      if (f.sub[i] === P_BOOM) explode(f, i, 1.7, f.contact[i], 9, 1);
      if (f.sub[i] !== P_PIERCE) {
        kill(f, i);
        break;
      }
    }
  }
}

function updateOrbit(f: Fight, dt: number): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_ORBIT) continue;
    const p = f.parent[i];
    if (p < 0 || !f.active[p] || f.hp[p] <= 0) {
      kill(f, i);
      continue;
    }
    f.p1[i] += f.p2[i] * dt;
    const ox = f.x[p] + Math.cos(f.p1[i]) * f.p0[i];
    const oy = f.y[p] + Math.sin(f.p1[i]) * f.p0[i];
    place(f, i, ox, oy);
    for (let j = 0; j < MAX_ENT; j++) {
      if (!f.active[j] || f.owner[j] === f.owner[i]) continue;
      const k = f.kind[j];
      if (k !== K_BALL && k !== K_SUMMON) continue;
      const dx = f.x[j] - f.x[i];
      const dy = f.y[j] - f.y[i];
      const rr = f.r[i] + f.r[j];
      if (dx * dx + dy * dy > rr * rr) continue;
      if (!pairCd(f, i, j)) continue;
      hurt(f, j, f.contact[i], i, true);
    }
  }
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.sqrt(dx * dx + dy * dy);
}

function zoneHits(f: Fight, dt: number): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_ZONE) continue;
    const parent = f.parent[i];
    if (parent >= 0 && f.active[parent]) {
      place(f, i, f.x[parent], f.y[parent]);
    }
    for (let j = 0; j < MAX_ENT; j++) {
      if (!f.active[j] || f.owner[j] === f.owner[i]) continue;
      const k = f.kind[j];
      if (k !== K_BALL && k !== K_SUMMON) continue;
      let hit = false;
      if (f.sub[i] === SUB_LINE) {
        const len = f.p2[i];
        const ax = f.x[i] - f.vx[i] * len * 0.5;
        const ay = f.y[i] - f.vy[i] * len * 0.5;
        const bx = f.x[i] + f.vx[i] * len * 0.5;
        const by = f.y[i] + f.vy[i] * len * 0.5;
        hit = distPointSeg(f.x[j], f.y[j], ax, ay, bx, by) < f.r[i] + f.r[j] * 0.4;
      } else if (f.sub[i] === SUB_RING) {
        const dx = f.x[j] - f.x[i];
        const dy = f.y[j] - f.y[i];
        const d = Math.sqrt(dx * dx + dy * dy);
        const inner = Math.max(0.2, f.p2[i] - 0.45);
        hit = d > inner && d < f.p2[i] + f.r[j];
      } else {
        const dx = f.x[j] - f.x[i];
        const dy = f.y[j] - f.y[i];
        const rr = f.r[i] + f.r[j];
        hit = dx * dx + dy * dy < rr * rr;
      }
      if (!hit) continue;
      hurt(f, j, f.p0[i] * dt, i, false);
      if (f.p1[i] > 0) status(f, j, S_SLOW, 0.2, f.p1[i]);
    }
  }
}

function steerSummons(f: Fight): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_SUMMON || f.hp[i] <= 0) continue;
    if (locked(f, i)) continue;
    const e = enemyOf(f, i);
    if (e < 0) continue;
    const dx = f.x[e] - f.x[i];
    const dy = f.y[e] - f.y[i];
    const d = Math.hypot(dx, dy) || 1;
    const s = targetSpeed(f, i);
    f.vx[i] = (dx / d) * s;
    f.vy[i] = (dy / d) * s;
  }
}

function homing(f: Fight): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_PROJ || f.sub[i] !== P_HOMING) continue;
    const e = enemyOf(f, i);
    if (e < 0) continue;
    const dx = f.x[e] - f.x[i];
    const dy = f.y[e] - f.y[i];
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.hypot(f.vx[i], f.vy[i]) || f.speed[i];
    const tx = (dx / d) * sp;
    const ty = (dy / d) * sp;
    f.vx[i] = f.vx[i] * 0.86 + tx * 0.14;
    f.vy[i] = f.vy[i] * 0.86 + ty * 0.14;
    const ns = Math.hypot(f.vx[i], f.vy[i]) || 1;
    f.vx[i] = (f.vx[i] / ns) * sp;
    f.vy[i] = (f.vy[i] / ns) * sp;
  }
}

function turrets(f: Fight, dt: number): void {
  for (let i = 2; i < MAX_ENT; i++) {
    if (!f.active[i] || f.kind[i] !== K_TURRET) continue;
    f.p2[i] -= dt;
    if (f.p2[i] > 0) continue;
    f.p2[i] = f.p0[i];
    const e = enemyOf(f, i);
    if (e < 0) continue;
    const p = spawn(f, f.owner[i]);
    if (p < 0) continue;
    const dx = f.x[e] - f.x[i];
    const dy = f.y[e] - f.y[i];
    const d = Math.hypot(dx, dy) || 1;
    f.kind[p] = K_PROJ;
    f.sub[p] = 0;
    f.r[p] = 0.22;
    f.mass[p] = 0.3;
    f.hp[p] = 1;
    f.maxHp[p] = 1;
    f.speed[p] = 15;
    f.contact[p] = f.p1[i];
    f.ttl[p] = 2.2;
    f.vx[p] = (dx / d) * 15;
    f.vy[p] = (dy / d) * 15;
    place(f, p, f.x[i] + (dx / d) * 0.8, f.y[i] + (dy / d) * 0.8);
    f.safeX[p] = f.x[p];
    f.safeY[p] = f.y[p];
  }
}

function tickStatuses(f: Fight, dt: number): void {
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    f.age[i] += dt;
    if (f.ttl[i] > 0) {
      f.ttl[i] -= dt;
      if (f.ttl[i] <= 0) {
        if (f.kind[i] === K_PROJ && f.sub[i] === P_BOOM) explode(f, i, 1.5, f.contact[i] * 0.6, 6, 1);
        if (i >= 2) {
          kill(f, i);
          continue;
        }
      }
    }
    const b = i * ST_N;
    for (let s = 0; s < ST_N; s++) {
      if (f.stT[b + s] > 0) {
        f.stT[b + s] -= dt;
        if (f.stT[b + s] <= 0) {
          f.stT[b + s] = 0;
          if (s !== S_SHIELD) f.stM[b + s] = 0;
        }
      }
    }
    if (f.stT[b + S_POISON] > 0) hurt(f, i, f.stM[b + S_POISON] * dt, -1, false);
    if (f.stT[b + S_BURN] > 0 && f.active[i]) hurt(f, i, f.stM[b + S_BURN] * dt, -1, false);
    if (f.stT[b + S_REGEN] > 0 && f.active[i]) heal(f, i, f.stM[b + S_REGEN] * dt);
    const ab = i * MAX_AB;
    for (let a = 0; a < MAX_AB; a++) {
      if (f.abCd[ab + a] > 0) f.abCd[ab + a] -= dt;
    }
    if (f.spT[i] > 0) {
      f.spT[i] -= dt;
      if (f.spT[i] <= 0) {
        f.spMul[i] = 1;
        f.spAdd[i] = 0;
      }
    }
    if (f.ctT[i] > 0) {
      f.ctT[i] -= dt;
      if (f.ctT[i] <= 0) {
        f.ctMul[i] = 1;
        f.ctAdd[i] = 0;
      }
    }
    if (f.radT[i] > 0) {
      f.radT[i] -= dt;
      if (f.radT[i] <= 0) f.radAdd[i] = 0;
    }
    if (f.thornsT[i] > 0) f.thornsT[i] -= dt;
    const baseR = f.kind[i] === K_BALL ? f.defs[f.owner[i] === 1 ? 1 : 0].stats.radius : f.r[i] - f.radAdd[i];
    if (f.kind[i] === K_BALL) {
      f.r[i] = cl(baseR + f.radAdd[i], 0.45, 2.2);
    }
  }
}

function tickDelays(f: Fight, dt: number): void {
  for (let i = 0; i < MAX_DELAY; i++) {
    if (!f.dOn[i]) continue;
    f.dTime[i] -= dt;
    if (f.dTime[i] > 0) continue;
    const ent = f.dEnt[i];
    const ref = f.dRef[i];
    const scale = f.dScale[i];
    if (ref && f.active[ent]) {
      const other = enemyOf(f, ent);
      runActions(f, ent, other, ref, scale);
    }
    f.dLeft[i] -= 1;
    if (f.dLeft[i] > 0) f.dTime[i] = f.dInt[i];
    else {
      f.dOn[i] = 0;
      f.dRef[i] = null;
    }
  }
}

function sudden(f: Fight, dt: number): void {
  if (f.time < f.cfg.suddenDeathAt) return;
  f.sudden = true;
  const t = f.time - f.cfg.suddenDeathAt;
  const dps = f.cfg.suddenDps + t * f.cfg.suddenRamp;
  const margin = f.cfg.borderWidth + t * f.cfg.borderGrow;
  for (let i = 0; i < 2; i++) {
    if (!f.active[i] || f.hp[i] <= 0) continue;
    hurt(f, i, dps * dt, -1, false);
    const edge = Math.min(f.H - Math.abs(f.x[i]) - f.r[i], f.H - Math.abs(f.y[i]) - f.r[i]);
    if (edge < margin) hurt(f, i, (dps * 0.8 * dt * (margin - edge)) / margin, -1, false);
  }
}

function finishCheck(f: Fight, pre0: number, pre1: number): void {
  for (let i = 0; i < 2; i++) {
    if (f.hp[i] <= 0 && f.reviveFrac[i] > 0 && !f.revived[i]) {
      f.revived[i] = 1;
      f.hp[i] = f.maxHp[i] * f.reviveFrac[i];
      f.reviveFrac[i] = 0;
      pushFx(f, FX_HEAL, f.x[i], f.y[i], f.hp[i], i);
    }
  }
  if (f.hp[0] <= 0 && f.hp[1] <= 0) {
    if (pre0 >= pre1) {
      f.hp[0] = 0.01;
      f.hp[1] = 0;
    } else {
      f.hp[1] = 0.01;
      f.hp[0] = 0;
    }
  }
  if (f.time >= f.cfg.roundHardCap) {
    if (f.hp[0] === f.hp[1]) {
      if ((f.rng.s & 1) === 0) f.hp[1] = 0;
      else f.hp[0] = 0;
    } else if (f.hp[0] < f.hp[1]) f.hp[0] = 0;
    else f.hp[1] = 0;
  }
  if (f.hp[0] <= 0 && f.hp[1] > 0) {
    f.over = true;
    f.winner = 1;
    fireTrigger(f, 1, "onKill", 0);
    callScript(f, 0, "onDeath", 1);
  } else if (f.hp[1] <= 0 && f.hp[0] > 0) {
    f.over = true;
    f.winner = 0;
    fireTrigger(f, 0, "onKill", 1);
    callScript(f, 1, "onDeath", 0);
  }
}

function enforceAll(f: Fight): void {
  const H = f.H;
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    if (!Number.isFinite(f.x[i]) || !Number.isFinite(f.y[i]) || !Number.isFinite(f.vx[i]) || !Number.isFinite(f.vy[i]) || !Number.isFinite(f.hp[i])) {
      f.nans++;
      f.x[i] = Number.isFinite(f.safeX[i]) ? f.safeX[i] : 0;
      f.y[i] = Number.isFinite(f.safeY[i]) ? f.safeY[i] : 0;
      f.vx[i] = 0;
      f.vy[i] = 0;
      if (!Number.isFinite(f.hp[i])) f.hp[i] = f.safeHp[i] > 0 ? f.safeHp[i] : 1;
    }
    place(f, i, f.x[i], f.y[i]);
    capSpeed(f, i);
    const m = H - f.r[i] + 1e-4;
    if (f.x[i] < -m || f.x[i] > m || f.y[i] < -m || f.y[i] > m) {
      f.oob++;
      place(f, i, cl(f.x[i], -H + f.r[i], H - f.r[i]), cl(f.y[i], -H + f.r[i], H - f.r[i]));
    }
    if (Number.isFinite(f.x[i]) && Number.isFinite(f.y[i]) && Number.isFinite(f.hp[i])) {
      f.safeX[i] = f.x[i];
      f.safeY[i] = f.y[i];
      f.safeHp[i] = f.hp[i];
    }
  }
}

export function stepFight(f: Fight): void {
  if (f.over) return;
  const dt = 1 / f.cfg.simHz;
  const pre0 = f.hp[0];
  const pre1 = f.hp[1];
  f.tick++;
  f.time += dt;
  tickStatuses(f, dt);
  tickDelays(f, dt);
  if (f.active[0] && f.hp[0] > 0) {
    fireTrigger(f, 0, "onTick", 1);
    fireTrigger(f, 0, "onTimer", 1);
    fireTrigger(f, 0, "onHpBelow", 1);
    callScript(f, 0, "onTick", 1);
  }
  if (f.active[1] && f.hp[1] > 0) {
    fireTrigger(f, 1, "onTick", 0);
    fireTrigger(f, 1, "onTimer", 0);
    fireTrigger(f, 1, "onHpBelow", 0);
    callScript(f, 1, "onTick", 0);
  }
  steerSummons(f);
  homing(f);
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    const k = f.kind[i];
    if (k === K_BALL || k === K_SUMMON || k === K_PROJ) {
      moveOne(f, i, dt);
      if (f.active[i]) normalize(f, i, dt);
    }
  }
  collideBodies(f);
  projectileHits(f);
  updateOrbit(f, dt);
  zoneHits(f, dt);
  turrets(f, dt);
  sudden(f, dt);
  enforceAll(f);
  finishCheck(f, pre0, pre1);
  enforceAll(f);
}

export function hashFight(f: Fight): string {
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    const x = Math.round(n * 1000) | 0;
    h ^= x >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(f.tick);
  mix(f.time);
  mix(f.rng.s);
  mix(f.winner);
  mix(f.hp[0]);
  mix(f.hp[1]);
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    mix(i);
    mix(f.kind[i]);
    mix(f.x[i]);
    mix(f.y[i]);
    mix(f.vx[i]);
    mix(f.vy[i]);
    mix(f.hp[i]);
  }
  return h.toString(16);
}

export function auditFight(f: Fight): { inside: boolean; finite: boolean; count: number } {
  let count = 0;
  let inside = true;
  let finite = true;
  for (let i = 0; i < MAX_ENT; i++) {
    if (!f.active[i]) continue;
    count++;
    const m = f.H - f.r[i] + 1e-3;
    if (f.x[i] < -m || f.x[i] > m || f.y[i] < -m || f.y[i] > m) inside = false;
    if (!Number.isFinite(f.x[i]) || !Number.isFinite(f.y[i]) || !Number.isFinite(f.vx[i]) || !Number.isFinite(f.hp[i])) finite = false;
    if (f.owner[i] === 0 || f.owner[i] === 1) {
      if (countKind(f, f.owner[i], f.kind[i]) > f.cfg.maxEntitiesPerBall) inside = false;
    }
  }
  return { inside, finite, count };
}

export function runFight(input: FightInput, reuse?: Fight): FightResult {
  const f = reuse ?? createFight(input);
  if (reuse) resetFight(reuse, input);
  const maxSteps = Math.ceil((input.maxTime ?? f.cfg.roundHardCap) * f.cfg.simHz) + 2;
  let guard = 0;
  while (!f.over && guard < maxSteps) {
    stepFight(f);
    guard++;
    if (input.maxTime && f.time >= input.maxTime) break;
  }
  if (!f.over) {
    f.over = true;
    const ra = f.maxHp[0] > 0 ? f.hp[0] / f.maxHp[0] : 0;
    const rb = f.maxHp[1] > 0 ? f.hp[1] / f.maxHp[1] : 0;
    f.winner = ra === rb ? (f.dmg0 >= f.dmg1 ? 0 : 1) : ra > rb ? 0 : 1;
  }
  return {
    winner: f.winner,
    time: f.time,
    hash: hashFight(f),
    oob: f.oob,
    nans: f.nans,
    errors: f.errors.slice(),
    dmgA: f.dmg0,
    dmgB: f.dmg1,
    sudden: f.sudden,
    ticks: f.tick,
    hpA: f.hp[0],
    hpB: f.hp[1],
  };
}

/** First wall bounce only — presentation, not a hidden full sim. */
export function previewAim(
  x: number,
  y: number,
  dx: number,
  dy: number,
  half: number,
  radius: number,
): { x2: number; y2: number; x3: number; y3: number } {
  const len = Math.hypot(dx, dy) || 1;
  let vx = dx / len;
  let vy = dy / len;
  let cx = x;
  let cy = y;
  const m = half - radius;
  let x2 = cx;
  let y2 = cy;
  for (let i = 0; i < 40; i++) {
    const nx = cx + vx * 0.45;
    const ny = cy + vy * 0.45;
    let hit = false;
    let hx = nx;
    let hy = ny;
    if (nx < -m || nx > m || ny < -m || ny > m) {
      hx = cl(nx, -m, m);
      hy = cl(ny, -m, m);
      if (nx < -m || nx > m) vx = -vx;
      if (ny < -m || ny > m) vy = -vy;
      hit = true;
    }
    cx = hx;
    cy = hy;
    if (hit) {
      x2 = cx;
      y2 = cy;
      break;
    }
    x2 = cx;
    y2 = cy;
  }
  const x3 = cl(x2 + vx * 3.2, -m, m);
  const y3 = cl(y2 + vy * 3.2, -m, m);
  return { x2, y2, x3, y3 };
}

export const FX = { HIT: FX_HIT, WALL: FX_WALL, BOOM: FX_BOOM, HEAL: FX_HEAL, SPAWN: FX_SPAWN };
