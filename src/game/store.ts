import type { Lang, QualityName } from "../config";
import type { Flow } from "./session";

export type Modal = null | "store" | "inventory" | "daily" | "style" | "settings" | "admin" | "queue" | "pin";

export interface Live {
  phase: "boot" | "lobby" | Flow;
  modal: Modal;
  revision: number;
  lang: Lang;
  leftHanded: boolean;
  sound: boolean;
  haptics: boolean;
  quality: QualityName;
  coins: number;
  diamonds: number;
  fragments: number;
  xp: number;
  level: number;
  timer: number;
  timerMax: number;
  hearts: [number, number];
  hp: [number, number];
  maxHp: [number, number];
  offers: string[];
  picked: number;
  confirmed: boolean;
  oppStatus: string;
  names: [string, string];
  diff: string;
  myBall: string;
  oppBall: string | null;
  rerollCost: number;
  round: number;
  banner: string;
  endWin: boolean;
  reward: string;
  interact: string;
  queueName: string;
  pinError: boolean;
  admin: boolean;
  toast: string;
  fps: number;
  ents: number;
  debug: boolean;
  sudden: boolean;
  detail: string;
  gacha: string;
  spinning: boolean;
  tab: "balls" | "explosions" | "flyers";
  aimLocked: boolean;
  bothReady: boolean;
}

export const live: Live = {
  phase: "boot",
  modal: null,
  revision: 0,
  lang: "en",
  leftHanded: false,
  sound: true,
  haptics: true,
  quality: "auto",
  coins: 500,
  diamonds: 20,
  fragments: 0,
  xp: 0,
  level: 1,
  timer: 0,
  timerMax: 30,
  hearts: [3, 3],
  hp: [1, 1],
  maxHp: [1, 1],
  offers: [],
  picked: -1,
  confirmed: false,
  oppStatus: "choosing",
  names: ["You", ""],
  diff: "normal",
  myBall: "",
  oppBall: null,
  rerollCost: 0,
  round: 1,
  banner: "",
  endWin: false,
  reward: "",
  interact: "",
  queueName: "",
  pinError: false,
  admin: false,
  toast: "",
  fps: 60,
  ents: 0,
  debug: false,
  sudden: false,
  detail: "",
  gacha: "",
  spinning: false,
  tab: "balls",
  aimLocked: false,
  bothReady: false,
};

const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bump(): void {
  live.revision++;
  for (const fn of listeners) fn();
}

export function getRevision(): number {
  return live.revision;
}
