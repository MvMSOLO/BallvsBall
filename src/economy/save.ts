import { CONFIG, levelFromXp, type Lang, type QualityName } from "../config";

export interface AvatarLook {
  skin: string;
  shirt: string;
  pants: string;
  hat: string;
}

export interface Save {
  v: number;
  coins: number;
  diamonds: number;
  fragments: number;
  xp: number;
  owned: string[];
  explosions: string[];
  flyers: string[];
  explosion: string;
  flyer: string;
  avatar: AvatarLook;
  settings: {
    lang: Lang;
    sound: boolean;
    haptics: boolean;
    quality: QualityName;
    leftHanded: boolean;
  };
  dailyDay: string;
  streak: number;
  questDay: string;
  questPlay: number;
  questWin: number;
  questRounds: number;
  questClaimed: [boolean, boolean, boolean];
  matches: number;
  wins: number;
  packsEnabled: string[] | null;
}

const KEY = "ball-arena-save";

export const EXPLOSIONS = [
  { id: "pop_classic", name: "Classic Pop", color: "#ff5a36" },
  { id: "confetti", name: "Confetti Burst", color: "#f5b942" },
  { id: "ink", name: "Ink Splash", color: "#1c2430" },
  { id: "aurora", name: "Aurora Ring", color: "#79c7ff" },
];

export const FLYERS = [
  { id: "straight", name: "Straight Shot", color: "#ffffff" },
  { id: "spiral", name: "Spiral Flyer", color: "#5b8cff" },
  { id: "comet", name: "Comet Streak", color: "#ffd23f" },
  { id: "boomer", name: "Arc Return", color: "#3ecf8e" },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function defaultSave(): Save {
  const nav = typeof navigator === "undefined" ? "en" : navigator.language.toLowerCase();
  const lang: Lang = nav.startsWith("uz") ? "uz" : nav.startsWith("ru") ? "ru" : "en";
  return {
    v: CONFIG.saveVersion,
    coins: CONFIG.starterCoins,
    diamonds: CONFIG.starterDiamonds,
    fragments: 0,
    xp: 0,
    owned: [...CONFIG.starterBalls],
    explosions: ["pop_classic"],
    flyers: ["straight"],
    explosion: "pop_classic",
    flyer: "straight",
    avatar: { skin: "#f3c7a1", shirt: "#ff5a36", pants: "#2f6bff", hat: "#1c2430" },
    settings: { lang, sound: true, haptics: true, quality: "auto", leftHanded: false },
    dailyDay: "",
    streak: 0,
    questDay: today(),
    questPlay: 0,
    questWin: 0,
    questRounds: 0,
    questClaimed: [false, false, false],
    matches: 0,
    wins: 0,
    packsEnabled: null,
  };
}

function migrate(raw: unknown): Save {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<Save>;
  if (o.v !== 1) return base;
  return { ...base, ...o, settings: { ...base.settings, ...o.settings }, avatar: { ...base.avatar, ...o.avatar }, owned: Array.isArray(o.owned) && o.owned.length ? o.owned : base.owned };
}

export function loadSave(): Save {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return defaultSave();
    return migrate(JSON.parse(text));
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return defaultSave();
  }
}

export function writeSave(save: Save): void {
  save.v = CONFIG.saveVersion;
  const day = today();
  if (save.questDay !== day) {
    save.questDay = day;
    save.questPlay = 0;
    save.questWin = 0;
    save.questRounds = 0;
    save.questClaimed = [false, false, false];
  }
  localStorage.setItem(KEY, JSON.stringify(save));
}

export function levelOf(save: Save): number {
  return levelFromXp(save.xp);
}

export { today };
