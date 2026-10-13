import { CONFIG, type Difficulty, type GameConfig } from "../config";
import type { BallDef } from "../sim/types";
import { createFight, runFight, stepFight, type Fight } from "../sim/engine";
import { rngNext, seedOf } from "../sim/rng";
import type { ScriptHooks } from "../sim/types";

export type Flow = "intro" | "pick" | "aim" | "countdown" | "fight" | "round" | "end";
export type SideControl = "human" | "bot";
export type AimStyle = "random" | "enemy" | "wall" | "corner" | "smart" | "fixed" | "manual";

export interface Session {
  cfg: GameConfig;
  flow: Flow;
  seed: number;
  rng: { s: number };
  round: number;
  hearts: [number, number];
  timer: number;
  acc: number;
  offers: [string[], string[]];
  picked: [number, number];
  confirmed: [boolean, boolean];
  /** World aim radians. Index 1 is secret until fight. */
  aim: [number, number];
  aimLocked: [boolean, boolean];
  freeReroll: [boolean, boolean];
  paidRerolls: [number, number];
  botRerolls: number;
  names: [string, string];
  diff: Difficulty;
  control: [SideControl, SideControl];
  aimStyle: [AimStyle, AimStyle];
  fixedAim: [number, number];
  pool: [BallDef[], BallDef[]];
  catalog: Map<string, BallDef>;
  scripts: Map<string, ScriptHooks | null>;
  fight: Fight | null;
  roundWinner: -1 | 0 | 1;
  matchWinner: -1 | 0 | 1;
  think: [number, number];
  acted: [boolean, boolean];
  viewSide: 0 | 1;
  timeScale: number;
  oob: number;
  nans: number;
  errors: string[];
  sudden: boolean;
  fast: boolean;
  coins: number;
  xp: number;
  ballName: [string, string];
}

export interface PublicView {
  flow: Flow;
  round: number;
  hearts: [number, number];
  timer: number;
  offers: string[];
  picked: number;
  confirmed: boolean;
  oppStatus: "choosing" | "locked";
  oppBall: string | null;
  myAim: number | null;
  aimLocked: boolean;
  oppAimLocked: boolean;
  names: [string, string];
  roundWinner: -1 | 0 | 1;
  matchWinner: -1 | 0 | 1;
  myBall: string;
  rerollCost: number;
  sudden: boolean;
  hp: [number, number];
  maxHp: [number, number];
}

export interface FrameEnt {
  id: number;
  x: number;
  y: number;
  r: number;
  kind: number;
  owner: number;
  hp: number;
  max: number;
}

export interface FrameFx {
  key: string;
  type: number;
  x: number;
  y: number;
  x2: number;
  y2: number;
  magnitude: number;
  owner: number;
  color: string;
  sound?: string;
}

export interface RenderFrame {
  flow: Flow;
  arrow: number | null;
  ents: FrameEnt[];
  effects: FrameFx[];
  sudden: boolean;
  spawn: [number, number];
}

function thinkTime(s: Session): number {
  if (s.fast) return 0.04;
  const span = s.cfg.botThink[s.diff];
  return span[0] + rngNext(s.rng) * (span[1] - span[0]);
}

export function ballById(s: Session, id: string): BallDef | undefined {
  return s.catalog.get(id);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join("|");
  const sb = [...b].sort().join("|");
  return sa === sb;
}

export function drawOffers(rng: { s: number }, pool: BallDef[], prev: string[] | null): string[] {
  const ids = pool.map((b) => b.id);
  if (!ids.length) return [];
  const n = Math.min(3, ids.length);
  for (let attempt = 0; attempt < 16; attempt++) {
    const bag = ids.slice();
    const out: string[] = [];
    while (out.length < n && bag.length) {
      const i = Math.floor(rngNext(rng) * bag.length);
      out.push(bag.splice(i, 1)[0]);
    }
    if (!prev || !sameSet(out, prev) || ids.length <= 3) return out;
  }
  return ids.slice(0, n);
}

export function rerollCost(s: Session, side: 0 | 1): number {
  if (!s.freeReroll[side]) return 0;
  const table = s.cfg.rerollCosts;
  return table[Math.min(table.length - 1, s.paidRerolls[side])];
}

