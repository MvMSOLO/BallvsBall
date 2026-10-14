/** World-space movement mapping for the free-roam character. The camera starts behind +Z. */
export interface TouchMoveInput {
  x: number;
  y: number;
}

/**
 * W/up means move away from the default +Z-facing camera; S/down means walk back.
 * Joystick coordinates are screen-space, so an upward gesture has a negative y.
 */
export function playerMoveInput(keys: ReadonlySet<string>, touch: TouchMoveInput): { x: number; z: number } {
  const x = Number(keys.has("d") || keys.has("arrowright")) -
    Number(keys.has("a") || keys.has("arrowleft")) + touch.x;
  const z = Number(keys.has("s") || keys.has("arrowdown")) -
    Number(keys.has("w") || keys.has("arrowup")) + touch.y;
  return { x, z };
}
