# BALL ARENA Pack Specification

This document describes the JSON contract currently normalized by `src/packs/validator.ts` and consumed by `src/sim/engine.ts`. Treat the validator as the executable source of truth: if this document and the validator disagree, update the document after confirming the code.

## 1. Folder layout

```text
packs/<packId>/pack.json
packs/<packId>/balls/<ballId>.json
```

The registry discovers JSON at build time using Vite's glob import. A built-in pack's metadata `enabled` flag must be true for its balls to be offered in normal play. The admin runtime import/export UI is a separate feature and must validate imported files before enabling them.

### pack.json

```json
{
  "id": "moon_garden",
  "name": "Moon Garden",
  "author": "human",
  "version": "1.0.0",
  "description": "A pack of unusual lunar duelists.",
  "enabled": true,
  "balls": ["moon_moth", "tidal_orb"]
}
```

- `id`: unique lowercase pack identifier.
- `name`, `version`, `description`: display metadata.
- `author`: `claude`, `chatgpt`, `grok`, or `human` for AI leaderboard compatibility.
- `enabled`: whether a built-in pack is active by default.
- `balls`: list of ball IDs included in the pack.

## 2. Ball JSON schema

```json
{
  "id": "moon_moth",
  "name": { "en": "Moon Moth", "uz": "Oy Kuyasi", "ru": "Лунная моль" },
  "description": {
    "en": "Leaves a short slowing field after a wall bounce.",
    "uz": "Devorga tekkanda qisqa sekinlashtiruvchi maydon qoldiradi.",
    "ru": "Оставляет замедляющее поле после отскока от стены."
  },
  "rarity": "rare",
  "tags": ["control", "wall"],
  "stats": { "hp": 110, "radius": 1.0, "mass": 1.0, "speed": 14, "contactDamage": 8 },
  "visual": {
    "baseColor": "#7c83fd",
    "accentColor": "#d8b4fe",
    "face": "sleepy",
    "pattern": "stars",
    "emissive": 0.25,
    "trail": { "color": "#d8b4fe", "length": 0.6 },
    "particles": "stars",
    "shape": "ringed"
  },
  "abilities": [
    {
      "trigger": "onWallHit",
      "cooldown": 1.2,
      "actions": [
        {
          "type": "spawnZone",
          "shape": "circle",
          "duration": 4,
          "damagePerSecond": 2,
          "slow": 0.2,
          "radius": 2,
          "visual": { "color": "#d8b4fe", "particle": "stars", "sound": "soft-ping" }
        }
      ]
    }
  ],
  "ai_hints": { "bestAim": "wall", "role": "control" }
}
```

### IDs, language and rarity

- Ball `id` must match `^[a-z][a-z0-9_]{1,40}$`; do not reuse an ID from another pack.
- `name.en` is required. `name.uz`, `name.ru` and translations of the description are recommended.
- `rarity`: `common`, `rare`, `epic`, `legendary`, `mythic`.
- `tags`: up to 8 short strings.
- `ai_hints.bestAim`: `wall`, `enemy`, `corner`, `center`, `any`.
- `ai_hints.role`: `trap`, `burst`, `sustain`, `control`, `scaling`, `ranged`.

### Validated stat ranges

| Field | Range | Meaning |
|---|---:|---|
| `stats.hp` | 60–220 | Ball health per round |
| `stats.radius` | 0.55–1.8 | Collision/render radius |
| `stats.mass` | 0.4–3.5 | Collision mass |
| `stats.speed` | 8–22 | Target movement speed |
| `stats.contactDamage` | 2–16 | Contact damage scale |

The validator clamps out-of-range numeric values and emits a warning. Required/non-numeric fields may also produce errors and invalidate the ball.

### Visual fields

- `baseColor`, `accentColor`, `trail.color`: six-digit hex, e.g. `#27c8ff`.
- `face`: `grin`, `angry`, `sleepy`, `cool`, `cute`, `robot`, `ghost`, `wink`, `focus`.
- `pattern`: `none`, `stripes`, `dots`, `checker`, `spiral`, `hex`, `stars`.
- `particles`: `sparks`, `smoke`, `bubbles`, `stars`, `leaves`, `embers`, `snow`, `none`.
- `shape`: `sphere`, `spiky`, `faceted`, `ringed`, `horned`.
- `emissive`: 0–1. `trail.length`: 0–1.5.
- Missing or invalid visual fields fall back to a safe generated look with warnings where implemented.

## 3. Ability DSL

An ability contains a trigger, optional timing/threshold properties, optional conditions, and one or more actions.

```json
{
  "trigger": "onTick",
  "interval": 2.5,
  "conditions": [{ "type": "hpBelow", "value": 50 }],
  "actions": [
    { "type": "heal", "amount": 8, "visual": { "color": "#42f5a7", "particle": "bubbles", "sound": "heal" } }
  ]
}
```

### Triggers

- `onSpawn`: once when the ball enters the fight.
- `onTick`: periodic effect; set `interval`.
- `onWallHit`: when the ball contacts an arena wall.
- `onBallHit`: on ball-to-ball contact.
- `onDamaged`: after taking damage.
- `onDealDamage`: after dealing damage.
- `onHpBelow`: threshold-based health event; set `percent`.
- `onTimer`: timed event; set `seconds`.
- `onKill`: when this ball secures a kill.
- `onRoundStart`: at the start of a round.

Optional `cooldown` is clamped to 0.05–40 seconds; `interval` to 0.15–30; `seconds` to 0.1–80; `percent` to 1–99. Not every trigger uses every timing field; choose the one that matches the trigger.

### Conditions

