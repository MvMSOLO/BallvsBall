# BALL ARENA

BALL ARENA is an original, mobile-first 3D physics ball-duel game. It uses Three.js for rendering and a deterministic fixed-step simulation for the duel logic. All core game art is generated procedurally; no Roblox assets or external image/audio CDNs are required.

## Run locally

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Vite serves the app on `http://localhost:8080`.

Production build:

```bash
npm run build
npm run preview
```

The production build uses TanStack Start + Nitro for its server output, so deploy it to a compatible server/adapter rather than assuming `dist/` is a completely static export. The current Vercel configuration uses Nitro's Vercel preset. The app can later be wrapped with Capacitor; the Android WebView wrapper in `android-app/` requires a deployed HTTPS URL.

## Controls

- Lobby: WASD or arrow keys to walk around.
- Quick Play: start a local 1v1 against a bot.
- Pick phase: choose one of the three offered balls, confirm, or reroll.
- Aim phase: set an angle using the aim slider and press **Lock Aim**.
- Fight: fully automatic; the simulation decides the result.
- Graphics button: cycle Low / Medium / High.

## Architecture

```text
src/
  sim/       deterministic fixed-step physics, entities, abilities and seeded RNG
  render/    Three.js world; reads session/render frames and draws the 3D scene
  game/      match state machine and the public/private player views
  packs/     pack registry, schema validator and restricted script host
  bots/      bot names and supporting bot data
  economy/   versioned local save data, progression and cosmetic definitions
  audio/     procedural WebAudio synthesis
  i18n/      English / Uzbek / Russian text
  routes/    TanStack Start route entry points and DOM game HUD
packs/
  core/      16 original starter balls
  _template/ example pack with three sample ball definitions
tests/       simulation tests
scripts/     pack validation and headless simulation CLIs
server/      Nitro middleware used by the deploy/PWA setup
android-app/ Android WebView shell and manual GitHub Actions APK workflow
```

The simulation modules should not import Three.js or browser DOM APIs. The renderer receives a `RenderFrame` and `DrawState`; UI commands go through `applyCommand`. Before the fight begins, `publicView` intentionally does not expose the opponent's ball or aim.

## Packs

- Built-in pack metadata: `packs/<packId>/pack.json`
- One ball per JSON file: `packs/<packId>/balls/<ballId>.json`
- Schema and action limits: [PACK_SPEC.md](./PACK_SPEC.md)
- AI authoring prompt: [AI_PROMPT_FOR_PACKS.md](./AI_PROMPT_FOR_PACKS.md)

Commands:

```bash
npm run validate-packs
npm run simulate -- --a=core --b=core --matches=200
npm run test:arena
npm run typecheck
```

The scripts and tests are included in the repository; run them in the target Node environment before claiming release readiness.

## PWA and Android

The PWA helpers live under `scripts/grok-pwa-*`, `public/__grok/`, and `server/`. Keep those files intact because the Vite/Nitro setup wires them into the deployed app.

The Android workflow is at [Android APK workflow](./.github/workflows/android-apk.yml). After a successful HTTPS deployment, open GitHub Actions → **Android APK** → **Run workflow**, paste the deployed URL into `app_url`, then download the `BallvsBall-Android-APK` artifact. This APK is a WebView shell that loads the deployed game; it is not an offline-bundled native engine.

## Known limitations

The game is currently a local bot duel, not online multiplayer. The command interface is designed so a WebSocket transport can be added later. The Android wrapper depends on a working public deployment. Performance, determinism, pack validation and out-of-bounds guarantees must be verified by running the automated gates in the target environment; no unrun test is represented here as passing.
