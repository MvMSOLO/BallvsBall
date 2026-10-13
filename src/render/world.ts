import * as THREE from "three";
import type { BallDef } from "../sim/types";
import type { FrameEnt } from "../game/session";
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
  ballA: BallDef | null;
  ballB: BallDef | null;
  arrow: number | null;
  shake: number;
  finisher: number;
  winner: -1 | 0 | 1;
  spectate: { ax: number; ay: number; bx: number; by: number } | null;
  oppColor: string;
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
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.42), lambert(c.shirt));
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.48), lambert(c.skin));
  head.position.y = 1.78;
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56), lambert(c.hat));
  hat.position.y = 2.08;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), lambert(c.shirt));
  armL.position.set(-0.5, 1.12, 0);
  armL.geometry.translate(0, -0.2, 0);
  const armR = armL.clone();
  armR.position.x = 0.5;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), lambert(c.pants));
  legL.position.set(-0.18, 0.48, 0);
  legL.geometry.translate(0, -0.15, 0);
  const legR = legL.clone();
  legR.position.x = 0.18;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lambert("#1c2430"));
  eye.position.set(-0.12, 1.8, 0.24);
  const eye2 = eye.clone();
  eye2.position.x = 0.12;
  group.add(torso, head, hat, armL, armR, legL, legR, eye, eye2);
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
  const shape = id.includes("lucky_die") ? "die" : id.includes("glass_hail") ? "crystal" : id.includes("halo") ? "ringed" : id.includes("coil") ? "ringed" : id.includes("prism") ? "crystal" : id.includes("hook") ? "horned" : id.includes("swarm") ? "spiky" : def.visual.shape;
  let geo: THREE.BufferGeometry;
  if (shape === "die") {
    geo = new THREE.BoxGeometry(1.55, 1.55, 1.55, 2, 2, 2);
    geo.translate(0, 0.04, 0);
  } else if (shape === "crystal") {
    geo = new THREE.OctahedronGeometry(1, 0);
  } else if (shape === "faceted") {
    geo = new THREE.DodecahedronGeometry(1, 0);
  } else if (shape === "spiky") {
    geo = new THREE.IcosahedronGeometry(1, 1);
  } else {
    geo = new THREE.SphereGeometry(1, 32, 24);
  }
  const mat = new THREE.MeshLambertMaterial({
    map: patternTexture(def),
    color: "#ffffff",
    emissive: def.visual.accentColor,
    emissiveIntensity: def.visual.emissive * 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  if (shape === "ringed") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.065, 10, 48), lambert(def.visual.accentColor, def.visual.accentColor, 0.65));
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
    const ring2 = ring.clone(); ring2.scale.setScalar(0.78); ring2.rotation.set(0.9, 0.4, 0.2); group.add(ring2);
  }
  if (shape === "horned" || shape === "spiky" || id.includes("jolt") || id.includes("sprout")) {
    const count = shape === "spiky" ? 7 : 3;
    for (let i = 0; i < count; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(shape === "spiky" ? 0.13 : 0.18, shape === "spiky" ? 0.42 : 0.58, 8), lambert(def.visual.accentColor, def.visual.accentColor, 0.12));
      const a = (i / count) * Math.PI * 2;
      cone.position.set(Math.cos(a) * (shape === "spiky" ? 0.75 : 0.45), shape === "spiky" ? Math.sin(a) * 0.5 : 0.82, Math.sin(a) * (shape === "spiky" ? 0.75 : 0.45));
      cone.rotation.z = shape === "spiky" ? Math.cos(a) * 0.9 : -0.7;
      cone.rotation.x = Math.sin(a) * 0.8;
      group.add(cone);
    }
  }
  if (id.includes("magma") || id.includes("boom")) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), new THREE.MeshBasicMaterial({ color: def.visual.accentColor, transparent: true, opacity: 0.55 }));
    core.scale.set(1, 1.08, 1);
    group.add(core);
  }
  if (id.includes("ribbon") || id.includes("web")) {
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.035, 6, 36), lambert(def.visual.accentColor, def.visual.accentColor, 0.5));
    orbit.rotation.set(0.4, 0.9, 0.7); group.add(orbit);
  }
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
  group.userData.defId = def.id;
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

  ballGroup(def: BallDef | null, index: number): THREE.Group | null {
    if (!def) return null;
    let g = this.ballMatCache.get(def.id);
    if (!g) {
      g = makeBall(def);
      this.ballMatCache.set(def.id, g);
    }
    while (this.ballGroups.length <= index) {
      const clone = g.clone();
      this.ballGroups.push(clone);
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
    this.renderer.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    if (this.auto && this.frameMs > 22 && this.quality !== "low") {
      this.quality = this.frameMs > 28 ? "low" : "medium";
      this.setQuality(this.quality, true);
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
      const g = this.ballGroup(def ?? draw.ballA, shown);
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
      g.position.set(x, Math.max(0.3, e.r), -y);
      g.scale.setScalar(Math.max(0.25, e.r));
      g.rotation.y += dt * (e.owner === 0 ? 1.4 : -1.4);
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
    const shake = draw.shake;
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
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}
