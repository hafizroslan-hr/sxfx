/**
 * Pure game rules: save model, stats, progression, battle math.
 * Nothing here touches React Native, so it is unit-testable in Node.
 */
import {
  AREAS,
  AreaDef,
  CoreId,
  EVO_COST,
  LINES,
  LineId,
  STAGE_LEVEL,
  STAGE_MUL,
  STAGE_ORDER,
  ShellId,
  Stage,
  creature,
} from './data';
import { Rng, clamp, pick } from './rng';

export const SAVE_VERSION = 1;
export const MAX_ENERGY = 100;
export const STEPS_PER_ENERGY = 10;
export const ENCOUNTER_COOLDOWN = 40;
export const MAX_LEVEL = 30;
/** Shakes inside the 3 s window that count as a "full" swing. */
export const SHAKE_FULL = 18;
export const SHAKE_WINDOW_MS = 3000;

export interface Pending {
  kind: 'wild' | 'boss';
  enemy: string;
}

export interface Settings {
  shell: ShellId;
  muted: boolean;
  shakeSteps: boolean;
}

export interface SaveData {
  v: number;
  line: LineId | null;
  level: number;
  xp: number;
  baseHp: number;
  baseAp: number;
  wins: number;
  losses: number;
  totalSteps: number;
  energy: number;
  /** Steps accumulated toward the next energy point. */
  energyFrac: number;
  area: number;
  /** How many times the full map has been cleared (scales difficulty). */
  loop: number;
  areaSteps: number;
  sinceEncounter: number;
  pending: Pending | null;
  cores: CoreId[];
  allies: LineId[];
  settings: Settings;
  /** Last time step data was synced (ms epoch) – used for iOS catch-up. */
  lastSeen: number | null;
}

export function newSave(settings?: Partial<Settings>): SaveData {
  return {
    v: SAVE_VERSION,
    line: null,
    level: 1,
    xp: 0,
    baseHp: 24,
    baseAp: 6,
    wins: 0,
    losses: 0,
    totalSteps: 0,
    energy: 40,
    energyFrac: 0,
    area: 1,
    loop: 0,
    areaSteps: 0,
    sinceEncounter: 0,
    pending: null,
    cores: [],
    allies: [],
    settings: { shell: 'cobalt', muted: false, shakeSteps: true, ...settings },
    lastSeen: null,
  };
}

/** Fill in any fields missing from an older save. */
export function migrate(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  return { ...base, ...r, settings: { ...base.settings, ...(r.settings ?? {}) }, v: SAVE_VERSION };
}

export const areaDef = (area: number): AreaDef => AREAS[clamp(area, 1, AREAS.length) - 1];
export const loopMul = (loop: number) => 1 + loop * 0.5;

export const xpToNext = (level: number) => 15 + level * 12;

export function partnerStats(s: SaveData, form: string) {
  const mul = STAGE_MUL[creature(form).stage];
  const hp = s.baseHp + (s.level - 1) * 4;
  const ap = s.baseAp + (s.level - 1) * 1.5;
  return { hp: Math.round(hp * mul.hp), ap: Math.round(ap * mul.ap) };
}

/** Tuned per-area enemy stats (wild); bosses are scaled up. */
const ENEMY_AP = [7, 12, 17, 23, 30, 38, 48, 62];
const ENEMY_HP = [30, 42, 58, 76, 96, 120, 150, 190];

export function enemyStats(area: number, loop: number, boss: boolean, rng: Rng) {
  const i = clamp(area, 1, ENEMY_AP.length) - 1;
  const m = loopMul(loop);
  const hp = ENEMY_HP[i] * m * (boss ? 1.6 : 1) * (0.9 + rng() * 0.2);
  const ap = ENEMY_AP[i] * m * (boss ? 1.3 : 1);
  return { hp: Math.round(hp), ap: Math.round(ap) };
}

export function rookieOf(s: SaveData): string {
  if (!s.line) throw new Error('no partner');
  return LINES[s.line].forms[0];
}

/** The standard (non-armor) next form, if the partner may reach it. */
export function nextForm(s: SaveData, form: string): { form: string; stage: Stage } | null {
  if (!s.line) return null;
  const forms = LINES[s.line].forms;
  const i = forms.indexOf(form);
  if (i < 0 || i >= 3) return null;
  const stage = STAGE_ORDER[i + 1];
  if (s.level < STAGE_LEVEL[stage]) return null;
  return { form: forms[i + 1], stage };
}

