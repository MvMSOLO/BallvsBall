import * as THREE from "three";
import type { BallDef } from "../sim/types";
import type { FrameEnt, FrameFx } from "../game/session";
import { previewAim } from "../sim/engine";
import { CONFIG } from "../config";

export interface AvatarColors {
  skin: string;
  shirt: string;
  pants: string;
  hat: string;
}

export interface DrawBot {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  shirt: string;
  emote: string;
  name: string;
}

export interface DrawState {
  mode: "lobby" | "arena";
  px: number;
  pz: number;
  face: number;
  moving: boolean;
  emote: string;
  camYaw: number;
  colors: AvatarColors;
  bots: DrawBot[];
  quality: "low" | "medium" | "high";
  aimDrag: number;
  ents: FrameEnt[];
  effects: FrameFx[];
  ballA: BallDef | null;
  ballB: BallDef | null;
  arrow: number | null;
  shake: number;
  finisher: number;
  winner: -1 | 0 | 1;
  spectate: { ax: number; ay: number; bx: number; by: number } | null;
  oppColor: string;
}

interface LiveFx {
  key: string;
  type: number;
  magnitude: number;
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  ring2?: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  shell?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  particles: THREE.Mesh[];
  line?: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  age: number;
  duration: number;
}

interface TrailParticle {
  mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  active: boolean;
  baseOpacity: number;
  baseScale: number;
}

interface Rig {
  group: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  nameTag?: THREE.Sprite;
  phase: number;
}

const _v = new THREE.Vector3();

function lambert(color: string, emissive = "#000000", ei = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });
}

function makeRig(c: AvatarColors): Rig {
  const group = new THREE.Group();

  // Softer anatomy than the original block rig: rounded torso, head, shoulders, hands and shoes.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.48, 5, 12), lambert(c.shirt));
  torso.position.set(0, 1.17, 0);
  torso.scale.z = 0.72;
  torso.castShadow = true;

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.15, 3, 8), lambert(c.skin));
  neck.position.y = 1.58;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.255, 24, 18), lambert(c.skin));
  head.position.y = 1.79;
  head.scale.set(0.93, 1.04, 0.9);

  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 12), lambert(c.hat));
  hat.position.y = 2.02;
  hat.scale.set(1, 0.37, 1.02);

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.35, 4, 10), lambert(c.shirt));
  armL.position.set(-0.43, 1.25, 0);
  armL.geometry.translate(0, -0.17, 0);
  const armR = armL.clone();
  armR.position.x = 0.43;

  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), lambert(c.skin));
  handL.position.set(0, -0.43, 0.02);
  armL.add(handL);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), lambert(c.skin));
  handR.position.set(0, -0.43, 0.02);
  armR.add(handR);

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.35, 4, 10), lambert(c.pants));
  legL.position.set(-0.17, 0.51, 0);
  legL.geometry.translate(0, -0.14, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;

  const shoeMaterial = lambert("#172234");
  const soleMaterial = lambert("#dbeafe");
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMaterial);
    shoe.scale.set(0.18, 0.075, 0.29);
    shoe.position.set(0, -0.41, 0.08);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.035, 0.43), soleMaterial);
    sole.position.set(0, -0.445, 0.08);
    leg.add(shoe, sole);
  }

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 10), lambert("#152236"));
  eye.position.set(-0.105, 1.81, 0.226);
  const eye2 = eye.clone();
  eye2.position.x = 0.105;
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), lambert("#783f42"));
  mouth.position.set(0, 1.71, 0.226);
  mouth.scale.set(1.2, 0.34, 0.24);

  group.add(torso, neck, head, hat, armL, armR, legL, legR, eye, eye2, mouth);
  return { group, armL, armR, legL, legR, torso, head, phase: 0 };
}

function makeNameTag(label: string, accent: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(7, 17, 31, 0.88)";
    ctx.fillRect(5, 6, 246, 52);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 6, 246, 52);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 28px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.toUpperCase(), 128, 33, 226);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.55, 0.64, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function tickRig(rig: Rig, dt: number, moving: boolean, emote: string): void {
  rig.phase += dt * (moving ? 9.2 : 1.35);
  const gait = moving ? Math.sin(rig.phase) : 0;
  const blend = 1 - Math.exp(-dt * 12);
  const targetLegL = gait * 0.58;
  const targetLegR = -gait * 0.58;
  const targetArmL = -gait * 0.38;
  const targetArmR = gait * 0.38;
  rig.legL.rotation.x += (targetLegL - rig.legL.rotation.x) * blend;
  rig.legR.rotation.x += (targetLegR - rig.legR.rotation.x) * blend;
  rig.armL.rotation.x += (targetArmL - rig.armL.rotation.x) * blend;
  rig.armR.rotation.x += (targetArmR - rig.armR.rotation.x) * blend;
  rig.group.position.y += ((moving ? Math.abs(Math.sin(rig.phase * 2)) * 0.035 : 0) - rig.group.position.y) * blend;
  rig.torso.rotation.x += ((moving ? Math.abs(gait) * 0.035 : 0) - rig.torso.rotation.x) * blend;
  rig.torso.rotation.z += ((moving ? -gait * 0.045 : 0) - rig.torso.rotation.z) * blend;
  rig.head.rotation.x += ((moving ? -Math.abs(gait) * 0.025 : 0) - rig.head.rotation.x) * blend;
  if (emote === "win") {
    rig.armL.rotation.x = -2.2;
    rig.armR.rotation.x = -2.2;
  } else if (emote === "lose") {
    rig.torso.rotation.z = 0.4;
    rig.head.rotation.z = 0.3;
  } else if (emote === "wave") {
    rig.armR.rotation.z = Math.sin(rig.phase * 2) * 0.4 - 0.8;
  } else {
    rig.armL.rotation.z += (0 - rig.armL.rotation.z) * blend;
    rig.armR.rotation.z += (0 - rig.armR.rotation.z) * blend;
  }
}

