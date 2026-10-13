import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BallDef } from "../sim/types";
import { CONFIG } from "../config";
import { World, type DrawState } from "../render/world";
import { advanceSession, applyCommand, createSession, publicView, renderFrame, type Session } from "../game/session";
import { enabledBalls } from "../packs/registry";
import { loadSave, writeSave } from "../economy/save";

export const Route = createFileRoute("/")({ component: BallArenaPage });

type UiView = ReturnType<typeof publicView> | null;

function BallArenaPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const lastFrameRef = useRef(0);
  const lastUiRef = useRef(0);
  const [view, setView] = useState<UiView>(null);
  const [coins, setCoins] = useState(CONFIG.starterCoins);
  const [diamonds, setDiamonds] = useState(CONFIG.starterDiamonds);
  const [aim, setAim] = useState(90);
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const playerPosRef = useRef({ x: 0, z: 0 });
  const diamondsRef = useRef(diamonds);
  diamondsRef.current = diamonds;
  const rewardedSessionRef = useRef<Session | null>(null);
  const [moving, setMoving] = useState(false);
  const keysRef = useRef<Set<string>>(new Set());
  const ballMapRef = useRef<Map<string, BallDef>>(new Map());

  const startMatch = useCallback(() => {
    const all = enabledBalls();
    const byId = new Map(all.map((b) => [b.id, b]));
    ballMapRef.current = byId;
    const starter = CONFIG.starterBalls.map((id) => byId.get(id)).filter((b): b is BallDef => Boolean(b));
    const pool = starter.length >= 3 ? starter : all;
    if (pool.length < 2) {
      setNotice("No valid balls were loaded. Check the core pack.");
      return;
    }
    const stored = loadSave();
    if (stored && typeof stored.coins === "number") setCoins(stored.coins);
    if (stored && typeof stored.diamonds === "number") setDiamonds(stored.diamonds);
    sessionRef.current = createSession({
      seed: Math.floor(Math.random() * 2_000_000_000),
      pool0: pool,
      pool1: all.length >= 3 ? all : pool,
      names: ["You", ["NovaByte", "PixelFox", "OrbitJay", "MangoRush", "ZedSpark"][Math.floor(Math.random() * 5)]],
      diff: "normal",
      control: ["human", "bot"],
    });
    setView(publicView(sessionRef.current));
    setNotice("Match found — choose your ball.");
  }, []);

  const send = useCallback((cmd: Parameters<typeof applyCommand>[1]) => {
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
        if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(e.key.toLowerCase())) {
          keysRef.current.add(e.key.toLowerCase());
          setMoving(true);
        }
      };
      const onUp = (e: KeyboardEvent) => {
        keysRef.current.delete(e.key.toLowerCase());
        if (!keysRef.current.size) setMoving(false);
      };
      window.addEventListener("keydown", onDown);
      window.addEventListener("keyup", onUp);
      const tick = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.05, lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0.016);
        lastFrameRef.current = now;
        const keys = keysRef.current;
        const dx = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
        const dz = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
        if (!sessionRef.current && (dx || dz)) {
          playerPosRef.current = { x: Math.max(-13, Math.min(13, playerPosRef.current.x + dx * dt * 5)), z: Math.max(-12, Math.min(12, playerPosRef.current.z + dz * dt * 5)) };
        }
        const s = sessionRef.current;
        if (s) {
          advanceSession(s, dt, (cost) => {
            if (diamondsRef.current < cost) return false;
            diamondsRef.current -= cost;
            setDiamonds(diamondsRef.current);
            return true;
          });
          if (s.flow === "end" && rewardedSessionRef.current !== s) {
            rewardedSessionRef.current = s;
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
        const mine = v?.myBall ? ballMapRef.current.get(v.myBall) ?? null : null;
        const opponent = v?.oppBall ? ballMapRef.current.get(v.oppBall) ?? null : null;
        const draw: DrawState = {
          mode: current ? "arena" : "lobby",
          px: playerPosRef.current.x,
          pz: playerPosRef.current.z,
          face: Math.atan2(dx || 0.001, -dz || -0.001),
          moving: Boolean(dx || dz),
          emote: current?.flow === "end" ? (current.matchWinner === 0 ? "win" : "lose") : "",
          camYaw: 0,
          colors: { skin: "#f3c7a1", shirt: "#ff5a36", pants: "#2f6bff", hat: "#1c2430" },
          bots: [
            { x: -7, z: 4, yaw: 0.4, moving: true, shirt: "#5b8cff", emote: "" },
            { x: 7, z: 4, yaw: -0.4, moving: false, shirt: "#3ecf8e", emote: "wave" },
            { x: -8, z: -2, yaw: 1, moving: false, shirt: "#f5b942", emote: "" },
            { x: 8, z: -2, yaw: -1, moving: true, shirt: "#ff5a36", emote: "" },
            { x: 0, z: 10, yaw: 3, moving: false, shirt: "#1c2430", emote: "" },
          ],
          quality,
          aimDrag: v?.flow === "aim" ? 1 : 0,
          ents: frame?.ents ?? [],
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
        <div className="wallet"><span>◈ {diamonds}</span><span>● {coins}</span><button className="icon-button" onClick={() => setQuality((q) => q === "medium" ? "high" : q === "high" ? "low" : "medium")} aria-label="Change graphics quality">◉ {quality.toUpperCase()}</button></div>
      </header>

      {!view && <section className="lobby-panel">
        <span className="eyebrow">SEASON 01 · TOYBOX ARENA</span>
        <h1>Pick a ball.<br /><em>Own the arena.</em></h1>
        <p>Build your strategy, set your angle, then let physics decide the duel.</p>
        <div className="lobby-stats"><div><b>16</b><span>ORIGINAL BALLS</span></div><div><b>1v1</b><span>AUTO BATTLE</span></div><div><b>3 ♥</b><span>TO WIN</span></div></div>
        <button className="primary-button" onClick={startMatch}>QUICK PLAY <span>↗</span></button>
        <div className="control-hint">MOVE: WASD / ARROWS <span>•</span> EXPLORE THE PLAZA</div>
      </section>}

      {view && <section className="match-hud">
        <div className="match-head"><span className="eyebrow">ROUND {view.round} / BEST OF HEARTS</span><strong>{view.names[0]} <i>VS</i> {view.names[1]}</strong><div className="hearts"><span>{"♥ ".repeat(view.hearts[0])}</span><span>{"♥ ".repeat(view.hearts[1])}</span></div></div>
        <div className="phase-chip">{flow === "intro" ? "MATCH FOUND" : flow === "pick" ? "01 · CHOOSE YOUR BALL" : flow === "aim" ? "02 · SET YOUR AIM" : flow === "countdown" ? "LOCKED IN" : flow === "fight" ? "AUTO FIGHT" : flow === "round" ? (view.roundWinner === 0 ? "ROUND WON" : "ROUND LOST") : "MATCH COMPLETE"} <span>{Math.max(0, Math.ceil(view.timer))}s</span></div>
        {flow === "pick" && <div className="pick-area"><p className="subline">Choose one of your owned balls. Your opponent's pick stays hidden.</p><div className="ball-cards">{view.offers.map((id, index) => {
          const ball = ballMapRef.current.get(id);
          if (!ball) return null;
          return <button key={id} className={view.picked === index ? "ball-card selected" : "ball-card"} onClick={() => send({ t: "pick", side: 0, index })}><span className="rarity">{ball.rarity}</span><span className="ball-sphere" style={{ background: `radial-gradient(circle at 32% 28%, #fff 0%, ${ball.visual.baseColor} 22%, ${ball.visual.accentColor} 100%)` }}>••</span><strong>{ball.name.en}</strong><small>{ball.ai_hints.role.toUpperCase()} · {ball.stats.hp} HP</small><p>{ball.description.en}</p></button>;
        })}</div><div className="action-row"><button className="secondary-button" onClick={() => send({ t: "reroll", side: 0 })}>{view.rerollCost === 0 ? "↻ FREE REROLL" : `↻ REROLL · ◈ ${view.rerollCost}`}</button><button className="primary-button compact" disabled={view.picked < 0 || view.confirmed} onClick={() => send({ t: "confirm", side: 0 })}>CONFIRM PICK ↗</button></div><p className="hint-line">Opponent: {view.oppStatus === "locked" ? "LOCKED IN" : "CHOOSING…"}</p></div>}
        {flow === "aim" && <div className="aim-area"><div className="aim-icon">⌖</div><h2>Set your launch vector</h2><p>Your aim is private until both players lock in.</p><label className="aim-label">ANGLE <b>{aim}°</b></label><input aria-label="Aim angle" type="range" min="0" max="359" value={aim} onChange={(e) => { const n = Number(e.target.value); setAim(n); send({ t: "aim", side: 0, angle: n * Math.PI / 180 }); }} /><div className="action-row"><button className="primary-button compact" disabled={view.aimLocked} onClick={() => send({ t: "lock", side: 0 })}>LOCK AIM ✓</button><span className="hint-line">Opponent: {view.oppAimLocked ? "LOCKED" : "AIMING…"} · SECRET</span></div></div>}
        {(flow === "intro" || flow === "countdown") && <div className="status-panel"><div className="pulse-ring">{flow === "countdown" ? Math.max(1, Math.ceil(view.timer)) : "VS"}</div><h2>{flow === "intro" ? "Opponent found" : "GET READY"}</h2><p>{flow === "intro" ? "Your rival is entering the arena…" : "Balls revealed. The duel starts automatically."}</p></div>}
        {flow === "fight" && <div className="fight-panel"><div><span>YOUR BALL</span><b>{selectedBall?.name.en ?? "Locked"}</b><small>{Math.ceil(view.hp[0])} / {view.maxHp[0]} HP</small></div><div className="fight-vs">VS</div><div><span>RIVAL BALL</span><b>{opponentBall?.name.en ?? "Rival"}</b><small>{Math.ceil(view.hp[1])} / {view.maxHp[1]} HP</small></div></div>}
        {(flow === "round" || flow === "end") && <div className="status-panel"><div className="pulse-ring">{view.matchWinner === 0 ? "W" : view.matchWinner === 1 ? "L" : view.roundWinner === 0 ? "✓" : "×"}</div><h2>{flow === "end" ? (view.matchWinner === 0 ? "VICTORY" : "DEFEAT") : (view.roundWinner === 0 ? "ROUND WON" : "ROUND LOST")}</h2><p>{flow === "end" ? "Rewards added. Run it back?" : "Next round loading…"}</p>{flow === "end" && <button className="primary-button compact" onClick={startMatch}>REMATCH ↗</button>}</div>}
        <button className="lobby-button" onClick={() => { sessionRef.current = null; setView(null); setNotice("Back in the lobby."); }}>← LOBBY</button>
      </section>}

      <footer className="bottom-status"><span><i className="status-dot" /> SYSTEM ONLINE</span><span>LOCAL BOT MATCH · OFFLINE READY</span></footer>
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
    </main>
  );
}
