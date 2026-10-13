import { allPacks } from "../src/packs/registry";

let errors = 0;
let warnings = 0;
let checkedBalls = 0;

for (const pack of allPacks()) {
  const label = pack.meta?.id ?? "unknown-pack";
  const packIds = new Set<string>();

  for (const issue of pack.issues) {
    const line = `[${issue.level.toUpperCase()}] ${label}/${issue.path}: ${issue.message}`;
    if (issue.level === "error") {
      errors++;
      console.error(line);
    } else {
      warnings++;
      console.warn(line);
    }
  }

  for (const ball of pack.balls) {
    checkedBalls++;
    if (packIds.has(ball.id)) {
      errors++;
      console.error(`[ERROR] ${label}: duplicate ball id "${ball.id}"`);
    }
    packIds.add(ball.id);
  }

  for (const declaredId of pack.meta.balls) {
    if (!packIds.has(declaredId)) {
      errors++;
      console.error(`[ERROR] ${label}/pack.json: listed ball "${declaredId}" is missing or invalid`);
    }
  }

  if (pack.enabled && pack.balls.length === 0) {
    errors++;
    console.error(`[ERROR] ${label}: enabled pack contains no valid balls`);
  } else {
    console.log(`[${pack.issues.some((issue) => issue.level === "error") ? "CHECK" : "OK"}] ${label}: ${pack.balls.length}/${pack.meta.balls.length} balls`);
  }
}

console.log(`\nBall pack validation: ${allPacks().length} packs, ${checkedBalls} valid balls, ${warnings} warnings, ${errors} errors.`);
if (errors > 0) process.exitCode = 1;
