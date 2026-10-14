import { describe, expect, it } from "vitest";
import { playerMoveInput } from "../src/game/controls";

describe("free-roam movement direction", () => {
  it("moves forward away from the default camera with W/up", () => {
    expect(playerMoveInput(new Set(["w"]), { x: 0, y: 0 })).toEqual({ x: 0, z: -1 });
    expect(playerMoveInput(new Set(["arrowup"]), { x: 0, y: 0 })).toEqual({ x: 0, z: -1 });
  });

  it("moves backward toward the default camera with S/down", () => {
    expect(playerMoveInput(new Set(["s"]), { x: 0, y: 0 })).toEqual({ x: 0, z: 1 });
    expect(playerMoveInput(new Set(["arrowdown"]), { x: 0, y: 0 })).toEqual({ x: 0, z: 1 });
  });

  it("matches the touch joystick's screen-space vertical axis", () => {
    expect(playerMoveInput(new Set(), { x: 0, y: -1 })).toEqual({ x: 0, z: -1 });
    expect(playerMoveInput(new Set(), { x: 0, y: 1 })).toEqual({ x: 0, z: 1 });
  });

  it("keeps horizontal control independent", () => {
    expect(playerMoveInput(new Set(["d"]), { x: 0, y: 0 })).toEqual({ x: 1, z: 0 });
    expect(playerMoveInput(new Set(["a"]), { x: 0, y: 0 })).toEqual({ x: -1, z: 0 });
  });
});
