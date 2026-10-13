/** Procedural WebAudio. No audio files. Unlocks on the first gesture. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicOn = false;
let muted = false;
let timer = 0;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  ac();
  if (!musicOn) startMusic();
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.18;
  if (!v) unlockAudio();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0): void {
  const c = ac();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

export function sfx(id: string): void {
  if (muted) return;
  if (id === "click") tone(520, 0.06, "square", 0.08);
  else if (id === "lock") tone(340, 0.09, "triangle", 0.1, 80);
  else if (id === "hit") tone(180, 0.07, "sawtooth", 0.06, -80);
  else if (id === "boom") tone(90, 0.22, "sawtooth", 0.1, -40);
  else if (id === "win") {
    tone(523, 0.12, "triangle", 0.08);
    setTimeout(() => tone(659, 0.14, "triangle", 0.08), 90);
    setTimeout(() => tone(784, 0.2, "triangle", 0.08), 180);
  } else if (id === "lose") tone(220, 0.25, "sine", 0.08, -100);
  else if (id === "whoosh") tone(420, 0.12, "sine", 0.05, 200);
  else if (id === "zap") tone(880, 0.08, "square", 0.05, -400);
  else tone(300, 0.05, "square", 0.04);
}

function startMusic(): void {
  musicOn = true;
  const step = () => {
    if (!musicOn || muted) return;
    const scale = [262, 294, 330, 392, 440, 392, 330, 294];
    tone(scale[timer % scale.length] / 2, 0.18, "triangle", 0.03);
    timer++;
    window.setTimeout(step, 420);
  };
  step();
}

export function buzz(ms: number, enabled: boolean): void {
  if (!enabled || typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(ms);
}
