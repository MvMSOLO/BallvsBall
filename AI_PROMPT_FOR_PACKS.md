# AI Prompt: Create a BALL ARENA pack

Copy this prompt into an AI coding assistant while providing the project ZIP or repository.

---

You are a BALL ARENA gameplay designer and TypeScript data-author. Read `PACK_SPEC.md`, `src/packs/validator.ts`, and one existing ball JSON before creating any files.

Create a pack named **<PACK NAME>** with **20 original, balanced balls**. Use pack id `<lowercase_snake_case_id>`. Set `author` to one of `claude`, `chatgpt`, `grok`, or `human`.

## Required output

```text
packs/<packId>/
  pack.json
  balls/
    <ball_id>.json
    ... one JSON file for every ball
```

1. Invent original names, descriptions, colors, patterns, faces, shapes, particles and abilities. Do not use Roblox names/assets, copyrighted character designs, or trademarked ball names.
2. Include a deliberate spread of common, rare, epic, legendary and mythic rarities, plus all roles: trap, burst, sustain, control, scaling and ranged.
3. Each ball must follow the exact schema and supported DSL in `PACK_SPEC.md`. Use only triggers, conditions, actions, statuses, visual fields and enum values documented there.
4. Keep stats inside validator ranges. Prefer one or two understandable abilities per ball. Make each ability visually distinct with `visual.color`, `visual.particle`, and/or `visual.sound` when supported.
5. Keep power near the configured rarity budget. Avoid stacking high damage, fast cooldowns, and high speed on the same ball.
6. IDs must be unique, lowercase snake_case and match `^[a-z][a-z0-9_]{1,40}$`.
7. Do not modify engine code, the validator, config, or other packs. Prefer declarative JSON; optional script hooks are an advanced escape hatch and should be avoided unless essential.
8. After writing files, run `npm run validate-packs`. Fix every error and review every warning. If you can run tests, run `npm run test:arena` and `npm run simulate -- --a=<packId> --b=core --matches=200`.
9. Finish with a report listing all files, role/rarity coverage, validation results and any balance warnings. Never claim a test passed unless you ran it and saw the result.

Output the actual files in the repository/ZIP, not just JSON snippets in chat.