export function createSession(opts: {
  seed: number;
  pool0: BallDef[];
  pool1: BallDef[];
  names: [string, string];
  diff: Difficulty;
  control?: [SideControl, SideControl];
  aimStyle?: [AimStyle, AimStyle];
  viewSide?: 0 | 1;
  fast?: boolean;
  scripts?: Map<string, ScriptHooks | null>;
  cfg?: GameConfig;
}): Session {
  const catalog = new Map<string, BallDef>();
  for (const b of [...opts.pool0, ...opts.pool1]) catalog.set(b.id, b);
  const s: Session = {
    cfg: opts.cfg ?? CONFIG,
    flow: "intro",
    seed: seedOf(opts.seed),
    rng: { s: seedOf(opts.seed) },
    round: 1,
    hearts: [opts.cfg?.hearts ?? CONFIG.hearts, opts.cfg?.hearts ?? CONFIG.hearts],
    timer: (opts.cfg ?? CONFIG).introSeconds,
    acc: 0,
    offers: [[], []],
    picked: [-1, -1],
    confirmed: [false, false],
    aim: [Math.PI / 2, -Math.PI / 2],
    aimLocked: [false, false],
    freeReroll: [false, false],
    paidRerolls: [0, 0],
    botRerolls: 0,
    names: opts.names,
    diff: opts.diff,
    control: opts.control ?? ["human", "bot"],
    aimStyle: opts.aimStyle ?? ["manual", opts.diff === "hard" ? "smart" : opts.diff === "easy" ? "random" : "enemy"],
    fixedAim: [Math.PI / 2, -Math.PI / 2],
    pool: [opts.pool0, opts.pool1],
    catalog,
    scripts: opts.scripts ?? new Map(),
    fight: null,
    roundWinner: -1,
    matchWinner: -1,
    think: [0, 0],
    acted: [false, false],
    viewSide: opts.viewSide ?? 0,
    timeScale: 1,
    oob: 0,
    nans: 0,
    errors: [],
    sudden: false,
    fast: opts.fast ?? false,
    coins: 0,
    xp: 0,
    ballName: ["", ""],
  };
  return s;
}

function startPick(s: Session): void {
  s.flow = "pick";
  s.timer = s.cfg.pickSeconds;
  s.offers[0] = drawOffers(s.rng, s.pool[0], s.offers[0].length ? s.offers[0] : null);
  s.offers[1] = drawOffers(s.rng, s.pool[1], s.offers[1].length ? s.offers[1] : null);
  s.picked = [-1, -1];
  s.confirmed = [false, false];
  s.acted = [false, false];
  s.aimLocked = [false, false];
  s.think = [s.control[0] === "bot" ? thinkTime(s) : 999, s.control[1] === "bot" ? thinkTime(s) : 999];
  s.fight = null;
  s.roundWinner = -1;
}

function chooseBotPick(s: Session, side: 0 | 1): number {
  const offers = s.offers[side];
  let best = 0;
  let score = -1;
  for (let i = 0; i < offers.length; i++) {
    const b = s.catalog.get(offers[i]);
    if (!b) continue;
    const role = b.ai_hints.role;
    const bias = role === "burst" ? 1.15 : role === "control" ? 1.1 : role === "scaling" ? 1.08 : role === "ranged" ? 1.12 : role === "sustain" ? 1.05 : 1;
    const rar = b.rarity === "mythic" ? 1.25 : b.rarity === "legendary" ? 1.18 : b.rarity === "epic" ? 1.1 : b.rarity === "rare" ? 1.04 : 1;
    const sc = bias * rar * (0.8 + rngNext(s.rng) * 0.4);
    if (sc > score) {
      score = sc;
      best = i;
    }
  }
  if (s.diff === "hard" && s.botRerolls < 1 && score < 1.05 && s.pool[side].length > 3) {
    s.botRerolls++;
    s.freeReroll[side] = true;
    s.offers[side] = drawOffers(s.rng, s.pool[side], s.offers[side]);
    return chooseBotPick(s, side);
  }
  return best;
}

function botAim(s: Session, side: 0 | 1, mine: BallDef, opp: BallDef): number {
  const style = s.aimStyle[side];
  const toward = side === 0 ? Math.PI / 2 : -Math.PI / 2;
  if (style === "fixed") return s.fixedAim[side];
  if (style === "random" || s.diff === "easy") return toward + (rngNext(s.rng) - 0.5) * 1.4;
  if (style === "wall" || mine.ai_hints.bestAim === "wall") return side === 0 ? 0.15 + rngNext(s.rng) * 0.4 : Math.PI - 0.2;
  if (style === "corner" || mine.ai_hints.bestAim === "corner") return toward + (side === 0 ? 0.7 : -0.7);
  if (style === "smart" || s.diff === "hard") return smartAim(s, side, mine, opp);
  return toward + (rngNext(s.rng) - 0.5) * 0.35;
}

