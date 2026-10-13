/** Premium procedural audio layer: soft tactile foley and layered sci-fi transients, no retro square-wave bleeps. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let ambientStarted = false;
let lastSfxAt = 0;

type SoundAsset = "footstep" | "ui" | "impact" | "ability";
const assetPaths: Record<SoundAsset, string> = {
  footstep: "/audio/ballarena-footstep.mp3",
  ui: "/audio/ballarena-ui-confirm.mp3",
  impact: "/audio/ballarena-impact.mp3",
  ability: "/audio/ballarena-ability.mp3",
};
const assetPools = new Map<SoundAsset, HTMLAudioElement[]>();
const lastAssetPlayedAt = new Map<SoundAsset, number>();

function soundAssetFor(id: string): SoundAsset | null {
  if (id === "footstep") return "footstep";
  if (id === "click" || id === "lock") return "ui";
  if (id === "hit" || id === "boom" || id === "explode") return "impact";
  if (["ability", "dash", "zap", "whoosh", "beam", "chain", "shield", "zone", "projectile", "orbit", "split", "spawn"].includes(id)) return "ability";
  return null;
}

function playGeneratedAsset(key: SoundAsset, now: number): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  const minGap = key === "impact" ? 170 : key === "ability" ? 230 : key === "footstep" ? 240 : 80;
  if (now - (lastAssetPlayedAt.get(key) ?? -Infinity) < minGap) return;
  lastAssetPlayedAt.set(key, now);

  let pool = assetPools.get(key);
  if (!pool) {
    const count = key === "impact" || key === "ability" ? 3 : 1;
    pool = Array.from({ length: count }, () => {
      const audio = new Audio(assetPaths[key]);
      audio.preload = "auto";
      audio.volume = key === "impact" ? 0.47 : key === "footstep" ? 0.4 : key === "ui" ? 0.46 : 0.4;
      return audio;
    });
    assetPools.set(key, pool);
  }
  let audio = pool.find((item) => item.paused || item.ended);
  if (!audio) audio = pool.reduce((oldest, item) => item.currentTime > oldest.currentTime ? item : oldest);
  audio.currentTime = 0;
  void audio.play().catch(() => {
    // Browser may defer media playback until a user gesture; later inputs retry.
  });
}

function ac(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  const c = ac();
  if (!c || ambientStarted) return;
  ambientStarted = true;
  // A quiet, non-melodic air bed; no looping chiptune or repetitive notes.
  const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const channel = noise.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * 0.15;
  const source = c.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  const gain = c.createGain();
  gain.gain.value = 0.018;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master!);
  source.start();
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master) master.gain.setTargetAtTime(v ? 0 : 0.42, ctx?.currentTime ?? 0, 0.035);
  for (const pool of assetPools.values()) for (const audio of pool) {
    if (v) audio.pause();
    audio.muted = v;
  }
  if (!v) unlockAudio();
}

function envelope(gain: GainNode, start: number, peak: number, end: number, attack: number, decay: number): void {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  void end;
}

function tone(freq: number, duration: number, type: OscillatorType, volume: number, slide = 0, pan = 0): void {
  const c = ac();
  if (!c || !master) return;
  const start = c.currentTime;
  const osc = c.createOscillator();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  const panner = c.createStereoPanner();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), start + duration);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(9000, freq * 5), start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(150, freq * 1.3), start + duration);
  panner.pan.value = pan;
  envelope(gain, start, volume, 0.0001, Math.min(0.012, duration * 0.12), duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.025);
}

function noiseBurst(duration: number, volume: number, cutoff: number, pan = 0): void {
  const c = ac();
  if (!c || !master) return;
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const fade = Math.pow(1 - i / length, 2.2);
    samples[i] = (Math.random() * 2 - 1) * fade;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = 0.45;
  const gain = c.createGain();
  gain.gain.value = volume;
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(master);
  src.start();
}

export function sfx(id: string): void {
  if (muted) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  // Use the original Mirelo recordings for signature game events; keep procedural foley for pack-specific cues.
  const asset = soundAssetFor(id);
  if (asset) {
    playGeneratedAsset(asset, now);
    lastSfxAt = now;
    return;
  }
  // Prevent high-speed physics callbacks from turning into a wall of noise.
  if (["hiss", "tink", "tick", "dice", "pop", "clink", "shing", "sip", "web", "zap"].includes(id) && now - lastSfxAt < 55) return;
  lastSfxAt = now;
  if (id === "click" || id === "lock") {
    tone(id === "lock" ? 620 : 760, 0.12, "sine", 0.055, id === "lock" ? 420 : -150, 0.08);
    tone(1180, 0.075, "sine", 0.018, -240, -0.08);
    noiseBurst(0.045, 0.012, 4200, 0);
  } else if (id === "hit" || id === "tink") {
    tone(id === "tink" ? 980 : 155, id === "tink" ? 0.18 : 0.14, "sine", id === "tink" ? 0.075 : 0.11, id === "tink" ? 480 : -75, -0.15);
    tone(id === "tink" ? 1480 : 92, 0.11, "triangle", 0.035, id === "tink" ? -300 : -35, 0.18);
    noiseBurst(0.085, 0.055, id === "tink" ? 7000 : 1500, 0.03);
  } else if (id === "boom" || id === "explode") {
    tone(115, 0.42, "sine", 0.18, -70);
    tone(245, 0.24, "triangle", 0.055, -120, 0.1);
    noiseBurst(0.32, 0.12, 1900, -0.06);
    tone(760, 0.19, "sine", 0.018, -520, 0.2);
  } else if (id === "win") {
    tone(392, 0.28, "sine", 0.04, 90);
    tone(587, 0.32, "sine", 0.035, 120, 0.12);
    tone(784, 0.42, "triangle", 0.025, 180, -0.12);
    noiseBurst(0.16, 0.018, 5200, 0);
  } else if (id === "lose") {
    tone(260, 0.34, "sine", 0.055, -125);
    tone(195, 0.42, "triangle", 0.025, -60, -0.1);
  } else if (id === "whoosh" || id === "dash") {
    noiseBurst(0.24, 0.045, 3000, 0.22);
    tone(420, 0.2, "sine", 0.022, 620, -0.18);
  } else if (id === "zap" || id === "ability") {
    tone(300, 0.22, "sine", 0.055, 900, -0.15);
    tone(920, 0.2, "triangle", 0.035, -470, 0.18);
    noiseBurst(0.16, 0.035, 5600, 0);
  } else if (id === "heal") {
    tone(520, 0.22, "sine", 0.035, 220);
    tone(780, 0.27, "sine", 0.025, 240, 0.12);
  } else if (id === "footstep") {
    tone(105 + Math.random() * 24, 0.095, "sine", 0.045, -28, Math.random() * 0.4 - 0.2);
    noiseBurst(0.065, 0.024, 900 + Math.random() * 700, Math.random() * 0.3 - 0.15);
    tone(680, 0.035, "sine", 0.006, -200);
  } else if (id === "dice") {
    tone(410, 0.09, "sine", 0.03, 180);
    noiseBurst(0.075, 0.022, 3500, -0.1);
  } else if (id === "clink" || id === "tink") {
    tone(id === "clink" ? 1120 : 980, 0.16, "sine", 0.06, -260, -0.08);
    tone(1640, 0.12, "sine", 0.025, -520, 0.12);
    noiseBurst(0.055, 0.012, 6200, 0);
  } else if (id === "shing") {
    tone(520, 0.24, "sine", 0.045, 720, -0.16);
    tone(1480, 0.2, "triangle", 0.035, -420, 0.16);
    noiseBurst(0.14, 0.024, 7400, 0.05);
  } else if (id === "sip") {
    tone(360, 0.13, "sine", 0.025, 160);
    tone(720, 0.18, "sine", 0.018, 180, 0.1);
  } else if (id === "tick") {
    tone(680, 0.055, "sine", 0.035, -160);
    noiseBurst(0.025, 0.008, 3400, 0);
  } else if (id === "web") {
    noiseBurst(0.18, 0.025, 2100, 0.15);
    tone(240, 0.15, "sine", 0.018, -80, -0.15);
  } else if (id === "hiss") {
    noiseBurst(0.22, 0.026, 4300, Math.random() * 0.3 - 0.15);
    tone(180, 0.19, "sine", 0.008, -60);
  } else if (id === "pop") {
    tone(240, 0.12, "sine", 0.045, 260);
    noiseBurst(0.055, 0.018, 2400, 0.1);
  } else {
    tone(440, 0.09, "sine", 0.025, 120);
  }
}

export function buzz(ms: number, enabled: boolean): void {
  if (!enabled || typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(ms);
}
