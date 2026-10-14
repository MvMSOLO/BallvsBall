import { describe, expect, it } from "vitest";
import { createFight, runFight } from "../src/sim/engine";
import { createSession, renderFrame } from "../src/game/session";
import { loadPack } from "./helpers";

const singularity = loadPack("chatgpt_singularity_pack");
const core = loadPack("core");

describe("ChatGPT Singularity Riftborn pack", () => {
  it("simulates 200 matchups against core without runtime or arena-boundary faults", () => {
    const reuse = createFight({
      seed: 20261014,
      a: singularity[0],
      b: core[0],
      dirAX: 1,
      dirAY: 0,
      dirBX: -1,
      dirBY: 0,
    });

    let completed = 0;
    for (let i = 0; i < 200; i++) {
      const packBall = singularity[i % singularity.length];
      const coreBall = core[(i * 7 + 3) % core.length];
      const swapped = i % 2 === 1;
      const a = swapped ? coreBall : packBall;
      const b = swapped ? packBall : coreBall;
      const angleA = i * 0.371;
      const angleB = i * 0.619 + 1.2;
      const result = runFight(
        {
          seed: 20261014 + i * 17,
          a,
          b,
          dirAX: Math.cos(angleA),
          dirAY: Math.sin(angleA),
          dirBX: Math.cos(angleB),
          dirBY: Math.sin(angleB),
        },
        reuse,
      );

      expect(result.winner === 0 || result.winner === 1, `match ${i + 1} did not produce a winner`).toBe(true);
      expect(result.time, `match ${i + 1} exceeded the round cap`).toBeLessThanOrEqual(90.02);
      expect(result.oob, `match ${i + 1} had out-of-bounds events`).toBe(0);
      expect(result.nans, `match ${i + 1} had non-finite simulation values`).toBe(0);
      expect(result.errors, `match ${i + 1} had ability/runtime errors`).toEqual([]);
      completed++;
    }
    expect(completed).toBe(200);
  });

  it("renders Crown of Zero's colored signature ability chain through the combat VFX events", () => {
    const source = singularity.find((ball) => ball.id === "chatgpt_crown_of_zero");
    expect(source).toBeDefined();
    expect(source?.rarity).toBe("mythic");
    expect(singularity.filter((ball) => ball.rarity === "mythic")).toHaveLength(1);

    const crown = structuredClone(source!);
    const signature = crown.abilities.find((ability) => ability.trigger === "onTimer");
    expect(signature?.seconds).toBe(6);
    expect(signature?.actions.map((action) => action.type)).toEqual(["spawnZone", "pull", "explode"]);

    // Trigger the exact authored action sequence at round start for a deterministic VFX smoke test.
    signature!.trigger = "onRoundStart";
    const seed = 8182026;
    const fight = createFight({
      seed,
      a: crown,
      b: core[0],
      dirAX: 0.4,
      dirAY: 0.9,
      dirBX: -0.4,
      dirBY: -0.9,
    });
    const session = createSession({
      seed,
      pool0: [crown],
      pool1: [core[0]],
      names: ["Crown of Zero", "Core Test"],
      diff: "normal",
      control: ["human", "bot"],
    });
    session.flow = "fight";
    session.fight = fight;
    const frame = renderFrame(session);

    expect(frame.effects.some((fx) => fx.type === 12 && fx.color.toLowerCase() === "#f5c7ff")).toBe(true);
    expect(frame.effects.some((fx) => fx.type === 8 && fx.color.toLowerCase() === "#9d4edd")).toBe(true);
    expect(frame.effects.some((fx) => fx.type === 15 && fx.color.toLowerCase() === "#cb73ff")).toBe(true);
    expect(frame.effects.some((fx) => fx.type === 3)).toBe(true);
    expect(fight.errors).toEqual([]);
  });
});