The current validator accepts condition objects with a `type` and numeric `value`. Supported names are:

- `hpBelow`, `hpAbove`: own health percentage threshold.
- `enemyDistanceBelow`, `enemyDistanceAbove`: distance threshold.
- `hitCountAtLeast`: minimum hit count.
- `chance`: probability threshold.
- `cooldownReady`: cooldown readiness check.

Use one or two conditions per ability and choose values that make the effect predictable. Conditions are normalized from JSON; runtime behavior is governed by the simulation engine.

### Actions and parameters

Every action can include an optional `visual` object:
`{ "color": "#rrggbb", "particle": "sparks", "sound": "short-id" }`.
Visual metadata is a hint for the effect system; use short stable sound IDs.

| Action `type` | Parameters | Intended behavior |
|---|---|---|
| `damage` | `amount`, optional `radius` | Deal damage |
| `heal` | `amount` | Restore health |
| `applyStatus` | `status`, `duration`, `magnitude` | Apply a status effect |
| `modifyStat` | `stat`, `mode`, `amount`, `duration` | Temporarily modify a stat |
| `knockback` | `force` | Push target away |
| `pull` | `force` | Pull target closer |
| `dash` | `distance` | Move rapidly in current direction |
| `teleport` | `mode` | Move to a safe destination |
| `grow` / `shrink` | `amount`, `duration` | Change size temporarily |
| `split` | `count`, `hpFraction` | Create smaller child entities |
| `spawnZone` | `shape`, `duration`, `damagePerSecond`, optional `slow`, `radius`, `length`, `follow` | Create a damaging/control zone |
| `spawnProjectile` | `pattern`, `damage`, `speed`, optional `radius`, `count`, `ttl` | Fire projectiles |
| `spawnTurret` | `hp`, `duration`, `projectileDamage`, `interval` | Deploy a turret |
| `spawnSummon` | `hp`, `speed`, `contactDamage`, `radius`, `duration`, optional `count` | Spawn an allied minion |
| `spawnOrbiter` | `count`, `radius`, `damage`, `orbit`, `duration` | Add orbiting hazards |
| `createBeam` | `damage`, optional `width` | Create a beam attack |
| `chainLightning` | `damage`, `jumps`, `range` | Chain damage across targets |
| `explode` | `radius`, `damage`, `knockback` | Area burst |
| `lifesteal` | `fraction` | Heal from damage dealt |
| `thorns` | `fraction`, `duration` | Reflect some damage |
| `reviveOnce` | `hpFraction` | Revive once with a health fraction |
| `randomChoice` | `actions` | Choose one nested action |
| `repeat` | `count`, `interval`, `actions` | Schedule repeated nested actions |
| `scaleWith` | `counter`, `per`, `bonus`, `actions` | Scale nested effect by a counter |

### Action enums

- Statuses: `poison`, `burn`, `freeze`, `stun`, `root`, `slow`, `haste`, `shield`, `regen`, `weaken`.
- `modifyStat.stat`: `speed`, `mass`, `radius`, `contactDamage`.
- `modifyStat.mode`: `add`, `mul`.
- `teleport.mode`: `center`, `behindEnemy`, `random`, `away`.
- `spawnZone.shape`: `line`, `circle`, `ring`, `web`, `field`.
- `spawnProjectile.pattern`: `straight`, `homing`, `bouncing`, `piercing`, `explosive`.
- `scaleWith.counter`: `hits`, `walls`, `time`, `hpLost`.

The validator limits an ability file to 6 abilities, 8 top-level actions per ability and action nesting depth 2. Individual action parameters are normalized/clamped in code. Always inspect warnings because clamping may change intended behavior.

## 4. Balance guidance

- Rarity budgets come from `CONFIG.powerBudget`; the validator calculates an approximate power score and warns when it falls outside the budget.
- Use 1–2 abilities per ball, modest cooldowns and readable counterplay.
- Avoid repeating a large damage action at a tiny interval.
- Don't combine high HP, high speed, high contact damage and frequent burst effects on one ball.
- Prefer effects that are legible in the 3D arena and make aim choices matter.
- Ball definitions must never rely on arbitrary network requests, DOM access or unseeded randomness.

## 5. Optional script hooks

The project has a script host for imported script source, but the safest and most portable pack format is declarative JSON. Script hooks are an advanced escape hatch; use only the restricted context exposed by `src/packs/scriptHost.ts`. Never assume browser globals, fetch, file access, or arbitrary Node APIs. Keep handlers bounded and rely on the host's exception/time safeguards. Test scripts independently; a JSON-only pack is preferred.

## 6. Six compact design examples

These are design patterns, not guaranteed balance recommendations. Match exact action parameter names to the table above and validate each file.

1. **Wall trap** — `onWallHit`, cooldown 1.2, spawn a short web zone with low DPS and a mild slow.
2. **Sustain** — `onTick`, interval 3, heal a small amount only when `hpBelow` is met.
3. **Burst** — `onBallHit`, cooldown 2, explode with small radius and moderate damage.
4. **Control** — `onDealDamage`, cooldown 4, apply `slow` for a short duration.
5. **Scaling** — `onTick`, interval 5, modify speed briefly; avoid indefinite stat stacking.
6. **Ranged** — `onTick`, interval 2.5, spawn a straight projectile with limited speed, damage and lifetime.

## 7. Validation workflow

```bash
npm run validate-packs
npm run test:arena
npm run simulate -- --a=core --b=core --matches=200
```

Invalid balls should be skipped and reported with file/field context. Do not call a pack release-ready until validation, simulation bounds checks, deterministic tests and a mobile browser smoke test have actually run.