/** Armor forms available right now (only from rookie, needs the core). */
export function armorOptions(s: SaveData, form: string) {
  if (!s.line || form !== rookieOf(s)) return [];
  return LINES[s.line].armor.filter((a) => s.cores.includes(a.core));
}

export function fusionOption(s: SaveData, form: string): string | null {
  if (!s.line) return null;
  const line = LINES[s.line];
  if (form !== line.forms[1]) return null;
  if (!s.allies.includes(line.fusionWith)) return null;
  return line.fusionForm;
}

export const evoCost = (form: string) => EVO_COST[creature(form).stage];

/** Adds XP, returns number of level-ups. */
export function gainXp(s: SaveData, xp: number): number {
  let ups = 0;
  s.xp += xp;
  while (s.level < MAX_LEVEL && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    ups++;
  }
  if (s.level >= MAX_LEVEL) s.xp = Math.min(s.xp, xpToNext(s.level));
  return ups;
}

export const winXp = (area: number, boss: boolean) => Math.round((8 + 6 * area) * (boss ? 3 : 1));

export function addEnergy(s: SaveData, n: number) {
  s.energy = clamp(s.energy + n, 0, MAX_ENERGY);
}

export interface StepResult {
  encounter: Pending | null;
}

/**
 * Apply n real-world steps. Progress on the map pauses while a battle is
 * pending. At most one encounter is raised per call, so a big catch-up batch
 * (e.g. after the app was closed) can't queue a chain of fights.
 */
export function applySteps(s: SaveData, n: number, rng: Rng, mapActive: boolean): StepResult {
  n = Math.max(0, Math.floor(n));
  if (n === 0) return { encounter: null };
  s.totalSteps += n;
  s.energyFrac += n;
  addEnergy(s, Math.floor(s.energyFrac / STEPS_PER_ENERGY));
  s.energyFrac %= STEPS_PER_ENERGY;

  if (!s.line || s.pending || !mapActive) return { encounter: null };
  const area = areaDef(s.area);
  for (let i = 0; i < n; i++) {
    s.areaSteps++;
    s.sinceEncounter++;
    if (s.areaSteps >= area.distance) {
      s.areaSteps = area.distance;
      s.pending = { kind: 'boss', enemy: area.boss };
      return { encounter: s.pending };
    }
    if (s.sinceEncounter >= ENCOUNTER_COOLDOWN && rng() < area.encounterRate) {
      s.sinceEncounter = 0;
      s.pending = { kind: 'wild', enemy: pick(area.enemies, rng) };
      return { encounter: s.pending };
    }
  }
  return { encounter: null };
}

/** Rewards for clearing the current area; advances to the next one. */
export function clearArea(s: SaveData): { core?: CoreId; ally?: LineId; looped: boolean } {
  const area = areaDef(s.area);
  const out: { core?: CoreId; ally?: LineId; looped: boolean } = { looped: false };
  if (area.reward.core && !s.cores.includes(area.reward.core)) {
    s.cores.push(area.reward.core);
    out.core = area.reward.core;
  }
  if (area.reward.ally && s.line) {
    const ally = LINES[s.line].fusionWith;
    if (!s.allies.includes(ally)) {
      s.allies.push(ally);
      out.ally = ally;
    }
  }
  s.areaSteps = 0;
  s.sinceEncounter = 0;
  if (s.area >= AREAS.length) {
    s.area = 1;
    s.loop++;
    out.looped = true;
  } else s.area++;
  return out;
}

// ---------------------------------------------------------------- battle math

/** Attack power from shake count in the 3 s window. */
export function shakePower(ap: number, shakes: number) {
  const q = clamp(shakes, 0, SHAKE_FULL) / SHAKE_FULL;
  const crit = shakes >= SHAKE_FULL;
  return { power: ap * (0.6 + 0.9 * q) * (crit ? 1.5 : 1), crit };
}

export interface Clash {
  winner: 'p' | 'e' | 'tie';
  dmg: number;
  crit: boolean;
}

/** One exchange: the stronger strike lands, the weaker is deflected. */
export function resolveClash(pap: number, shakes: number, eap: number, rng: Rng): Clash {
  const sp = shakePower(pap, shakes);
  const crit = sp.crit;
  const power = sp.power * (0.85 + rng() * 0.3);
  const epow = eap * (0.7 + rng() * 0.55);
  if (crit || power > epow * 1.03) return { winner: 'p', dmg: Math.max(1, Math.round(power)), crit };
  if (epow > power * 1.03) return { winner: 'e', dmg: Math.max(1, Math.round(epow)), crit: false };
  return { winner: 'tie', dmg: 1, crit: false };
}
