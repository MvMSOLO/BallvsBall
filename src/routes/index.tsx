import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { BallDef, Action } from "../sim/types";
import { CONFIG, type Difficulty } from "../config";
import { World, type DrawState } from "../render/world";
import { advanceSession, applyCommand, createSession, publicView, renderFrame, type Session } from "../game/session";
import { enabledBalls } from "../packs/registry";
import { loadSave, writeSave } from "../economy/save";
import { sfx, setMuted, unlockAudio } from "../audio/synth";

export const Route = createFileRoute("/")({ component: BallArenaPage });

type UiView = ReturnType<typeof publicView> | null;

function abilityTriggerLabel(trigger: string, interval?: number): string {
  if (trigger === "onBallHit") return "ON HIT";
  if (trigger === "onWallHit") return "WALL BOUNCE";
  if (trigger === "onDamaged") return "WHEN HIT";
  if (trigger === "onSpawn") return "SPAWN BURST";
  if (trigger === "onRoundStart") return "ROUND START";
  if (trigger === "onHpBelow") return "LOW HP";
  if (trigger === "onKill") return "FINISHER";
  if (trigger === "onDealDamage") return "DEAL DAMAGE";
  if (trigger === "onTimer") return "TIMED SKILL";
  if (trigger === "onTick") return "PASSIVE · " + (interval ?? 1).toFixed(1) + "s";
  return trigger.replace(/([A-Z])/g, " $1").toUpperCase();
}

function actionLabel(action: Action): string {
  switch (action.type) {
    case "damage": return "BURST";
    case "heal": return "REGEN";
    case "applyStatus": return action.status.toUpperCase();
    case "modifyStat": return action.stat.toUpperCase() + (action.mode === "mul" ? " BOOST" : " SHIFT");
    case "knockback": return "KNOCKBACK";
    case "pull": return "GRAVITY PULL";
    case "dash": return "DASH";
    case "teleport": return "PHASE " + action.mode.toUpperCase();
    case "grow": return "OVERGROW";
    case "shrink": return "SHRINK";
    case "split": return "SPLIT";
    case "spawnZone": return action.shape.toUpperCase() + " ZONE";
    case "spawnProjectile": return action.pattern.toUpperCase() + " SHOT";
    case "spawnTurret": return "TURRET";
    case "spawnSummon": return "SUMMON";
    case "spawnOrbiter": return "ORBITERS";
    case "createBeam": return "ENERGY BEAM";
    case "chainLightning": return "CHAIN LIGHTNING";
    case "explode": return "EXPLOSION";
    case "lifesteal": return "LIFESTEAL";
    case "thorns": return "THORNS";
    case "reviveOnce": return "SECOND CHANCE";
    case "randomChoice": return "RANDOM CHAOS";
    case "repeat": return "COMBO";
    case "scaleWith": return "SCALING POWER";
  }
}

function abilityGlyph(action?: Action): string {
  if (!action) return "◎";
  switch (action.type) {
    case "damage": return "✦";
    case "heal": return "✚";
    case "applyStatus": return action.status === "shield" ? "⛨" : "✧";
    case "modifyStat": return "↗";
    case "knockback": return "↯";
    case "pull": return "⟲";
    case "dash": return "➤";
    case "teleport": return "⌁";
    case "grow": return "⤢";
    case "shrink": return "⤡";
    case "split": return "✣";
    case "spawnZone": return action.shape === "web" ? "✳" : action.shape === "ring" ? "◎" : "▱";
    case "spawnProjectile": return action.pattern === "homing" ? "➶" : "➤";
    case "spawnTurret": return "⌖";
    case "spawnSummon": return "✧";
    case "spawnOrbiter": return "⟳";
    case "createBeam": return "ϟ";
    case "chainLightning": return "ϟ";
    case "explode": return "✹";
    case "lifesteal": return "♥";
    case "thorns": return "✥";
    case "reviveOnce": return "↻";
    case "randomChoice": return "⁕";
    case "repeat": return "⟲";
    case "scaleWith": return "⇧";
  }
  return "✧";
}

