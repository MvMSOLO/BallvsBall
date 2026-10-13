import { loadPack } from "../tests/helpers";
import { createFight, runFight } from "../src/sim/engine";

const core = loadPack("core");
const reuse = createFight({
  seed: 1,
  a: core[0],
  b: core[1],
  dirAX: 0,
  dirAY: 1,
  dirBX: 0,
  dirBY: -1,
});
const t0 = performance.now();
let sim = 0;
let sudden = 0;
let oob = 0;
const N = 40;
for (let m = 0; m < N; m++) {
  const res = runFight(
    {
      seed: m * 97 + 3,
      a: core[m % 16],
      b: core[(m * 3) % 16],
      dirAX: Math.sin(m),
      dirAY: Math.cos(m * 0.7),
      dirBX: Math.cos(m),
      dirBY: Math.sin(m * 1.3),
    },
    reuse,
  );
  sim += res.time;
  if (res.sudden) sudden++;
  oob += res.oob;
}
const wall = (performance.now() - t0) / 1000;
console.log({ sim, wall, rate: sim / wall, avg: sim / N, sudden, oob });
