import type { BallDef } from "./types";
import { createFight, runFight, type Fight, type FightResult } from "./engine";
import { rngNext } from "./rng";

export interface PairStat {
  a: string;
  b: string;
  games: number;
  winsA: number;
  winsB: number;
  sudden: number;
  oob: number;
  nans: number;
  errors: number;
  time: number;
  dmgA: number;
  dmgB: number;
}

export interface BatchReport {
  pairs: PairStat[];
  byBall: Record<string, { games: number; wins: number; elo: number; dmg: number }>;
  oob: number;
  nans: number;
  errors: number;
  suddenRate: number;
  avgTime: number;
  games: number;
}

function emptyPair(a: string, b: string): PairStat {
  return { a, b, games: 0, winsA: 0, winsB: 0, sudden: 0, oob: 0, nans: 0, errors: 0, time: 0, dmgA: 0, dmgB: 0 };
}

function note(map: BatchReport["byBall"], id: string, win: boolean, dmg: number): void {
  const row = map[id] ?? { games: 0, wins: 0, elo: 1000, dmg: 0 };
  row.games++;
  if (win) row.wins++;
  row.dmg += dmg;
  map[id] = row;
}

function elo(map: BatchReport["byBall"], a: string, b: string, scoreA: number): void {
  const ra = map[a].elo;
  const rb = map[b].elo;
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const eb = 1 - ea;
  map[a].elo = ra + 20 * (scoreA - ea);
  map[b].elo = rb + 20 * (1 - scoreA - eb);
}

export function runBatch(
  ballsA: BallDef[],
  ballsB: BallDef[],
  matches: number,
  seed: number,
  onProgress?: (done: number, total: number) => void,
): BatchReport {
  const pairs = new Map<string, PairStat>();
  const byBall: BatchReport["byBall"] = {};
  const total = Math.max(1, matches);
  let reuse: Fight | undefined;
  const rng = { s: seed || 1 };
  let oob = 0;
  let nans = 0;
  let errors = 0;
  let sudden = 0;
  let time = 0;
  for (let i = 0; i < total; i++) {
    const swap = i % 2 === 1;
    const ba = ballsA[Math.floor(rngNext(rng) * ballsA.length) % ballsA.length];
    const bb = ballsB[Math.floor(rngNext(rng) * ballsB.length) % ballsB.length];
    const left = swap ? bb : ba;
    const right = swap ? ba : bb;
    const angA = rngNext(rng) * Math.PI * 2;
    const angB = rngNext(rng) * Math.PI * 2;
    const res: FightResult = runFight(
      {
        seed: (seed + i * 17 + 3) | 0,
        a: left,
        b: right,
        dirAX: Math.cos(angA),
        dirAY: Math.sin(angA),
        dirBX: Math.cos(angB),
        dirBY: Math.sin(angB),
      },
      reuse,
    );
    reuse = reuse ?? undefined;
    // Keep one fight object by recreating only the first time via runFight's reuse.
    if (!reuse) {
      reuse = createFight({
        seed: 1,
        a: left,
        b: right,
        dirAX: 1,
        dirAY: 0,
        dirBX: -1,
        dirBY: 0,
      });
    }
    const key = `${ba.id}>${bb.id}`;
    const pair = pairs.get(key) ?? emptyPair(ba.id, bb.id);
    pair.games++;
    const leftIsA = !swap;
    const aWon = leftIsA ? res.winner === 0 : res.winner === 1;
    if (aWon) pair.winsA++;
    else pair.winsB++;
    if (res.sudden) {
      pair.sudden++;
      sudden++;
    }
    pair.oob += res.oob;
    pair.nans += res.nans;
    pair.errors += res.errors.length;
    pair.time += res.time;
    pair.dmgA += leftIsA ? res.dmgA : res.dmgB;
    pair.dmgB += leftIsA ? res.dmgB : res.dmgA;
    pairs.set(key, pair);
    oob += res.oob;
    nans += res.nans;
    errors += res.errors.length;
    time += res.time;
    note(byBall, ba.id, aWon, leftIsA ? res.dmgA : res.dmgB);
    note(byBall, bb.id, !aWon, leftIsA ? res.dmgB : res.dmgA);
    elo(byBall, ba.id, bb.id, aWon ? 1 : 0);
    if (onProgress && i % 5 === 0) onProgress(i + 1, total);
  }
  if (onProgress) onProgress(total, total);
  return {
    pairs: [...pairs.values()],
    byBall,
    oob,
    nans,
    errors,
    suddenRate: sudden / total,
    avgTime: time / total,
    games: total,
  };
}