function ballGlyph(id: string): string {
  if (id.includes("die") || id.includes("lucky")) return "⚄";
  if (id.includes("glass") || id.includes("prism")) return "◆";
  if (id.includes("magma") || id.includes("boom")) return "✹";
  if (id.includes("coil") || id.includes("jolt")) return "ϟ";
  if (id.includes("ribbon")) return "〰";
  if (id.includes("sprout")) return "✿";
  if (id.includes("hook") || id.includes("knife")) return "➤";
  if (id.includes("halo") || id.includes("aegis")) return "◉";
  if (id.includes("swarm")) return "✣";
  if (id.includes("web")) return "✳";
  if (id.includes("serpent")) return "≈";
  if (id.includes("hail")) return "❖";
  return "⬡";
}

const RIVALS = [
  { name: "NovaByte", x: -7, z: 4, yaw: 0.4, moving: true, shirt: "#5b8cff", emote: "" },
  { name: "PixelFox", x: 7, z: 4, yaw: -0.4, moving: false, shirt: "#3ecf8e", emote: "wave" },
  { name: "OrbitJay", x: -8, z: -2, yaw: 1, moving: false, shirt: "#f5b942", emote: "" },
  { name: "MangoRush", x: 8, z: -2, yaw: -1, moving: true, shirt: "#ff5a36", emote: "" },
  { name: "ZedSpark", x: 0, z: 10, yaw: 3, moving: false, shirt: "#1c2430", emote: "" },
] as const;

export type ArenaRouteMode = "free-roam" | "duel" | "admin";

