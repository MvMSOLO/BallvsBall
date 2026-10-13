import type { BallDef } from "../sim/types";
import { compileScript, } from "./scriptHost";
import type { ScriptHooks } from "../sim/types";
import { validateBall, validatePackMeta, type Issue, type PackFile } from "./validator";

export interface RuntimePack {
  meta: PackFile;
  balls: BallDef[];
  issues: Issue[];
  source: "builtin" | "import";
  enabled: boolean;
}

const jsonMods = import.meta.glob("../../packs/**/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

const packs = new Map<string, RuntimePack>();
const scripts = new Map<string, ScriptHooks>();

function ingest(id: string, metaRaw: unknown, ballRaws: { file: string; raw: unknown; script?: string }[], source: RuntimePack["source"]): RuntimePack {
  const metaRes = validatePackMeta(metaRaw);
  const issues: Issue[] = [...metaRes.issues];
  const balls: BallDef[] = [];
  for (const item of ballRaws) {
    const res = validateBall(item.raw, item.file);
    issues.push(...res.issues.map((issue) => ({ ...issue, path: `${item.file} ${issue.path}` })));
    if (res.ok && res.ball) {
      if (item.script) res.ball.script = item.script;
      balls.push(res.ball);
      if (res.ball.script) {
        try {
          scripts.set(res.ball.id, compileScript(res.ball.script));
        } catch (err) {
          issues.push({
            level: "error",
            path: item.file,
            message: "script failed to compile: " + (err instanceof Error ? err.message : "error"),
          });
        }
      }
    }
  }
  const meta = metaRes.pack ?? {
    id,
    name: id,
    author: "human",
    version: "0.0.0",
    description: "",
    enabled: false,
    balls: balls.map((b) => b.id),
  };
  const pack: RuntimePack = { meta, balls, issues, source, enabled: meta.enabled && metaRes.ok };
  packs.set(meta.id, pack);
  return pack;
}

function loadBuiltin(): void {
  const grouped = new Map<string, { meta?: unknown; balls: { file: string; raw: unknown }[] }>();
  for (const [path, raw] of Object.entries(jsonMods)) {
    const parts = path.split("/");
    const packIdx = parts.findIndex((p) => p === "packs");
    const packId = parts[packIdx + 1];
    if (!packId) continue;
    const slot = grouped.get(packId) ?? { balls: [] };
    if (path.endsWith("pack.json")) slot.meta = raw;
    else if (path.includes("/balls/")) slot.balls.push({ file: parts[parts.length - 1] ?? path, raw });
    grouped.set(packId, slot);
  }
  for (const [id, group] of grouped) {
    ingest(id, group.meta, group.balls, "builtin");
  }
}

loadBuiltin();

export function allPacks(): RuntimePack[] {
  return [...packs.values()];
}

export function setPackEnabled(id: string, on: boolean): void {
  const pack = packs.get(id);
  if (pack) pack.enabled = on;
}

export function getBall(id: string): BallDef | undefined {
  for (const pack of packs.values()) {
    if (!pack.enabled) continue;
    const found = pack.balls.find((b) => b.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getBallAnywhere(id: string): BallDef | undefined {
  for (const pack of packs.values()) {
    const found = pack.balls.find((b) => b.id === id);
    if (found) return found;
  }
  return undefined;
}

export function enabledBalls(): BallDef[] {
  const out: BallDef[] = [];
  for (const pack of packs.values()) if (pack.enabled) out.push(...pack.balls);
  return out;
}

export function scriptFor(id: string): ScriptHooks | null {
  return scripts.get(id) ?? null;
}

export function addImportedPack(metaRaw: unknown, ballRaws: { file: string; raw: unknown; script?: string }[]): RuntimePack {
  const id = typeof (metaRaw as { id?: string }).id === "string" ? (metaRaw as { id: string }).id : "import";
  return ingest(id, metaRaw, ballRaws, "import");
}

export function removePack(id: string): void {
  const pack = packs.get(id);
  if (pack?.source === "import") packs.delete(id);
}

export const AI_PACK_PROMPT = `Read PACK_SPEC.md in this project and create a pack called <NAME> with 20 original balls.
Invent names, abilities and visuals yourself. Ensure a mix of roles (trap, burst, sustain, control, scaling, ranged) and rarities (common through mythic).
Output files in this structure:
/packs/<packId>/pack.json
/packs/<packId>/balls/<ballId>.json
author must be one of: claude, chatgpt, grok, human.
Do not modify the engine. Every ball must pass the validator in src/packs/validator.ts.
No trademarked names. No unbounded damage. Prefer the declarative ability DSL; add a .js script only if the DSL cannot express the idea.`;
