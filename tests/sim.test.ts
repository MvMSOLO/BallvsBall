import { describe, expect, it } from "vitest";
import { auditFight, createFight, hashFight, runFight, stepFight } from "../src/sim/engine";
import { validateBall } from "../src/packs/validator";
import { loadPack } from "./helpers";
import type { BallDef } from "../src/sim/types";

const core = loadPack("core");
const byId = new Map(core.map((b) => [b.id, b]));

function ball(id: string): BallDef {
  const b = byId.get(id);
  if (!b) throw new Error(id);
  return b;
}

describe("determinism", () => {
  it("repeats the same hash 10 times", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const res = runFight({
        seed: 42,
        a: ball("web_weaver"),
        b: ball("boom_pebble"),
        dirAX: 0.2,
        dirAY: 1,
        dirBX: -0.3,
        dirBY: -1,
      });
      hashes.add(res.hash + ":" + res.winner + ":" + res.ticks);
    }
    expect(hashes.size).toBe(1);
  });
});

describe("bounds and endings", () => {
  it("high speed cannot leave the arena", () => {
    const speedy = structuredClone(ball("jolt_mite"));
    speedy.stats.speed = 22;
    const f = createFight({
      seed: 7,
      a: speedy,
      b: ball("aegis_lump"),
      dirAX: 1,
      dirAY: 0.2,
      dirBX: -1,
      dirBY: -0.2,
    });
    f.vx[0] = 400;
    f.vy[0] = -400;
    stepFight(f);
    const audit = auditFight(f);
    expect(audit.inside).toBe(true);
    expect(audit.finite).toBe(true);
    expect(f.oob).toBe(0);
    expect(f.nans).toBe(0);
  });

  it("10 random fights stay inside and end by 90s", () => {
    const reuse = createFight({
      seed: 1,
      a: core[0],
      b: core[1],
      dirAX: 0,
      dirAY: 1,
      dirBX: 0,
      dirBY: -1,
    });
    for (let m = 0; m < 10; m++) {
      const a = core[m % core.length];
      const b = core[(m * 5 + 3) % core.length];
      const res = runFight(
        {
          seed: 1000 + m * 17,
          a,
          b,
          dirAX: Math.sin(m),
          dirAY: Math.cos(m),
          dirBX: Math.cos(m * 1.7),
          dirBY: -Math.sin(m * 1.3),
        },
        reuse,
      );
      expect(res.time).toBeLessThanOrEqual(90.02);
      expect(res.winner === 0 || res.winner === 1).toBe(true);
      expect(res.oob).toBe(0);
      expect(res.nans).toBe(0);
      expect(auditFight(reuse).inside).toBe(true);
      expect(auditFight(reuse).count).toBeLessThanOrEqual(128);
    }
  });
});

describe("validator", () => {
  it("rejects broken packs without throwing", () => {
    const bad = validateBall({ id: "Nope", rarity: "god", abilities: [{ trigger: "onExplode", actions: [{ type: "nuke" }] }] });
    expect(bad.ok).toBe(false);
    expect(bad.ball).toBeNull();
    expect(bad.issues.some((i) => i.level === "error")).toBe(true);
    const clamped = validateBall({
      id: "too_hot",
      name: { en: "Too Hot" },
      description: { en: "Over-tuned on purpose." },
      rarity: "common",
      tags: [],
      stats: { hp: 900, radius: 1, mass: 1, speed: 13, contactDamage: 8 },
      abilities: [{ trigger: "onTick", interval: 2, actions: [{ type: "damage", amount: 500 }] }],
      ai_hints: { bestAim: "any", role: "burst" },
    });
    expect(clamped.ok).toBe(true);
    expect(clamped.ball?.stats.hp).toBe(220);
    expect(clamped.issues.some((i) => i.message.includes("clamped"))).toBe(true);
  });
});

describe("perf", () => {
  it("headless sim is faster than 500x realtime", () => {
    const reuse = createFight({
      seed: 1,
      a: ball("aegis_lump"),
      b: ball("web_weaver"),
      dirAX: 0,
      dirAY: 1,
      dirBX: 0,
      dirBY: -1,
    });
    const t0 = performance.now();
    let sim = 0;
    for (let i = 0; i < 30; i++) {
      const res = runFight(
        {
          seed: 50 + i,
          a: core[i % core.length],
          b: core[(i + 7) % core.length],
          dirAX: 0.3,
          dirAY: 1,
          dirBX: -0.2,
          dirBY: -1,
        },
        reuse,
      );
      sim += res.time;
    }
    const wall = (performance.now() - t0) / 1000;
    const rate = sim / wall;
    expect(rate).toBeGreaterThan(500);
  });
});

describe("hash stability helper", () => {
  it("mid-fight hash matches a replay", () => {
    const input = {
      seed: 99,
      a: ball("halo_blades"),
      b: ball("magma_pocket"),
      dirAX: 0.4,
      dirAY: 0.9,
      dirBX: -0.4,
      dirBY: -0.9,
    };
    const a = createFight(input);
    const b = createFight(input);
    for (let i = 0; i < 240; i++) {
      stepFight(a);
      stepFight(b);
    }
    expect(hashFight(a)).toBe(hashFight(b));
    expect(a.oob).toBe(0);
    expect(a.nans).toBe(0);
  });
});