export function BallArenaPage({ mode = "free-roam" }: { mode?: ArenaRouteMode } = {}) {
  const adminMode = mode === "admin";
  const availableBalls = useMemo(() => enabledBalls(), []);
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const lastFrameRef = useRef(0);
  const lastUiRef = useRef(0);
  const stepAudioRef = useRef(0);
  const smoothedMoveRef = useRef({ x: 0, z: 0 });
  const facingRef = useRef(0);
  const playedFxKeysRef = useRef<{ keys: Set<string>; queue: string[] }>({ keys: new Set(), queue: [] });
  const previousHpRef = useRef<[number, number] | null>(null);
  const [view, setView] = useState<UiView>(null);
  const [coins, setCoins] = useState(CONFIG.starterCoins);
  const [audioMuted, setAudioMuted] = useState(false);
  const [diamonds, setDiamonds] = useState(CONFIG.starterDiamonds);
  const [aim, setAim] = useState(90);
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const playerPosRef = useRef({ x: 0, z: 0 });
  const touchMoveRef = useRef({ x: 0, y: 0 });
  const stickPointerRef = useRef<number | null>(null);
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });
  const [nearbyRival, setNearbyRival] = useState<number | null>(null);
  const nearbyRivalRef = useRef<number | null>(null);
  const [opponentName, setOpponentName] = useState("NovaByte");
  const [adminBallA, setAdminBallA] = useState("chatgpt_ember_ledger");
  const [adminBallB, setAdminBallB] = useState("chatgpt_void_covenant");
  const [adminDifficulty, setAdminDifficulty] = useState<Difficulty>("hard");
  const [adminAimA, setAdminAimA] = useState(90);
  const [adminAimB, setAdminAimB] = useState(270);
  const [adminPaused, setAdminPaused] = useState(false);
  const adminPausedRef = useRef(false);
  adminPausedRef.current = adminPaused;
  const directBootRef = useRef(false);
  const diamondsRef = useRef(diamonds);
  diamondsRef.current = diamonds;
  const rewardedSessionRef = useRef<Session | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const ballMapRef = useRef<Map<string, BallDef>>(new Map());

  const requestLandscape = useCallback(() => {
    const enterFullscreenAndLock = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Fullscreen is optional; the on-screen rotate prompt handles browsers that deny it.
      }
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: "landscape") => Promise<void>;
        };
        await orientation.lock?.("landscape");
      } catch {
        // Not all mobile browsers allow orientation locking from a web page.
      }
    };
    void enterFullscreenAndLock();
  }, []);

  const startMatch = useCallback((rival: string) => {
    unlockAudio();
    sfx("lock");
    const all = enabledBalls();
    const byId = new Map(all.map((b) => [b.id, b]));
    ballMapRef.current = byId;
    const starter = CONFIG.starterBalls.map((id) => byId.get(id)).filter((b): b is BallDef => Boolean(b));
    const pool = starter.length >= 3 ? starter : all;
    if (pool.length < 2) {
      setNotice("No valid balls were loaded. Check the core pack.");
      return;
    }
    requestLandscape();
    const stored = loadSave();
    if (stored && typeof stored.coins === "number") setCoins(stored.coins);
    if (stored && typeof stored.diamonds === "number") {
      setDiamonds(stored.diamonds);
      diamondsRef.current = stored.diamonds;
    }
    setOpponentName(rival);
    nearbyRivalRef.current = null;
    setNearbyRival(null);
    sessionRef.current = createSession({
      seed: Math.floor(Math.random() * 2_000_000_000),
      pool0: pool,
      pool1: all.length >= 3 ? all : pool,
      names: ["You", rival],
      diff: "normal",
      control: ["human", "bot"],
    });
    setView(publicView(sessionRef.current));
    setNotice("Challenge accepted · " + rival);
  }, [requestLandscape]);

  useEffect(() => {
    if (mode !== "duel" || directBootRef.current) return;
    directBootRef.current = true;
    startMatch("NovaByte");
  }, [mode, startMatch]);

  const send = useCallback((cmd: Parameters<typeof applyCommand>[1]) => {
    if (cmd.t !== "aim") sfx("click");
    const s = sessionRef.current;
    if (!s) return;
    const err = applyCommand(s, cmd, (cost) => {
      if (diamonds < cost) return false;
      setDiamonds((d) => d - cost);
      return true;
    });
    if (err === "diamonds") setNotice("Not enough diamonds for that reroll.");
    else if (err) setNotice(err);
    else setNotice("");
    setView(publicView(s));
  }, [diamonds]);

  const startAdminDuel = useCallback(() => {
    const all = enabledBalls();
    const byId = new Map(all.map((ball) => [ball.id, ball]));
    ballMapRef.current = byId;
    const a = byId.get(adminBallA) ?? all[0];
    const b = byId.get(adminBallB) ?? all.find((ball) => ball.id !== a?.id) ?? all[1];
    if (!a || !b) {
      setNotice("No valid ball definitions are loaded.");
      return;
    }
    const s = createSession({
      seed: Math.floor(Math.random() * 2_000_000_000),
      pool0: [a],
      pool1: [b],
      names: [a.name.en, b.name.en],
      diff: adminDifficulty,
      control: ["human", "human"],
      aimStyle: ["manual", "manual"],
      viewSide: 0,
    });
    // Admin route intentionally skips drafting: these two selections are the fixed matchup.
    s.flow = "aim";
    s.timer = CONFIG.aimSeconds;
    s.offers = [[a.id], [b.id]];
    s.picked = [0, 0];
    s.confirmed = [true, true];
    s.aim = [adminAimA * Math.PI / 180, adminAimB * Math.PI / 180];
    s.aimLocked = [false, false];
    s.ballName = [a.name.en, b.name.en];
    sessionRef.current = s;
    rewardedSessionRef.current = null;
    previousHpRef.current = null;
    setOpponentName(b.name.en);
    setAdminPaused(false);
    setView(publicView(s));
    setNotice("Admin duel ready · set both launch angles.");
    requestLandscape();
  }, [adminBallA, adminBallB, adminDifficulty, adminAimA, adminAimB, requestLandscape]);

  const updateAdminAim = useCallback((side: 0 | 1, angle: number) => {
    if (side === 0) setAdminAimA(angle);
    else setAdminAimB(angle);
    const s = sessionRef.current;
    if (s && s.flow === "aim" && !s.aimLocked[side]) s.aim[side] = angle * Math.PI / 180;
  }, []);

  const lockAdminLaunch = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.flow !== "aim") return;
    s.aim[0] = adminAimA * Math.PI / 180;
    s.aim[1] = adminAimB * Math.PI / 180;
    s.aimLocked = [true, true];
    advanceSession(s, 0.016);
    setView(publicView(s));
    setNotice("Both launch vectors locked.");
  }, [adminAimA, adminAimB]);

  const toggleAdminPause = useCallback(() => {
    setAdminPaused((paused) => {
      adminPausedRef.current = !paused;
      return !paused;
    });
  }, []);

  const adjustAdminHealth = useCallback((side: 0 | 1, delta: number) => {
    const s = sessionRef.current;
    const fight = s?.fight;
    if (!s || !fight) return;
    fight.hp[side] = Math.max(1, Math.min(fight.maxHp[side], fight.hp[side] + delta));
    setView(publicView(s));
  }, []);

  const forceAdminWinner = useCallback((side: 0 | 1) => {
    const s = sessionRef.current;
    if (!s?.fight) return;
    s.fight.hp[side === 0 ? 1 : 0] = 0;
    s.fight.over = true;
    advanceSession(s, 0.016);
    setView(publicView(s));
    setAdminPaused(false);
  }, []);

  const resetAdminDuel = useCallback(() => {
    sessionRef.current = null;
    rewardedSessionRef.current = null;
    previousHpRef.current = null;
    setView(null);
    setAdminPaused(false);
    setNotice("Admin controls reset. Choose the next matchup.");
  }, []);

  const updateStickFromPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointerRef.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34);
    let x = (e.clientX - (rect.left + rect.width / 2)) / radius;
    let y = (e.clientY - (rect.top + rect.height / 2)) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    touchMoveRef.current = { x, y };
    setStickOffset({ x: x * 27, y: y * 27 });
  }, []);

  const onStickPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    unlockAudio();
    stickPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateStickFromPointer(e);
  }, [updateStickFromPointer]);

  const onStickPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointerRef.current !== e.pointerId) return;
    stickPointerRef.current = null;
    touchMoveRef.current = { x: 0, y: 0 };
    setStickOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let raf = 0;
    try {
      const world = new World(host);
      world.setQuality(quality, true);
      worldRef.current = world;
      const resize = () => world.resize();
      window.addEventListener("resize", resize);
      const onDown = (e: KeyboardEvent) => {
        unlockAudio();
        if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          keysRef.current.add(e.key.toLowerCase());
        }
      };
      const onUp = (e: KeyboardEvent) => {
        keysRef.current.delete(e.key.toLowerCase());
      };
      window.addEventListener("keydown", onDown);
      window.addEventListener("keyup", onUp);
      const tick = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.05, lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0.016);
        lastFrameRef.current = now;
        const keys = keysRef.current;
        const inputX = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")) + touchMoveRef.current.x;
        const inputZ = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown")) - touchMoveRef.current.y;
        const inputLength = Math.hypot(inputX, inputZ);
        const targetX = inputLength > 1 ? inputX / inputLength : inputX;
        const targetZ = inputLength > 1 ? inputZ / inputLength : inputZ;
        const smoothing = 1 - Math.exp(-dt * (inputLength > 0.04 ? 11 : 15));
        smoothedMoveRef.current.x += (targetX - smoothedMoveRef.current.x) * smoothing;
        smoothedMoveRef.current.z += (targetZ - smoothedMoveRef.current.z) * smoothing;
        let dx = smoothedMoveRef.current.x;
        let dz = smoothedMoveRef.current.z;
        const moveLength = Math.hypot(dx, dz);
        if (moveLength > 1) { dx /= moveLength; dz /= moveLength; }
        if (moveLength > 0.13) facingRef.current = Math.atan2(dx, dz);
        if (!sessionRef.current) {
          if (moveLength > 0.13) {
            if (now - stepAudioRef.current > 390) {
              stepAudioRef.current = now;
              sfx("footstep");
            }
            playerPosRef.current = {
              x: Math.max(-13, Math.min(13, playerPosRef.current.x + dx * dt * 5.5)),
              z: Math.max(-12, Math.min(12, playerPosRef.current.z + dz * dt * 5.5)),
            };
          }
          let near = -1;
          for (let i = 0; i < RIVALS.length; i++) {
            const rival = RIVALS[i];
            if (Math.hypot(playerPosRef.current.x - rival.x, playerPosRef.current.z - rival.z) <= 2.9) {
              near = i;
              break;
            }
          }
          const nearState = near >= 0 ? near : null;
          if (nearbyRivalRef.current !== nearState) {
            nearbyRivalRef.current = nearState;
            setNearbyRival(nearState);
          }
        } else if (nearbyRivalRef.current !== null) {
          nearbyRivalRef.current = null;
          setNearbyRival(null);
        }
        const s = sessionRef.current;
        if (s) {
          const fight = s.fight;
          if (fight && fight.active[0] && fight.active[1]) {
            const previous = previousHpRef.current;
            const currentHp: [number, number] = [fight.hp[0], fight.hp[1]];
            if (previous) {
              if (currentHp[0] < previous[0] - 0.01 || currentHp[1] < previous[1] - 0.01) sfx("hit");
              else if (currentHp[0] > previous[0] + 0.01 || currentHp[1] > previous[1] + 0.01) sfx("heal");
            }
            previousHpRef.current = currentHp;
          } else {
            previousHpRef.current = null;
          }
          if (!(adminMode && adminPausedRef.current && s.flow === "fight")) advanceSession(s, dt, (cost) => {
            if (diamondsRef.current < cost) return false;
            diamondsRef.current -= cost;
            setDiamonds(diamondsRef.current);
            return true;
          });
          if (s.flow === "end" && rewardedSessionRef.current !== s) {
            rewardedSessionRef.current = s;
            sfx(s.matchWinner === 0 ? "win" : "lose");
            try {
              const saved = loadSave();
              saved.coins += s.coins;
              saved.diamonds = diamondsRef.current;
              saved.xp += s.xp;
              saved.matches += 1;
              if (s.matchWinner === 0) saved.wins += 1;
              writeSave(saved);
              setCoins(saved.coins);
            } catch { setNotice("Match finished, but progress could not be saved on this device."); }
          }
          if (now - lastUiRef.current > 100) {
            lastUiRef.current = now;
            setView(publicView(s));
          }
        }
        const current = sessionRef.current;
        const v = current ? publicView(current) : null;
        const frame = current ? renderFrame(current) : null;
        for (const fx of frame?.effects ?? []) {
          const played = playedFxKeysRef.current;
          if (played.keys.has(fx.key)) continue;
          played.keys.add(fx.key);
          played.queue.push(fx.key);
          if (played.queue.length > 120) {
            const oldest = played.queue.shift();
            if (oldest) played.keys.delete(oldest);
          }
          if (fx.sound) sfx(fx.sound);
          else if (fx.type >= 6) sfx("ability");
        }
        const mine = v?.myBall ? ballMapRef.current.get(v.myBall) ?? null : null;
        const opponent = v?.oppBall ? ballMapRef.current.get(v.oppBall) ?? null : null;
        const draw: DrawState = {
          mode: current ? "arena" : "lobby",
          px: playerPosRef.current.x,
          pz: playerPosRef.current.z,
          face: facingRef.current,
          moving: moveLength > 0.13,
          emote: current?.flow === "end" ? (current.matchWinner === 0 ? "win" : "lose") : "",
          camYaw: 0,
          colors: { skin: "#f3c7a1", shirt: "#ff5a36", pants: "#2f6bff", hat: "#1c2430" },
          bots: RIVALS.map((rival) => ({
            name: rival.name, x: rival.x, z: rival.z, yaw: rival.yaw, moving: rival.moving, shirt: rival.shirt, emote: rival.emote,
          })),
          quality,
          aimDrag: v?.flow === "aim" ? 1 : 0,
          ents: frame?.ents ?? [],
          effects: frame?.effects ?? [],
          ballA: mine,
          ballB: opponent,
          arrow: frame?.arrow ?? null,
          shake: current?.fight && current.fight.over ? 0.2 : 0,
          finisher: 0,
          winner: current?.roundWinner ?? -1,
          spectate: null,
          oppColor: "#ff3b5c",
        };
        world.update(dt, draw);
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("keydown", onDown);
        window.removeEventListener("keyup", onUp);
        world.destroy();
        worldRef.current = null;
      };
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "3D renderer could not start on this device.");
    }
  }, [quality]);

  const flow = view?.flow;
  const selected = view?.offers[view.picked];
  const selectedBall = selected ? ballMapRef.current.get(selected) : undefined;
  const opponentBall = view?.oppBall ? ballMapRef.current.get(view.oppBall) : undefined;

  return (
    <main className="game-shell">
      <div className="world-host" ref={hostRef} aria-label="3D BALL ARENA world" />
      <div className="game-vignette" />
      <header className="topbar">
        <div className="brand-mark"><span className="brand-orb">●</span><div><strong>BALL ARENA</strong><small>PHYSICS DUEL LEAGUE</small></div></div>
        <div className="wallet"><span>◈ {diamonds}</span><span>● {coins}</span><button className="icon-button sound-toggle" onClick={() => { const next = !audioMuted; setAudioMuted(next); setMuted(next); }} aria-label={audioMuted ? "Enable sound" : "Mute sound"}>{audioMuted ? "◌" : "♫"}</button><button className="icon-button" onClick={() => setQuality((q) => q === "medium" ? "high" : q === "high" ? "low" : "medium")} aria-label="Change graphics quality">◉ {quality.toUpperCase()}</button></div>
      </header>

      {!view && mode === "free-roam" && <div className="world-guide">
        <span className="eyebrow">FREE ROAM · SEASON 01</span>
        <strong>WALK UP TO A RIVAL</strong>
        <small>Move with the stick or WASD. Get close, then challenge them.</small>
      </div>}

      {!view && mode === "free-roam" && <div
        className="move-stick"
        role="application"
        aria-label="Movement joystick"
        onPointerDown={onStickPointerDown}
        onPointerMove={updateStickFromPointer}
        onPointerUp={onStickPointerUp}
        onPointerCancel={onStickPointerUp}
        onLostPointerCapture={onStickPointerUp}
      >
        <span className="stick-knob" style={{ transform: "translate(" + stickOffset.x + "px, " + stickOffset.y + "px)" }} />
      </div>}

      {!view && mode === "free-roam" && nearbyRival !== null && <button className="challenge-button" onClick={() => startMatch(RIVALS[nearbyRival].name)}>
        <span className="challenge-kicker">RIVAL IN RANGE</span><strong>⚔ CHALLENGE {RIVALS[nearbyRival].name}</strong><small>Tap to start a 1v1 duel</small>
      </button>}

      <div className="orientation-warning">
        <div className="rotate-icon">↻</div>
        <strong>ROTATE TO LANDSCAPE</strong>
        <span>Ball Arena is designed for horizontal play.</span>
        <small>Turn your phone sideways to enter the arena.</small>
      </div>

      {view && flow === "intro" && <div className="match-found-banner">
        <span>CHALLENGE ACCEPTED</span><strong>You vs {view.names[1]}</strong>
      </div>}

      {view && flow !== "intro" && <section className={"match-hud " + (flow === "fight" ? "fight-hud" : flow === "end" || flow === "round" ? "result-hud" : "setup-hud")} data-phase={flow}>
        <div className="match-head"><span className="eyebrow">ROUND {view.round} / BEST OF HEARTS</span><strong>{view.names[0]} <i>VS</i> {view.names[1]}</strong><div className="hearts"><span>{"♥ ".repeat(view.hearts[0])}</span><span>{"♥ ".repeat(view.hearts[1])}</span></div></div>
        <div className="phase-chip">{flow === "pick" ? "01 · CHOOSE YOUR BALL" : flow === "aim" ? "02 · SET YOUR AIM" : flow === "countdown" ? "LOCKED IN" : flow === "fight" ? "AUTO FIGHT" : flow === "round" ? (view.roundWinner === 0 ? "ROUND WON" : "ROUND LOST") : "MATCH COMPLETE"} <span>{Math.max(0, Math.ceil(view.timer))}s</span></div>
        {flow === "pick" && <div className="pick-area"><p className="subline">Choose one of your owned balls. Your opponent's pick stays hidden.</p><div className="ball-cards">{view.offers.map((id, index) => {
          const ball = ballMapRef.current.get(id);
          if (!ball) return null;
          const firstAbility = ball.abilities[0];
          const abilityName = firstAbility?.actions.slice(0, 2).map(actionLabel).join(" + ") || "PHYSICS IMPACT";
          const skillWindow = firstAbility?.cooldown ?? firstAbility?.interval ?? firstAbility?.seconds;
          const skillMeta = firstAbility
            ? (skillWindow !== undefined ? `WINDOW ${skillWindow.toFixed(1)}S` : `${firstAbility.actions.length} EFFECT${firstAbility.actions.length === 1 ? "" : "S"}`)
            : "CONTACT PASSIVE";
          return <button key={id} className={`ball-card ${view.picked === index ? "selected" : ""}`} onClick={() => send({ t: "pick", side: 0, index })} aria-pressed={view.picked === index}>
            <span className="rarity">{ball.rarity}</span>
            <span className={`ball-sphere shape-${ball.visual.shape} ball-${ball.id}`} style={{ background: `radial-gradient(circle at 30% 24%, #ffffff 0%, ${ball.visual.baseColor} 24%, ${ball.visual.accentColor} 100%)`, color: ball.visual.accentColor }}>
              <span className="ball-glyph">{ballGlyph(ball.id)}</span><i className="ball-glint" />
            </span>
            <strong>{ball.name.en}</strong>
            <small>{ball.ai_hints.role.toUpperCase()} · {ball.stats.hp} HP</small>
            <div className="ball-stat-bars" aria-label="Ball combat stats">
              <span><i>HP</i><b><em style={{ width: Math.min(100, ball.stats.hp / 220 * 100) + "%" }} /></b></span>
              <span><i>SPD</i><b><em style={{ width: Math.min(100, ball.stats.speed / 22 * 100) + "%" }} /></b></span>
              <span><i>DMG</i><b><em style={{ width: Math.min(100, ball.stats.contactDamage / 16 * 100) + "%" }} /></b></span>
            </div>
            <span className="ability-chip"><i>{abilityTriggerLabel(firstAbility?.trigger ?? "onBallHit", firstAbility?.interval)}</i><b><em className="ability-glyph">{abilityGlyph(firstAbility?.actions[0])}</em><span>{abilityName}</span></b><small>{skillMeta}{ball.abilities.length > 1 ? ` · +${ball.abilities.length - 1} SKILLS` : ""}</small></span>
            <p>{ball.description.en}</p>
          </button>;
        })}</div><div className="action-row"><button className="secondary-button" onClick={() => send({ t: "reroll", side: 0 })}>{view.rerollCost === 0 ? "↻ FREE REROLL" : `↻ REROLL · ◈ ${view.rerollCost}`}</button><button className="primary-button compact" disabled={view.picked < 0 || view.confirmed} onClick={() => send({ t: "confirm", side: 0 })}>CONFIRM PICK ↗</button></div><p className="hint-line">Opponent: {view.oppStatus === "locked" ? "LOCKED IN" : "CHOOSING…"}</p></div>}
        {flow === "aim" && <div className="aim-area"><div className="aim-icon">⌖</div><h2>Set your launch vector</h2><p>Your aim is private until both players lock in.</p><label className="aim-label">ANGLE <b>{aim}°</b></label><input aria-label="Aim angle" type="range" min="0" max="359" value={aim} onChange={(e) => { const n = Number(e.target.value); setAim(n); send({ t: "aim", side: 0, angle: n * Math.PI / 180 }); }} /><div className="action-row"><button className="primary-button compact" disabled={view.aimLocked} onClick={() => send({ t: "lock", side: 0 })}>LOCK AIM ✓</button><span className="hint-line">Opponent: {view.oppAimLocked ? "LOCKED" : "AIMING…"} · SECRET</span></div></div>}
        {flow === "countdown" && <div className="status-panel"><div className="pulse-ring">{Math.max(1, Math.ceil(view.timer))}</div><h2>GET READY</h2><p>Balls revealed. The duel starts automatically.</p></div>}
        {flow === "fight" && <div className="fight-panel"><div><span>YOUR BALL</span><b>{selectedBall?.name.en ?? "Locked"}</b><small>{Math.ceil(view.hp[0])} / {view.maxHp[0]} HP</small><em className="fight-ability" style={{ color: selectedBall?.visual.accentColor ?? "#67e8f9" }}>{selectedBall?.abilities[0] ? `${abilityGlyph(selectedBall.abilities[0].actions[0])} ${abilityTriggerLabel(selectedBall.abilities[0].trigger, selectedBall.abilities[0].interval)} · ${selectedBall.abilities[0].actions.slice(0, 2).map(actionLabel).join(" + ")}` : "PHYSICS IMPACT"}</em></div><div className="fight-vs">VS</div><div><span>RIVAL BALL</span><b>{opponentBall?.name.en ?? "Rival"}</b><small>{Math.ceil(view.hp[1])} / {view.maxHp[1]} HP</small><em className="fight-ability" style={{ color: opponentBall?.visual.accentColor ?? "#fb7185" }}>{opponentBall?.abilities[0] ? `${abilityGlyph(opponentBall.abilities[0].actions[0])} ${abilityTriggerLabel(opponentBall.abilities[0].trigger, opponentBall.abilities[0].interval)} · ${opponentBall.abilities[0].actions.slice(0, 2).map(actionLabel).join(" + ")}` : "PHYSICS IMPACT"}</em></div></div>}
        {(flow === "round" || flow === "end") && <div className="status-panel"><div className="pulse-ring">{view.matchWinner === 0 ? "W" : view.matchWinner === 1 ? "L" : view.roundWinner === 0 ? "✓" : "×"}</div><h2>{flow === "end" ? (view.matchWinner === 0 ? "VICTORY" : "DEFEAT") : (view.roundWinner === 0 ? "ROUND WON" : "ROUND LOST")}</h2><p>{flow === "end" ? "Rewards added. Run it back?" : "Next round loading…"}</p>{flow === "end" && <button className="primary-button compact" onClick={() => startMatch(opponentName)}>REMATCH ↗</button>}</div>}
        <button className="lobby-button" onClick={() => { sessionRef.current = null; setView(null); nearbyRivalRef.current = null; setNearbyRival(null); setNotice("Back to the plaza."); }}>← LOBBY</button>
      </section>}

      {adminMode && <section className="admin-console" aria-label="1v1 admin control panel">
        <div className="admin-console-head"><span>ADMIN ROUTE · /1v1/admin</span><strong>1V1 CONTROL DECK</strong></div>
        <div className="admin-select-grid">
          <label>PLAYER A
            <select value={adminBallA} onChange={(e) => setAdminBallA(e.target.value)}>
              {availableBalls.map((ball) => <option key={ball.id} value={ball.id}>{ball.name.en} · {ball.rarity}</option>)}
            </select>
          </label>
          <label>PLAYER B
            <select value={adminBallB} onChange={(e) => setAdminBallB(e.target.value)}>
              {availableBalls.map((ball) => <option key={ball.id} value={ball.id}>{ball.name.en} · {ball.rarity}</option>)}
            </select>
          </label>
        </div>
        <label className="admin-difficulty">SIMULATION PRESET
          <select value={adminDifficulty} onChange={(e) => setAdminDifficulty(e.target.value as Difficulty)}>
            <option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option>
          </select>
        </label>
        {!view && <button className="admin-primary" onClick={startAdminDuel}>START CONTROLLED 1V1 ↗</button>}
        {view && flow === "aim" && <>
          <div className="admin-angle"><label>PLAYER A ANGLE <b>{adminAimA}°</b><input type="range" min="0" max="359" value={adminAimA} onChange={(e) => updateAdminAim(0, Number(e.target.value))} /></label></div>
          <div className="admin-angle"><label>PLAYER B ANGLE <b>{adminAimB}°</b><input type="range" min="0" max="359" value={adminAimB} onChange={(e) => updateAdminAim(1, Number(e.target.value))} /></label></div>
          <button className="admin-primary" onClick={lockAdminLaunch}>LOCK BOTH & LAUNCH ⚡</button>
        </>}
        {view && flow === "fight" && <>
          <div className="admin-action-row">
            <button onClick={toggleAdminPause}>{adminPaused ? "▶ RESUME" : "Ⅱ PAUSE"}</button>
            <button onClick={() => { setAdminPaused(false); adminPausedRef.current = false; startAdminDuel(); }}>↻ RESET FIGHT</button>
          </div>
          <div className="admin-action-row">
            <button onClick={() => adjustAdminHealth(0, -25)}>A −25 HP</button>
            <button onClick={() => adjustAdminHealth(0, 25)}>A +25 HP</button>
            <button onClick={() => adjustAdminHealth(1, -25)}>B −25 HP</button>
            <button onClick={() => adjustAdminHealth(1, 25)}>B +25 HP</button>
          </div>
          <div className="admin-action-row">
            <button onClick={() => forceAdminWinner(0)}>FORCE A WIN</button>
            <button onClick={() => forceAdminWinner(1)}>FORCE B WIN</button>
          </div>
        </>}
        {view && (flow === "round" || flow === "end") && <button className="admin-primary" onClick={startAdminDuel}>REMATCH SELECTED BALLS ↗</button>}
      </section>}

      <footer className="bottom-status"><span><i className="status-dot" /> SYSTEM ONLINE</span><span>LOCAL RIVAL DUELS · WALK TO CHALLENGE</span></footer>
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
    </main>
  );
}