function smartAim(s: Session, side: 0 | 1, mine: BallDef, opp: BallDef): number {
  const n = s.fast ? 6 : s.cfg.smartCandidates;
  let best = side === 0 ? Math.PI / 2 : -Math.PI / 2;
  let bestScore = -1e9;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const oppAng = rngNext(s.rng) * Math.PI * 2;
    const aAng = side === 0 ? ang : oppAng;
    const bAng = side === 0 ? oppAng : ang;
    const res = runFight({
      seed: (s.seed + s.round * 100 + i * 13) | 0,
      a: side === 0 ? mine : opp,
      b: side === 0 ? opp : mine,
      dirAX: Math.cos(aAng),
      dirAY: Math.sin(aAng),
      dirBX: Math.cos(bAng),
      dirBY: Math.sin(bAng),
      maxTime: s.cfg.smartHorizon,
      config: s.cfg,
    });
    const won = res.winner === side;
    const hp = side === 0 ? res.hpA : res.hpB;
    const score = (won ? 100 : 0) + hp;
    if (score > bestScore) {
      bestScore = score;
      best = ang;
    }
  }
  return best;
}

function ensureBot(s: Session, side: 0 | 1): void {
  if (s.control[side] !== "bot" || s.acted[side]) return;
  s.think[side] -= 0; // touched each advance
}

function botAct(s: Session, side: 0 | 1, dt: number): void {
  if (s.control[side] !== "bot") return;
  s.think[side] -= dt;
  if (s.think[side] > 0) return;
  if (s.flow === "pick" && !s.confirmed[side]) {
    s.picked[side] = chooseBotPick(s, side);
    s.confirmed[side] = true;
    s.acted[side] = true;
  } else if (s.flow === "aim" && !s.aimLocked[side]) {
    const myId = s.offers[side][s.picked[side]];
    const mine = s.catalog.get(myId);
    const pool = s.pool[side === 0 ? 1 : 0];
    const other = pool[Math.floor(rngNext(s.rng) * pool.length) % Math.max(1, pool.length)];
    if (mine && other && s.aimStyle[side] !== "manual") s.aim[side] = botAim(s, side, mine, other);
    s.aimLocked[side] = true;
  }
}

function autoHuman(s: Session, side: 0 | 1): void {
  if (s.control[side] !== "human") return;
  if (s.flow === "pick" && !s.confirmed[side]) {
    if (s.picked[side] < 0) s.picked[side] = Math.floor(rngNext(s.rng) * Math.max(1, s.offers[side].length)) % Math.max(1, s.offers[side].length);
    s.confirmed[side] = true;
  }
  if (s.flow === "aim" && !s.aimLocked[side]) {
    if (!Number.isFinite(s.aim[side])) s.aim[side] = side === 0 ? Math.PI / 2 : -Math.PI / 2;
    s.aimLocked[side] = true;
  }
}

function beginFight(s: Session): void {
  const id0 = s.offers[0][s.picked[0]];
  const id1 = s.offers[1][s.picked[1]];
  const a = s.catalog.get(id0);
  const b = s.catalog.get(id1);
  if (!a || !b) {
    s.flow = "end";
    s.matchWinner = 0;
    return;
  }
  s.ballName = [a.name.en, b.name.en];
  const ax = Math.cos(s.aim[0]);
  const ay = Math.sin(s.aim[0]);
  const bx = Math.cos(s.aim[1]);
  const by = Math.sin(s.aim[1]);
  s.fight = createFight({
    seed: (s.seed + s.round * 7919) | 0,
    a,
    b,
    dirAX: ax,
    dirAY: ay,
    dirBX: bx,
    dirBY: by,
    config: s.cfg,
    scripts: [s.scripts.get(a.id) ?? null, s.scripts.get(b.id) ?? null],
  });
  s.flow = "fight";
  s.timer = 0;
  s.acc = 0;
  s.sudden = false;
}

