/** mulberry32. State is a uint32 updated in place so fights stay replayable. */

export function rngNext(state: { s: number }): number {
  let a = state.s | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.s = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function seedOf(n: number): number {
  const s = n | 0;
  return s === 0 ? 1 : s;
}
