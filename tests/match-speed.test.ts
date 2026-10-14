import { describe, expect, it } from "vitest";
import { createSession, voteMatchSpeed } from "../src/game/session";
import { loadPack } from "./helpers";

const core = loadPack("core");

function session(botOpponent: boolean) {
  const s = createSession({
    seed: 4545,
    pool0: [core[0]],
    pool1: [core[1]],
    names: ["Player", botOpponent ? "Bot" : "Player B"],
    diff: "normal",
    control: ["human", botOpponent ? "bot" : "human"],
  });
  s.flow = "fight";
  return s;
}

describe("mutual 2x match-speed approval", () => {
  it("automatically accepts a human vote when the opponent is a bot", () => {
    const s = session(true);
    expect(voteMatchSpeed(s, 0, true)).toBe(true);
    expect(s.matchSpeed).toBe(2);
    expect(s.speedVotes).toEqual([true, true]);
  });

  it("turns 2x off when the user withdraws the vote", () => {
    const s = session(true);
    voteMatchSpeed(s, 0, true);
    expect(voteMatchSpeed(s, 0, false)).toBe(false);
    expect(s.matchSpeed).toBe(1);
    expect(s.speedVotes).toEqual([false, false]);
  });

  it("requires an explicit vote from both human-controlled sides", () => {
    const s = session(false);
    expect(voteMatchSpeed(s, 0, true)).toBe(false);
    expect(s.matchSpeed).toBe(1);
    expect(voteMatchSpeed(s, 1, true)).toBe(true);
    expect(s.matchSpeed).toBe(2);
    expect(s.speedVotes).toEqual([true, true]);
  });

  it("rejects speed votes outside an active fight", () => {
    const s = session(true);
    s.flow = "aim";
    expect(voteMatchSpeed(s, 0, true)).toBe(false);
    expect(s.matchSpeed).toBe(1);
  });
});