function endRound(s: Session): void {
  if (!s.fight) return;
  s.roundWinner = s.fight.winner;
  s.oob += s.fight.oob;
  s.nans += s.fight.nans;
  if (s.fight.errors.length) s.errors.push(...s.fight.errors);
  s.sudden = s.fight.sudden;
  if (s.roundWinner === 0) s.hearts[1] -= 1;
  else if (s.roundWinner === 1) s.hearts[0] -= 1;
  s.hearts[0] = Math.max(0, s.hearts[0]);
  s.hearts[1] = Math.max(0, s.hearts[1]);
  s.flow = "round";
  s.timer = s.fast ? 0.05 : s.cfg.roundEndPause;
  if (s.hearts[0] <= 0 || s.hearts[1] <= 0) {
    s.matchWinner = s.hearts[0] > 0 ? 0 : 1;
  }
}

function finishMatch(s: Session): void {
  s.flow = "end";
  const win = s.matchWinner === s.viewSide;
  const heartsLeft = s.hearts[s.viewSide];
  s.coins = win ? s.cfg.winCoinsBase + heartsLeft * 15 : s.cfg.loseCoins;
  s.xp = win ? s.cfg.xpWin : s.cfg.xpLose;
}

export function applyCommand(
  s: Session,
  cmd: { t: "pick" | "confirm" | "reroll" | "aim" | "lock"; side: 0 | 1; index?: number; angle?: number },
  spend?: (n: number) => boolean,
): string | null {
  const side = cmd.side;
  if (cmd.t === "pick" && s.flow === "pick" && !s.confirmed[side]) {
    const idx = cmd.index ?? -1;
    if (idx >= 0 && idx < s.offers[side].length) s.picked[side] = idx;
    return null;
  }
  if (cmd.t === "confirm" && s.flow === "pick") {
    if (s.picked[side] < 0) return "pick a ball";
    s.confirmed[side] = true;
    return null;
  }
  if (cmd.t === "reroll" && s.flow === "pick" && !s.confirmed[side]) {
    const cost = rerollCost(s, side);
    if (cost > 0) {
      if (!spend || !spend(cost)) return "diamonds";
      s.paidRerolls[side] += 1;
    } else s.freeReroll[side] = true;
    s.offers[side] = drawOffers(s.rng, s.pool[side], s.offers[side]);
    s.picked[side] = -1;
    return null;
  }
  if (cmd.t === "aim" && s.flow === "aim" && !s.aimLocked[side]) {
    if (typeof cmd.angle === "number" && Number.isFinite(cmd.angle)) s.aim[side] = cmd.angle;
    return null;
  }
  if (cmd.t === "lock" && s.flow === "aim") {
    s.aimLocked[side] = true;
    return null;
  }
  return null;
}

export function advanceSession(s: Session, dt: number, spend?: (n: number) => boolean): void {
  if (s.flow === "end") return;
  const scaled = s.flow === "fight" ? dt * s.timeScale : dt;
  if (s.flow === "intro") {
    s.timer -= dt;
    if (s.timer <= 0) startPick(s);
    return;
  }
  if (s.flow === "pick" || s.flow === "aim") {
    s.timer -= dt;
    botAct(s, 0, dt);
    botAct(s, 1, dt);
    if (s.timer <= 0) {
      autoHuman(s, 0);
      autoHuman(s, 1);
      botAct(s, 0, 10);
      botAct(s, 1, 10);
    }
    if (s.flow === "pick" && s.confirmed[0] && s.confirmed[1]) {
      s.flow = "aim";
      s.timer = s.cfg.aimSeconds;
      s.acted = [false, false];
      s.think = [s.control[0] === "bot" ? thinkTime(s) : 999, s.control[1] === "bot" ? thinkTime(s) : 999];
      s.aim = [Math.PI / 2, -Math.PI / 2];
      s.aimLocked = [false, false];
    } else if (s.flow === "aim" && s.aimLocked[0] && s.aimLocked[1]) {
      s.flow = "countdown";
      s.timer = s.fast ? 0.05 : s.cfg.countdown;
    }
    return;
  }
  if (s.flow === "countdown") {
    s.timer -= dt;
    if (s.timer <= 0) beginFight(s);
    return;
  }
  if (s.flow === "fight" && s.fight) {
    const step = 1 / s.cfg.simHz;
    const cap = s.fast ? 240 : Math.max(s.cfg.maxCatchup, Math.ceil(s.timeScale * 4));
    s.acc += scaled;
    let n = 0;
    while (s.acc >= step && n < cap && !s.fight.over) {
      stepFight(s.fight);
      s.acc -= step;
      n++;
    }
    if (s.acc > step * 4) s.acc = 0;
    const low = Math.min(s.fight.hp[0] / s.fight.maxHp[0], s.fight.hp[1] / s.fight.maxHp[1]);
    s.timeScale = !s.fast && low < 0.18 && low > 0 ? 0.45 : s.fast ? 8 : 1;
    s.sudden = s.fight.sudden;
    if (s.fight.over) endRound(s);
    return;
  }
  if (s.flow === "round") {
    s.timer -= dt;
    if (s.timer <= 0) {
      if (s.matchWinner !== -1) finishMatch(s);
      else {
        s.round += 1;
        startPick(s);
      }
    }
  }
  void spend;
  void ensureBot;
}