function patternTexture(def: BallDef): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  g.fillStyle = def.visual.baseColor;
  g.fillRect(0, 0, canvas.width, canvas.height);
  const p = def.visual.pattern;
  g.fillStyle = def.visual.accentColor;
  g.strokeStyle = def.visual.accentColor;
  g.lineWidth = 3;
  if (p === "stripes") {
    for (let i = 0; i < 16; i++) if (i % 2 === 0) g.fillRect(i * 16, 0, 8, 128);
  } else if (p === "dots") {
    for (let y = 10; y < 128; y += 22) for (let x = 10; x < 256; x += 22) {
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  } else if (p === "checker") {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2 === 0) g.fillRect(x * 16, y * 16, 16, 16);
  } else if (p === "hex") {
    for (let y = -8; y < 136; y += 22) for (let x = -8; x < 264; x += 24) {
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const px = x + Math.cos(a) * 10; const py = y + Math.sin(a) * 10; if (!k) g.moveTo(px, py); else g.lineTo(px, py); } g.closePath(); g.stroke();
    }
  } else if (p === "stars") {
    for (let i = 0; i < 24; i++) {
      const x = (i * 73 + 19) % 256, y = (i * 41 + 13) % 128;
      g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const r = k % 2 ? 3 : 8; if (!k) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill();
    }
  } else if (p === "spiral") {
    for (let n = 0; n < 4; n++) { g.beginPath(); for (let i = 0; i < 180; i++) { const a = i * 0.12 + n * Math.PI / 2; const r = i * 0.22; const x = 32 + n * 62 + Math.cos(a) * r; const y = 64 + Math.sin(a) * r; if (!i) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  } else if (p === "runes") {
    g.font = "bold 26px sans-serif"; g.textAlign = "center";
    for (let i = 0; i < 12; i++) g.fillText(["◇", "△", "⌁", "✦"][i % 4], 16 + (i % 6) * 44, 24 + Math.floor(i / 6) * 62);
  } else {
    for (let i = 0; i < 9; i++) { g.globalAlpha = 0.35; g.beginPath(); g.arc((i * 47 + 21) % 256, (i * 31 + 18) % 128, 10 + (i % 3) * 5, 0, Math.PI * 2); g.fill(); }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBall(def: BallDef): THREE.Group {
  const group = new THREE.Group();
  const id = def.id.toLowerCase();
  const shape =
    id.includes("lucky_die") ? "die" :
    id.includes("aegis") ? "shield" :
    id.includes("glass_hail") || id.includes("prism") ? "crystal" :
    id.includes("halo") || id.includes("coil") ? "ringed" :
    id.includes("hook") || id.includes("last_knife") ? "horned" :
    id.includes("swarm") ? "spiky" : def.visual.shape;

  let geo: THREE.BufferGeometry;
  if (shape === "die") geo = new THREE.BoxGeometry(1.55, 1.55, 1.55, 2, 2, 2);
  else if (shape === "crystal") geo = new THREE.OctahedronGeometry(1, 0);
  else if (shape === "faceted") geo = new THREE.DodecahedronGeometry(1, 0);
  else if (shape === "shield") geo = new THREE.IcosahedronGeometry(0.96, 0);
  else if (shape === "spiky") geo = new THREE.IcosahedronGeometry(1, 1);
  else geo = new THREE.SphereGeometry(1, 32, 24);

  const mat = new THREE.MeshLambertMaterial({
    map: patternTexture(def),
    color: "#ffffff",
    emissive: def.visual.accentColor,
    emissiveIntensity: def.visual.emissive * 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);

  if (shape === "shield") {
    const shieldFace = new THREE.Mesh(new THREE.CircleGeometry(0.68, 6), new THREE.MeshBasicMaterial({
      color: def.visual.accentColor, transparent: true, opacity: 0.48, side: THREE.DoubleSide,
    }));
    shieldFace.position.z = 0.77;
    shieldFace.rotation.z = Math.PI / 6;
    group.add(shieldFace);
    const shieldEdge = new THREE.LineSegments(new THREE.EdgesGeometry(shieldFace.geometry), new THREE.LineBasicMaterial({
      color: def.visual.baseColor, transparent: true, opacity: 0.95,
    }));
    shieldEdge.position.copy(shieldFace.position);
    shieldEdge.rotation.copy(shieldFace.rotation);
    shieldEdge.scale.setScalar(1.08);
    group.add(shieldEdge);
  }

  if (shape === "ringed") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.065, 10, 48), lambert(def.visual.accentColor, def.visual.accentColor, 0.65));
    ring.userData.ballPart = "signature-orbit";
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
    const ring2 = ring.clone();
    ring2.scale.setScalar(0.78);
    ring2.rotation.set(0.9, 0.4, 0.2);
    group.add(ring2);
  }

  if (shape === "horned" || shape === "spiky" || id.includes("jolt") || id.includes("sprout")) {
    const count = shape === "spiky" ? 7 : id.includes("jolt") ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const tall = shape === "horned" || id.includes("sprout");
      const radius = shape === "spiky" ? 0.13 : 0.16;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, tall ? 0.58 : 0.42, 8),
        lambert(def.visual.accentColor, def.visual.accentColor, 0.12),
      );
      const a = (i / count) * Math.PI * 2;
      cone.position.set(
        Math.cos(a) * (shape === "spiky" ? 0.75 : 0.48),
        shape === "spiky" ? Math.sin(a) * 0.5 : 0.82,
        Math.sin(a) * (shape === "spiky" ? 0.75 : 0.48),
      );
      cone.rotation.z = shape === "spiky" ? Math.cos(a) * 0.9 : -0.7;
      cone.rotation.x = Math.sin(a) * 0.8;
      group.add(cone);
    }
  }

  if (id.includes("magma") || id.includes("boom")) {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 24, 20),
      new THREE.MeshBasicMaterial({ color: def.visual.accentColor, transparent: true, opacity: 0.55 }),
    );
    core.userData.ballPart = "magma-core";
    group.add(core);
  }

  if (id.includes("ribbon") || id.includes("web") || id.includes("serpent")) {
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.035, 8, 48), lambert(def.visual.accentColor, def.visual.accentColor, 0.5));
    orbit.userData.ballPart = "signature-orbit";
    orbit.rotation.set(0.4, 0.9, 0.7);
    group.add(orbit);
    if (id.includes("web")) {
      const orbit2 = orbit.clone(); orbit2.rotation.set(1.2, 0.25, 0.6); group.add(orbit2);
      const orbit3 = orbit.clone(); orbit3.rotation.set(0.1, 0.9, 1.3); orbit3.scale.setScalar(0.74); group.add(orbit3);
    }
  }

  if (shape === "die") {
    // Raised pips on three visible die faces make Lucky Die unmistakable at game scale.
    const pipMaterial = new THREE.MeshBasicMaterial({ color: "#111827" });
    const pipGeo = new THREE.SphereGeometry(0.075, 10, 8);
    const pipFaces: Array<[number, number, number]> = [
      [-0.24, 0.24, 0.79], [0.24, -0.24, 0.79],
      [-0.24, -0.24, 0.79], [0.24, 0.24, 0.79], [0, 0, 0.79],
      [-0.25, 0.79, -0.25], [0.25, 0.79, 0.25], [0, 0.79, 0],
      [0.79, 0.24, -0.24], [0.79, -0.24, 0.24],
    ];
    for (const [x, y, z] of pipFaces) {
      const pip = new THREE.Mesh(pipGeo, pipMaterial);
      pip.position.set(x, y, z);
      group.add(pip);
    }
  } else if (shape !== "shield") {
    const eyeMat = lambert("#1c2430");
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eyeMat);
    eye.position.set(-0.28, 0.22, 0.86);
    const eye2 = eye.clone();
    eye2.position.x = 0.28;
    group.add(eye, eye2);
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(def.visual.face === "cute" ? 0.28 : 0.36, def.visual.face === "angry" ? 0.08 : 0.1, 0.08),
      lambert(def.visual.face === "grin" || def.visual.face === "cute" ? "#1c2430" : "#3a1016"),
    );
    mouth.position.set(0, -0.18, 0.92);
    if (def.visual.face === "sleepy") mouth.scale.y = 0.4;
    group.add(mouth);
  }

  const particleMode = def.visual.particles;
  if (particleMode && particleMode !== "none") {
    const count = particleMode === "leaves" ? 4 : particleMode === "smoke" ? 5 : 6;
    const particleColor = particleMode === "snow" ? "#effaff"
      : particleMode === "leaves" ? "#8df0b4"
      : particleMode === "embers" ? "#ffb45f"
      : particleMode === "bubbles" ? "#b8f5ff"
      : particleMode === "stars" ? "#ffffff"
      : def.visual.trail.color || def.visual.accentColor;
    for (let i = 0; i < count; i++) {
      const geometry = particleMode === "leaves"
        ? new THREE.ConeGeometry(0.085, 0.24, 4)
        : particleMode === "smoke" || particleMode === "bubbles"
          ? new THREE.SphereGeometry(particleMode === "smoke" ? 0.12 : 0.075, 10, 8)
          : new THREE.OctahedronGeometry(particleMode === "embers" ? 0.065 : 0.075, 0);
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: particleColor,
        transparent: true,
        opacity: particleMode === "smoke" ? 0.22 : particleMode === "bubbles" ? 0.48 : 0.82,
        blending: particleMode === "smoke" || particleMode === "bubbles" ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(geometry, particleMaterial);
      particle.userData.ballPart = "aura-particle";
      particle.userData.auraIndex = i;
      particle.userData.auraCount = count;
      particle.userData.auraRadius = 1.13 + (i % 2) * 0.18;
      particle.userData.auraSpeed = particleMode === "smoke" ? 0.8 : particleMode === "leaves" ? 1.25 : 1.9;
      particle.position.set(Math.cos(i / count * Math.PI * 2) * 1.15, Math.sin(i * 1.7) * 0.35, Math.sin(i / count * Math.PI * 2) * 1.15);
      group.add(particle);
    }
  }

  const trailLength = Math.max(0, Math.min(1.5, def.visual.trail.length));
  if (trailLength >= 0.65) {
    const trailMaterial = new THREE.MeshBasicMaterial({
      color: def.visual.trail.color || def.visual.accentColor,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailRing = new THREE.Mesh(new THREE.TorusGeometry(0.98 + trailLength * 0.15, 0.022 + trailLength * 0.012, 5, 36), trailMaterial);
    trailRing.userData.ballPart = "trail-orbit";
    trailRing.rotation.set(0.65, 0.25, 0.9);
    trailRing.scale.set(1.08, 0.78, 1);
    group.add(trailRing);
  }

  group.userData.defId = def.id;
  group.userData.signature = shape;
  return group;
}

function makeEntityVisual(def: BallDef, kind: number): THREE.Group {
  const group = new THREE.Group();
  const accent = def.visual.accentColor || "#67e8f9";
  const base = def.visual.baseColor || "#e2e8f0";
  const glow = new THREE.MeshLambertMaterial({ color: base, emissive: accent, emissiveIntensity: 0.9 });
  const bright = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });

  if (kind === 3) {
    // Projectile: compact crystal core with a luminous propulsion halo, never a miniature face-ball.
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), glow);
    core.rotation.set(0.3, 0.4, 0.1);
    group.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.83, 0.045, 6, 24), bright);
    halo.rotation.set(Math.PI / 2, 0.35, 0.15);
    group.add(halo);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 7), bright);
    tail.position.z = -0.82;
    tail.rotation.x = -Math.PI / 2;
    group.add(tail);
  } else if (kind === 4) {
    // Ground hazard: low glowing zone plus an animated rim.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 36),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.17, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.018;
    group.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.055, 7, 44), bright);
    ring.rotation.x = Math.PI / 2;
    ring.userData.ballPart = "zone-rim";
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 5, 36), bright.clone());
    inner.rotation.x = Math.PI / 2;
    inner.userData.ballPart = "zone-inner";
    group.add(inner);
  } else if (kind === 5) {
    // Turret: anchored six-sided plinth, rotating head and short barrel.
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.24, 6), glow);
    baseMesh.position.y = 0.12;
    group.add(baseMesh);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), glow);
    head.position.y = 0.48;
    group.add(head);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.62, 8), bright);
    barrel.position.set(0, 0.48, 0.48);
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);
    const optic = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
    optic.position.set(0, 0.5, 0.26);
    group.add(optic);
  } else if (kind === 6) {
    // Orbiter: tiny faceted satellite enclosed by its own gyroscopic ring.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.68, 1), glow);
    group.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.055, 7, 30), bright);
    ring.rotation.set(Math.PI / 2.5, 0.35, 0.1);
    group.add(ring);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    tip.position.set(0.94, 0, 0);
    ring.add(tip);
  } else if (kind === 7) {
    // Summoned minion: a small independent drone silhouette, unlike the owner's main ball.
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.76, 1), glow);
    group.add(shell);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
    eye.position.set(0, 0.08, 0.66);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: accent }));
    pupil.position.set(0, 0.08, 0.81);
    group.add(pupil);
    for (let side = -1; side <= 1; side += 2) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.46, 6), bright);
      wing.position.set(side * 0.77, -0.02, 0);
      wing.rotation.z = side * Math.PI / 2;
      group.add(wing);
      const stabilizer = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 16), bright.clone());
      stabilizer.position.set(side * 0.87, 0, 0);
      stabilizer.rotation.y = Math.PI / 2;
      stabilizer.userData.ballPart = "signature-orbit";
      group.add(stabilizer);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 6), bright);
    tail.position.z = -0.55;
    tail.rotation.x = Math.PI / 2;
    group.add(tail);
  } else {
    return makeBall(def);
  }

  group.userData.defId = def.id;
  group.userData.entityKind = kind;
  return group;
}

