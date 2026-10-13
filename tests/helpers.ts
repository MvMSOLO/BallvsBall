import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BallDef } from "../src/sim/types";
import { validateBall, validatePackMeta } from "../src/packs/validator";

export function loadPack(id: string): BallDef[] {
  const root = join(process.cwd(), "packs", id);
  const meta = validatePackMeta(JSON.parse(readFileSync(join(root, "pack.json"), "utf8")));
  if (!meta.ok || !meta.pack) throw new Error(meta.issues.map((i) => i.message).join("; "));
  const dir = join(root, "balls");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const balls: BallDef[] = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const res = validateBall(raw, file);
    if (!res.ok || !res.ball) {
      throw new Error(file + " " + res.issues.filter((i) => i.level === "error").map((i) => i.path + ": " + i.message).join("; "));
    }
    balls.push(res.ball);
  }
  if (balls.length !== meta.pack.balls.length) {
    throw new Error(`${id} lists ${meta.pack.balls.length} but loaded ${balls.length}`);
  }
  return balls;
}