export function publicView(s: Session): PublicView {
  const me = s.viewSide;
  const opp: 0 | 1 = me === 0 ? 1 : 0;
  const reveal = s.flow === "countdown" || s.flow === "fight" || s.flow === "round" || s.flow === "end";
  let hp: [number, number] = [1, 1];
  let maxHp: [number, number] = [1, 1];
  if (s.fight) {
    hp = [s.fight.hp[0], s.fight.hp[1]];
    maxHp = [s.fight.maxHp[0], s.fight.maxHp[1]];
  }
  return {
    flow: s.flow,
    round: s.round,
    hearts: [s.hearts[0], s.hearts[1]],
    timer: s.timer,
    offers: s.offers[me].slice(),
    picked: s.picked[me],
    confirmed: s.confirmed[me],
    oppStatus: s.confirmed[opp] || (s.flow !== "pick" && s.aimLocked[opp]) ? "locked" : "choosing",
    oppBall: reveal ? (s.offers[opp][s.picked[opp]] ?? null) : null,
    myAim: s.flow === "aim" ? s.aim[me] : null,
    aimLocked: s.aimLocked[me],
    oppAimLocked: s.aimLocked[opp],
    names: [s.names[0], s.names[1]],
    roundWinner: s.roundWinner,
    matchWinner: s.matchWinner,
    myBall: s.offers[me][s.picked[me]] ?? "",
    rerollCost: rerollCost(s, me),
    sudden: s.sudden,
    hp,
    maxHp,
  };
}

export function renderFrame(s: Session): RenderFrame {
  const me = s.viewSide;
  const arrow = s.flow === "aim" && !s.aimLocked[me] ? s.aim[me] : null;
  const ents: FrameEnt[] = [];
  const effects: FrameFx[] = [];
  const f = s.fight;
  if (f) {
    for (let i = 0; i < f.active.length; i++) {
      if (!f.active[i]) continue;
      ents.push({
        id: i,
        x: f.x[i],
        y: f.y[i],
        r: f.r[i],
        kind: f.kind[i],
        owner: f.owner[i],
        hp: f.hp[i],
        max: f.maxHp[i],
      });
    }
    // Consume only the most recent effects; the renderer de-duplicates by match/round/sequence.
    const start = Math.max(0, f.fxW - f.fxT.length);
    for (let sequence = start; sequence < f.fxW; sequence++) {
      const slot = sequence % f.fxT.length;
      const type = f.fxT[slot];
      if (!type) continue;
      effects.push({
        key: `${s.seed}:${s.round}:${sequence}`,
        type,
        x: f.fxX[slot],
        y: f.fxY[slot],
        x2: f.fxX2[slot],
        y2: f.fxY2[slot],
        magnitude: f.fxM[slot],
        owner: f.fxO[slot],
        color: f.fxColor[slot] ?? (f.fxO[slot] >= 0 && f.fxO[slot] <= 1 ? f.defs[f.fxO[slot] as 0 | 1]?.visual.accentColor ?? "#67e8f9" : "#67e8f9"),
        sound: f.fxSound[slot],
      });
    }
  }
  return { flow: s.flow, arrow, ents, effects, sudden: s.sudden, spawn: [0, s.cfg.spawnY] };
}

export function hiddenAim(s: Session): number {
  const opp: 0 | 1 = s.viewSide === 0 ? 1 : 0;
  return s.aim[opp];
}