function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grd.addColorStop(0, "rgba(0,0,0,0.45)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
  lobby = new THREE.Group();
  arena = new THREE.Group();
  player: Rig;
  crowd: Rig[] = [];
  pads: THREE.Mesh[] = [];
  ballGroups: THREE.Group[] = [];
  private ballMatCache = new Map<string, THREE.Group>();
  private blob: THREE.Mesh;
  private blobs: THREE.Mesh[] = [];
  private activeEffects: LiveFx[] = [];
  private seenFxKeys = new Set<string>();
  private seenFxQueue: string[] = [];
  private trailGeometry!: THREE.IcosahedronGeometry;
  private trailPool: TrailParticle[] = [];
  private trailCursor = 0;
  private lastTrailPosition = new Map<number, { x: number; y: number }>();
  private impactShake = 0;
  private specTex: THREE.CanvasTexture;
  private specCanvas: HTMLCanvasElement;
  private aimLine: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private key: THREE.DirectionalLight;
  private dpr = 1;
  private frameMs = 16;
  quality: "low" | "medium" | "high" = "medium";
  auto = true;
  host: HTMLElement;
  private clock = 0;
  finisherBall = new THREE.Vector3();

  constructor(host: HTMLElement) {
    this.host = host;
    const canvas = document.createElement("canvas");
    canvas.className = "gl";
    host.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#79c7ff");
    this.scene.fog = new THREE.Fog("#9fd4ff", 28, 70);
    this.scene.add(new THREE.HemisphereLight("#fff4e5", "#6aa8d8", 1.15));
    this.key = new THREE.DirectionalLight("#fff7ee", 1.25);
    this.key.position.set(12, 22, 8);
    this.scene.add(this.key);
    this.specCanvas = document.createElement("canvas");
    this.specCanvas.width = 256;
    this.specCanvas.height = 160;
    this.specTex = new THREE.CanvasTexture(this.specCanvas);
    this.player = makeRig({ skin: "#f3c7a1", shirt: "#ff5a36", pants: "#2f6bff", hat: "#1c2430" });
    this.player.nameTag = makeNameTag("YOU", "#67e8f9");
    this.player.nameTag.position.set(0, 2.72, 0);
    this.player.group.add(this.player.nameTag);
    this.buildLobby();
    this.buildArena();
    this.trailGeometry = new THREE.IcosahedronGeometry(0.11, 0);
    for (let i = 0; i < 44; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: "#67e8f9",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.trailGeometry, material);
      mesh.visible = false;
      this.trailPool.push({ mesh, material, age: 0, duration: 0.3, active: false, baseOpacity: 0.2, baseScale: 1 });
      this.arena.add(mesh);
    }
    this.scene.add(this.lobby, this.arena);
    this.arena.visible = false;
    const blobGeo = new THREE.CircleGeometry(1, 16);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    this.blob = new THREE.Mesh(blobGeo, blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.04;
    this.scene.add(this.blob);
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(blobGeo, blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.y = 0.04;
      this.blobs.push(b);
      this.arena.add(b);
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: "#1c2430", dashSize: 0.35, gapSize: 0.22 }));
    this.aimLine.visible = false;
    this.arena.add(this.aimLine);
    this.resize();
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    const cap = this.quality === "low" ? 1 : this.quality === "medium" ? 1.5 : 2;
    this.dpr = Math.min(cap, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
  }

  setQuality(q: "low" | "medium" | "high", auto: boolean): void {
    this.quality = q;
    this.auto = auto;
    const high = q === "high";
    this.renderer.shadowMap.enabled = high;
    this.key.castShadow = high;
    if (high) {
      this.key.shadow.mapSize.set(512, 512);
      this.key.shadow.camera.near = 2;
      this.key.shadow.camera.far = 50;
      this.key.shadow.camera.left = -18;
      this.key.shadow.camera.right = 18;
      this.key.shadow.camera.top = 18;
      this.key.shadow.camera.bottom = -18;
    }
    this.resize();
  }

  private buildLobby(): void {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 48), lambert("#f4efe4"));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.lobby.add(floor);
    const rim = new THREE.Mesh(new THREE.RingGeometry(17.2, 18.2, 48), lambert("#ffd7c8"));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    this.lobby.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshLambertMaterial({ color: "#79c7ff", emissive: "#2f6bff", emissiveIntensity: 0.25 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.05;
    water.name = "water";
    this.lobby.add(water);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3, 0.7, 20), lambert("#ffffff"));
    bowl.position.y = 0.2;
    this.lobby.add(bowl);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.1, 6), lambert("#8a5a34"));
      trunk.position.y = 0.55;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 7), lambert(i % 2 ? "#3ecf8e" : "#2f9e68"));
      leaf.position.y = 1.7;
      tree.add(trunk, leaf);
      tree.position.set(Math.cos(ang) * 15.2, 0, Math.sin(ang) * 15.2);
      this.lobby.add(tree);
    }
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2 + (i % 3) * 0.4, 2 + (i % 5), 1.2), lambert(i % 2 ? "#d7e6f5" : "#f7d7cc"));
      const a = (i / 18) * Math.PI * 2;
      b.position.set(Math.cos(a) * 26, 1 + (i % 5) * 0.4, Math.sin(a) * 26);
      this.lobby.add(b);
    }
    const padGeo = new THREE.CylinderGeometry(1.25, 1.35, 0.18, 18);
    const spots: [number, number, string][] = [
      [-6.2, -7.4, "#2f6bff"],
      [-2.1, -9.2, "#2f6bff"],
      [2.1, -9.2, "#2f6bff"],
      [6.2, -7.4, "#2f6bff"],
      [9.4, 1.2, "#c5ced8"],
      [-9.4, 1.2, "#f5b942"],
    ];
    for (const [x, z, color] of spots) {
      const m = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      m.position.set(x, 0.1, z);
      this.pads.push(m);
      this.lobby.add(m);
    }
    const kioskGeo = new THREE.BoxGeometry(1.8, 1.5, 1.2);
    const kiosks: [number, number, string][] = [
      [-7.2, 5.6, "#ff5a36"],
      [7.2, 5.6, "#5b8cff"],
      [0, 8.2, "#f5b942"],
      [-4.5, 2.2, "#ffffff"],
    ];
    for (const [x, z, color] of kiosks) {
      const k = new THREE.Mesh(kioskGeo, lambert(color));
      k.position.set(x, 0.75, z);
      this.lobby.add(k);
      const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 1.4), lambert("#1c2430"));
      top.position.set(x, 1.6, z);
      this.lobby.add(top);
    }
    for (let i = 0; i < 8; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.35), lambert("#ffffff"));
      step.position.set(0, 0.05, 11 - i * 1.5);
      step.rotation.y = i % 2 ? 0.4 : -0.4;
      this.lobby.add(step);
    }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), new THREE.MeshBasicMaterial({ map: this.specTex }));
    screen.position.set(0, 3.2, -12.5);
    this.lobby.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 0.2), lambert("#1c2430"));
    frame.position.set(0, 3.2, -12.7);
    this.lobby.add(frame);
    this.lobby.add(this.player.group);
    for (let i = 0; i < 5; i++) {
      const rig = makeRig({
        skin: "#f3c7a1",
        shirt: ["#5b8cff", "#3ecf8e", "#f5b942", "#ff5a36", "#1c2430"][i],
        pants: "#243044",
        hat: i % 2 ? "#ff5a36" : "#1c2430",
      });
      this.crowd.push(rig);
      this.lobby.add(rig.group);
    }
  }

  private buildArena(): void {
    const tile = new THREE.BoxGeometry(2, 0.12, 2);
    const a = lambert("#f7f4ee");
    const b = lambert("#d9e7f5");
    const instA = new THREE.InstancedMesh(tile, a, 72);
    const instB = new THREE.InstancedMesh(tile, b, 72);
    const dummy = new THREE.Object3D();
    let ia = 0;
    let ib = 0;
    for (let x = 0; x < 12; x++) {
      for (let z = 0; z < 12; z++) {
        dummy.position.set(-11 + x * 2, 0, -11 + z * 2);
        dummy.updateMatrix();
        if ((x + z) % 2 === 0) instA.setMatrixAt(ia++, dummy.matrix);
        else instB.setMatrixAt(ib++, dummy.matrix);
      }
    }
    instA.count = ia;
    instB.count = ib;
    instA.receiveShadow = true;
    instB.receiveShadow = true;
    this.arena.add(instA, instB);
    const wallGeo = new THREE.BoxGeometry(24, 1.7, 0.45);
    const wallZ = new THREE.Mesh(wallGeo, lambert("#f4fbff"));
    wallZ.position.set(0, 0.85, -12);
    const wallZ2 = wallZ.clone();
    wallZ2.position.z = 12;
    const wallX = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.7, 24), lambert("#f4fbff"));
    wallX.position.set(-12, 0.85, 0);
    const wallX2 = wallX.clone();
    wallX2.position.x = 12;
    this.arena.add(wallZ, wallZ2, wallX, wallX2);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(24.4, 0.8, 24.4),
      new THREE.MeshLambertMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.18 }),
    );
    glass.position.y = 2.2;
    this.arena.add(glass);
    for (const [x, z, color] of [
      [0, 13.4, "#2f6bff"],
      [0, -13.4, "#ff3b5c"],
    ] as const) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.45, 16), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 }));
      ped.position.set(x, 0.22, z);
      this.arena.add(ped);
    }
    const stand = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.7, 0.35), lambert("#ffd7c8"), 36);
    let s = 0;
    for (let i = 0; i < 18; i++) {
      dummy.position.set(-10 + i * 1.2, 0.4, -15.2);
      dummy.updateMatrix();
      stand.setMatrixAt(s++, dummy.matrix);
      dummy.position.z = 15.2;
      dummy.updateMatrix();
      stand.setMatrixAt(s++, dummy.matrix);
    }
    this.arena.add(stand);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), lambert("#1c2430"));
    pole.position.set(-13.5, 3, -13.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshLambertMaterial({ color: "#fff4c8", emissive: "#f5b942", emissiveIntensity: 0.8 }));
    lamp.position.set(-13.5, 6, -13.5);
    this.arena.add(pole, lamp);
  }

  ballGroup(def: BallDef | null, index: number, kind = 1): THREE.Group | null {
    if (!def) return null;
    const poolKey = `${def.id}:${kind}`;
    let template = this.ballMatCache.get(poolKey);
    if (!template) {
      template = kind >= 3 && kind <= 6 ? makeEntityVisual(def, kind) : makeBall(def);
      template.userData.poolKey = poolKey;
      this.ballMatCache.set(poolKey, template);
    }
    while (this.ballGroups.length <= index) {
      const clone = template.clone(true);
      clone.userData.poolKey = poolKey;
      this.ballGroups.push(clone);
      this.arena.add(clone);
    }
    const current = this.ballGroups[index];
    if (current.userData.poolKey !== poolKey) {
      this.arena.remove(current);
      const clone = template.clone(true);
      clone.userData.poolKey = poolKey;
      this.ballGroups[index] = clone;
      this.arena.add(clone);
    }
    return this.ballGroups[index];
  }

  groundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    _v.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = _v.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -this.camera.position.y / dir.y;
    if (t < 0) return null;
    return { x: this.camera.position.x + dir.x * t, z: this.camera.position.z + dir.z * t };
  }

  update(dt: number, draw: DrawState): void {
    this.clock += dt;
    this.impactShake = Math.max(0, this.impactShake - dt * 0.85);
    const t0 = performance.now();
    this.lobby.visible = draw.mode === "lobby";
    this.arena.visible = draw.mode === "arena";
    this.player.group.position.set(draw.px, 0, draw.pz);
    this.player.group.rotation.y = draw.face;
    const shirt = this.player.torso.material as THREE.MeshLambertMaterial;
    if (shirt.color.getStyle() !== draw.colors.shirt) shirt.color.set(draw.colors.shirt);
    tickRig(this.player, dt, draw.moving, draw.emote);
    this.updateNameTagFacing(this.player);
    for (let i = 0; i < this.crowd.length; i++) {
      const b = draw.bots[i];
      const rig = this.crowd[i];
      if (!b) {
        rig.group.visible = false;
        continue;
      }
      rig.group.visible = true;
      rig.group.position.set(b.x, 0, b.z);
      rig.group.rotation.y = b.yaw;
      if (b.name && !rig.nameTag) {
        rig.nameTag = makeNameTag(b.name, b.shirt);
        rig.nameTag.position.set(0, 2.75, 0);
        rig.group.add(rig.nameTag);
      }
      tickRig(rig, dt, b.moving, b.emote ? "wave" : "");
      this.updateNameTagFacing(rig);
    }
    const water = this.lobby.getObjectByName("water");
    if (water) water.position.y = 0.05 + Math.sin(this.clock * 2) * 0.03;
    if (draw.mode === "lobby") {
      const dist = 7.2;
      const fx = -Math.sin(draw.camYaw);
      const fz = -Math.cos(draw.camYaw);
      const desiredX = draw.px - fx * dist;
      const desiredZ = draw.pz - fz * dist;
      this.camera.position.x += (desiredX - this.camera.position.x) * (1 - Math.exp(-4 * dt));
      this.camera.position.y += (4.6 - this.camera.position.y) * (1 - Math.exp(-4 * dt));
      this.camera.position.z += (desiredZ - this.camera.position.z) * (1 - Math.exp(-4 * dt));
      this.camera.lookAt(draw.px, 1.3, draw.pz);
      this.paintSpectate(draw.spectate);
      this.aimLine.visible = false;
      for (const g of this.ballGroups) g.visible = false;
    } else {
      this.layoutArena(draw, dt);
    }
    this.updateCombatEffects(draw.effects, dt);
    this.updateBattleTrails(draw, dt);
    this.updateCombatEffects(draw.effects, dt);
    this.renderer.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    if (this.auto && this.frameMs > 22 && this.quality !== "low") {
      this.quality = this.frameMs > 28 ? "low" : "medium";
      this.setQuality(this.quality, true);
    }
  }

  private updateBattleTrails(draw: DrawState, dt: number): void {
    if (draw.mode !== "arena") {
      this.lastTrailPosition.clear();
      for (const particle of this.trailPool) {
        particle.active = false;
        particle.mesh.visible = false;
        particle.material.opacity = 0;
      }
      return;
    }

    const currentIds = new Set<number>();
    for (const entity of draw.ents) {
      // Keep a readable trail on the two fighter balls and moving shots only; zones and minions stay uncluttered.
      if (entity.kind !== 1 && entity.kind !== 3) continue;
      const def = entity.owner === 1 ? draw.ballB : draw.ballA;
      if (!def) continue;
      const trailLength = Math.max(0, Math.min(1.5, def.visual.trail.length));
      if (trailLength < 0.08) continue;
      currentIds.add(entity.id);
      const previous = this.lastTrailPosition.get(entity.id);
      if (previous) {
        const moved = Math.hypot(entity.x - previous.x, entity.y - previous.y);
        const threshold = entity.kind === 3 ? 0.1 : Math.max(0.1, entity.r * 0.16);
        if (moved > threshold) {
          const particle = this.trailPool[this.trailCursor % this.trailPool.length];
          this.trailCursor += 1;
          particle.active = true;
          particle.age = 0;
          particle.duration = Math.max(0.16, Math.min(0.7, 0.15 + trailLength * 0.38));
          particle.baseOpacity = entity.kind === 3 ? 0.24 : 0.12 + trailLength * 0.12;
          particle.material.color.set(def.visual.trail.color || def.visual.accentColor);
          particle.material.opacity = particle.baseOpacity;
          particle.mesh.position.set(previous.x, Math.max(0.2, entity.r * 0.82), -previous.y);
          particle.baseScale = Math.max(0.48, entity.r * (0.72 + trailLength * 0.42));
          particle.mesh.scale.set(particle.baseScale, particle.baseScale, particle.baseScale * 1.7);
          particle.mesh.rotation.set(0, Math.atan2(entity.y - previous.y, entity.x - previous.x), Math.random() * 0.18);
          particle.mesh.visible = true;
        }
      }
      this.lastTrailPosition.set(entity.id, { x: entity.x, y: entity.y });
    }
    for (const id of this.lastTrailPosition.keys()) {
      if (!currentIds.has(id)) this.lastTrailPosition.delete(id);
    }
    for (const particle of this.trailPool) {
      if (!particle.active) continue;
      particle.age += dt;
      const progress = Math.min(1, particle.age / particle.duration);
      particle.material.opacity = particle.baseOpacity * (1 - progress) * (1 - progress);
      const scale = Math.max(0.015, particle.baseScale * (1 - progress));
      particle.mesh.scale.set(scale, scale, scale * 1.7);
      particle.mesh.rotation.x += dt * 3.2;
      particle.mesh.rotation.y += dt * 4.4;
      if (progress >= 1) {
        particle.active = false;
        particle.mesh.visible = false;
        particle.material.opacity = 0;
      }
    }
  }

  private updateCombatEffects(events: FrameFx[], dt: number): void {
    for (const event of events) {
      if (this.seenFxKeys.has(event.key)) continue;
      this.seenFxKeys.add(event.key);
      this.seenFxQueue.push(event.key);
      if (event.type === 3) this.impactShake = Math.max(this.impactShake, 0.22);
      else if (event.type === 1 && event.magnitude >= 8) this.impactShake = Math.max(this.impactShake, 0.095);
      else if (event.type === 2) this.impactShake = Math.max(this.impactShake, 0.04);
      if (this.seenFxQueue.length > 96) {
        const expiredKey = this.seenFxQueue.shift();
        if (expiredKey) this.seenFxKeys.delete(expiredKey);
      }
      const color = event.color || (event.type === 3 ? "#ff9b55"
        : event.type === 4 ? "#86f7c5"
        : event.type === 5 ? "#c4b5fd"
        : event.type === 2 ? "#dbeafe"
        : event.type === 13 ? "#fb7185"
        : event.type === 14 ? "#a5f3fc"
        : event.type === 15 ? "#c4b5fd"
        : event.owner === 1 ? "#fb7185" : "#67e8f9");
      const group = new THREE.Group();
      group.position.set(event.x, 0.13, -event.y);
      group.renderOrder = 5;
      const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const ringRadius = event.type === 8 ? 0.82 : event.type === 9 ? 0.74 : event.type === 13 ? 0.88 : event.type === 15 ? 1.25 : 0.62;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, event.type === 8 ? 0.05 : 0.035, 8, 40), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = Math.random() * 0.6;
      group.add(ring);
      let ring2: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | undefined;
      if ([8, 9, 12, 13, 14, 15].includes(event.type)) {
        ring2 = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 0.72, 0.022, 6, 32), ringMaterial.clone());
        ring2.rotation.x = Math.PI / 2;
        ring2.rotation.z = ring.rotation.z + 0.8;
        group.add(ring2);
      }
      const coreMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), coreMaterial);
      core.position.y = 0.08;
      core.visible = ![6, 7, 8, 9, 10, 11, 12].includes(event.type);
      if ([6, 7, 10, 11].includes(event.type)) ring.visible = false;
      group.add(core);
      let shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | undefined;
      if (event.type === 9 || event.type === 14) {
        shell = new THREE.Mesh(
          new THREE.SphereGeometry(0.86, 20, 14),
          new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        shell.position.y = 0.45;
        shell.scale.set(1, 0.95, 1);
        group.add(shell);
      }
      const particles: THREE.Mesh[] = [];
      const particleCount = event.type === 13 ? 12 : event.type === 15 ? 4 : 7;
      for (let i = 0; i < particleCount; i++) {
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const particle = new THREE.Mesh(new THREE.OctahedronGeometry(0.075 + Math.random() * 0.04, 0), material);
        particle.userData.angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.3;
        particle.userData.speed = 1.2 + Math.random() * 1.6;
        particle.position.y = 0.1 + Math.random() * 0.16;
        group.add(particle);
        particles.push(particle);
      }
      let line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined;
      if ([6, 7, 10, 11, 15].includes(event.type) && (Math.abs(event.x2 - event.x) + Math.abs(event.y2 - event.y) > 0.08)) {
        const dx = event.x2 - event.x;
        const dz = -(event.y2 - event.y);
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const segments = event.type === 10 || event.type === 15 ? 10 : event.type === 6 ? 5 : event.type === 11 ? 2 : 1;
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const wiggle = (event.type === 10 || event.type === 6 || event.type === 15) && i > 0 && i < segments ? Math.sin(i * 2.4 + this.clock * 16) * (event.type === 6 ? 0.12 : event.type === 15 ? 0.3 : 0.17) : 0;
          points.push(new THREE.Vector3(dx * t - (dz / length) * wiggle, 0.38 + Math.random() * 0.035, dz * t + (dx / length) * wiggle));
        }
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, linewidth: 2, blending: THREE.AdditiveBlending, depthWrite: false });
        line = new THREE.Line(lineGeo, lineMat);
        group.add(line);
      }
      this.arena.add(group);
      const duration = event.type === 3 ? 0.72 : event.type === 4 ? 0.66
        : event.type === 7 ? 0.34 : event.type === 10 ? 0.43
        : event.type === 8 ? 0.96 : event.type === 9 ? 0.78
        : event.type === 11 ? 0.34 : event.type === 12 ? 0.62
        : event.type === 13 ? 0.68 : event.type === 14 ? 0.72 : event.type === 15 ? 0.58
        : event.type === 6 ? 0.46 : 0.48;
      this.activeEffects.push({ key: event.key, type: event.type, magnitude: event.magnitude, group, ring, ring2, shell, core, particles, line, age: 0, duration });
      if (this.activeEffects.length > 32) this.removeCombatEffect(0);
    }
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const fx = this.activeEffects[i];
      fx.age += dt;
      const p = Math.min(1, fx.age / fx.duration);
      const ease = 1 - (1 - p) * (1 - p);
      const maxSize = fx.type === 8 ? Math.min(4.2, 1.8 + fx.magnitude * 0.35) : fx.type === 9 ? 1.75 : fx.type === 12 ? 2.35 : fx.type === 11 ? 1.35 : fx.type === 6 ? 1.9 : 1.65;
      const startSize = fx.type === 9 ? 0.86 : fx.type === 13 ? 1.0 : 0.22;
      fx.ring.scale.setScalar(fx.type === 15 ? 1.7 - ease * 1.25 : startSize + ease * (maxSize - startSize));
      fx.ring.rotation.z += dt * (fx.type === 12 ? 2.4 : 1.2 + p * 2);
      fx.ring.material.opacity = (1 - p) * 0.82;
      if (fx.ring2) {
        fx.ring2.scale.setScalar(fx.type === 15 ? 1.3 - ease * 0.9 : startSize + ease * (maxSize * 0.78 - startSize));
        fx.ring2.rotation.z -= dt * 1.7;
        fx.ring2.material.opacity = (1 - p) * 0.55;
      }
      if (fx.line) fx.line.material.opacity = Math.max(0, 1 - p);
      if (fx.shell) {
        fx.shell.scale.setScalar(fx.type === 14 ? 0.55 + p * 0.9 : 0.65 + p * 1.55);
        fx.shell.rotation.y += dt * 1.25;
        fx.shell.rotation.x += dt * 0.4;
        fx.shell.material.opacity = Math.max(0, 0.7 * (1 - p));
      }
      const coreScale = p < 0.22 ? 0.35 + p * 3.4 : Math.max(0.02, 1.1 - p);
      fx.core.scale.setScalar(coreScale);
      fx.core.rotation.x += dt * 2.8;
      fx.core.rotation.y += dt * 3.4;
      fx.core.material.opacity = Math.max(0, 1 - p * 1.3);
      for (const particle of fx.particles) {
        const a = particle.userData.angle as number;
        const speed = particle.userData.speed as number;
        const radius = p * speed;
        particle.position.x = Math.cos(a) * radius;
        particle.position.z = Math.sin(a) * radius;
        particle.position.y = 0.1 + Math.sin(p * Math.PI) * 0.22 + p * 0.15;
        particle.rotation.x += dt * 5;
        particle.rotation.y += dt * 6;
        (particle.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - p));
      }
      if (p >= 1) this.removeCombatEffect(i);
    }
  }

  private removeCombatEffect(index: number): void {
    const [fx] = this.activeEffects.splice(index, 1);
    if (!fx) return;
    this.arena.remove(fx.group);
    fx.ring.geometry.dispose();
    fx.ring.material.dispose();
    if (fx.ring2) {
      fx.ring2.geometry.dispose();
      fx.ring2.material.dispose();
    }
    if (fx.line) {
      fx.line.geometry.dispose();
      fx.line.material.dispose();
    }
    if (fx.shell) {
      fx.shell.geometry.dispose();
      fx.shell.material.dispose();
    }
    fx.core.geometry.dispose();
    fx.core.material.dispose();
    for (const particle of fx.particles) {
      particle.geometry.dispose();
      (particle.material as THREE.Material).dispose();
    }
  }

  private updateNameTagFacing(rig: Rig): void {
    if (!rig.nameTag) return;
    const parentRotation = new THREE.Quaternion();
    rig.group.getWorldQuaternion(parentRotation);
    rig.nameTag.quaternion.copy(parentRotation.invert().multiply(this.camera.quaternion));
    rig.nameTag.visible = this.lobby.visible;
  }

  private layoutArena(draw: DrawState, dt: number): void {
    for (const g of this.ballGroups) g.visible = false;
    const defs = [draw.ballA, draw.ballB];
    let shown = 0;
    if (draw.ents.length === 0 && (draw.ballA || draw.ballB)) {
      const spots = [
        { x: 0, y: -CONFIG.spawnY, r: draw.ballA?.stats.radius ?? 1, owner: 0 },
        { x: 0, y: CONFIG.spawnY, r: draw.ballB?.stats.radius ?? 1, owner: 1 },
      ];
      for (const s of spots) {
        const def = defs[s.owner];
        const g = this.ballGroup(def, shown);
        if (!g || !def) continue;
        g.visible = true;
        g.position.set(s.x, s.r, -s.y);
        g.scale.setScalar(s.r);
        shown++;
      }
    }
    for (const e of draw.ents) {
      const def = e.owner === 1 ? draw.ballB : draw.ballA;
      const g = this.ballGroup(def ?? draw.ballA, shown, e.visualKind ?? e.kind);
      if (!g) continue;
      g.visible = true;
      let x = e.x;
      let y = e.y;
      if (draw.finisher > 0 && draw.winner >= 0 && e.id === draw.winner) {
        const tz = draw.winner === 0 ? -13.2 : 13.2;
        x = e.x * (1 - draw.finisher);
        y = e.y * (1 - draw.finisher) + (draw.winner === 0 ? CONFIG.spawnY + 4 : -CONFIG.spawnY - 4) * draw.finisher;
        void tz;
      }
      g.position.set(x, e.kind === 4 ? 0.1 : Math.max(0.3, e.r), -y);
      const entityScale = Math.max(0.25, e.r);
      const entityPhase = this.clock * (e.kind === 3 ? 7.5 : e.kind === 6 ? 2.4 : 1.4);
      const pulse = e.kind === 3 ? 1 + Math.sin(entityPhase) * 0.075 : e.kind === 4 ? 1 + Math.sin(entityPhase * 0.55) * 0.045 : 1;
      g.scale.setScalar(entityScale * pulse);
      const ballId = String(def?.id ?? g.userData.defId ?? "");
      g.rotation.y += dt * (e.kind === 3 ? (e.owner === 0 ? 4.2 : -4.2) : e.kind === 6 ? 2.5 : (e.owner === 0 ? 1.4 : -1.4));
      if (ballId.includes("lucky_die")) { g.rotation.x += dt * 1.1; g.rotation.z += dt * 0.7; }
      else if (ballId.includes("prism") || ballId.includes("glass_hail")) { g.rotation.x = Math.sin(this.clock * 1.5) * 0.14; g.rotation.z = Math.cos(this.clock * 1.2) * 0.1; }
      else if (ballId.includes("aegis")) { g.rotation.z = Math.sin(this.clock * 1.2) * 0.18; }
      for (const part of g.children) {
        if (part.userData.ballPart === "signature-orbit") { part.rotation.y += dt * 1.1; part.rotation.x += dt * 0.55; }
        if (part.userData.ballPart === "trail-orbit") { part.rotation.y += dt * 0.75; part.rotation.z -= dt * 0.35; }
        if (part.userData.ballPart === "magma-core") {
          const corePulse = 0.9 + Math.sin(this.clock * 5.4) * 0.12;
          part.scale.set(corePulse, corePulse, corePulse);
        }
        if (part.userData.ballPart === "aura-particle") {
          const angle = this.clock * (part.userData.auraSpeed as number) + (part.userData.auraIndex as number) / (part.userData.auraCount as number) * Math.PI * 2;
          const radius = part.userData.auraRadius as number;
          part.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.35 + (part.userData.auraIndex as number)) * 0.42, Math.sin(angle) * radius);
          const pulse = 0.78 + (Math.sin(angle * 1.8) + 1) * 0.16;
          part.scale.setScalar(pulse);
          part.rotation.x += dt * 1.3;
          part.rotation.y += dt * 1.8;
        }
      }
      if (e.kind === 3) {
        g.rotation.x += dt * 1.8;
      } else if (e.kind === 4) {
        g.rotation.z = Math.sin(this.clock * 1.2 + e.id) * 0.07;
      } else if (e.visualKind === 7) {
        g.rotation.x = Math.sin(this.clock * 2.8 + e.id) * 0.12;
        g.rotation.z = Math.sin(this.clock * 3.1 + e.id) * 0.08;
      }
      if (shown < this.blobs.length) {
        this.blobs[shown].visible = true;
        this.blobs[shown].position.set(x, 0.05, -y);
        this.blobs[shown].scale.setScalar(e.r * 1.3);
      }
      shown++;
      if (shown > 24) break;
    }
    for (let i = shown; i < this.blobs.length; i++) this.blobs[i].visible = false;
    const showArrow = draw.arrow !== null && Boolean(draw.ballA);
    this.aimLine.visible = showArrow;
    if (showArrow && draw.arrow !== null) {
      const ang = draw.arrow;
      const x = 0;
      const y = -CONFIG.spawnY;
      const prev = previewAim(x, y, Math.cos(ang), Math.sin(ang), CONFIG.arenaHalf, draw.ballA?.stats.radius ?? 1);
      const pos = this.aimLine.geometry.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, x, 0.4, -y);
      pos.setXYZ(1, prev.x2, 0.4, -prev.y2);
      pos.setXYZ(2, prev.x3, 0.4, -prev.y3);
      pos.needsUpdate = true;
      this.aimLine.computeLineDistances();
    }
    const shake = Math.max(draw.shake, this.impactShake);
    const sx = Math.sin(this.clock * 40) * shake;
    const sz = Math.cos(this.clock * 33) * shake;
    if (draw.aimDrag > 0.5) {
      this.camera.position.set(sx, 30, 6 + sz);
      this.camera.lookAt(0, 0, -1);
    } else {
      this.camera.position.set(sx, 22, 16 + sz);
      this.camera.lookAt(0, 0, 0);
    }
    this.blob.visible = false;
  }

  private paintSpectate(s: DrawState["spectate"]): void {
    if (!s) return;
    const g = this.specCanvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#e7f3ff";
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = "#1c2430";
    g.strokeRect(18, 14, 220, 132);
    const map = (x: number, y: number) => [128 + x * 8, 80 - y * 5];
    const A = map(s.ax, s.ay);
    const B = map(s.bx, s.by);
    g.fillStyle = "#2f6bff";
    g.beginPath();
    g.arc(A[0], A[1], 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff3b5c";
    g.beginPath();
    g.arc(B[0], B[1], 8, 0, Math.PI * 2);
    g.fill();
    this.specTex.needsUpdate = true;
  }

  destroy(): void {
    this.trailGeometry.dispose();
    for (const particle of this.trailPool) particle.material.dispose();
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}
