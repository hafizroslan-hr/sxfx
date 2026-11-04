/**
 * Game content. All creatures, places and items are original to this app.
 */

export type Stage = 'rookie' | 'champion' | 'ultimate' | 'mega' | 'armor' | 'fusion';
export type Trait = 'horns' | 'ears' | 'antenna' | 'wings' | 'spikes' | 'crest';
export type LineId = 'drako' | 'mothi' | 'pippit' | 'burra' | 'lumi' | 'nekko';
export type CoreId = 'flame' | 'wind' | 'stone' | 'leaf' | 'hope' | 'light' | 'bolt';
export type ShellId = 'cobalt' | 'onyx' | 'clear' | 'ember';

export interface CreatureDef {
  id: string;
  name: string;
  stage: Stage;
  traits: Trait[];
}

export interface LineDef {
  id: LineId;
  /** rookie → champion → ultimate → mega */
  forms: [string, string, string, string];
  armor: { core: CoreId; form: string }[];
  fusionWith: LineId;
  fusionForm: string;
}

export const STAGE_ORDER: Stage[] = ['rookie', 'champion', 'ultimate', 'mega'];

export const STAGE_LABEL: Record<Stage, string> = {
  rookie: 'ROOKIE',
  champion: 'CHAMPION',
  ultimate: 'ULTIMATE',
  mega: 'MEGA',
  armor: 'ARMOR',
  fusion: 'FUSION',
};

/** Stat multipliers on the partner's base HP / AP for each form tier. */
export const STAGE_MUL: Record<Stage, { hp: number; ap: number }> = {
  rookie: { hp: 1, ap: 1 },
  champion: { hp: 1.6, ap: 1.6 },
  ultimate: { hp: 2.3, ap: 2.4 },
  mega: { hp: 3.2, ap: 3.4 },
  armor: { hp: 2.0, ap: 2.1 },
  fusion: { hp: 2.8, ap: 2.9 },
};

/** Energy cost to change form during battle. */
export const EVO_COST: Record<Stage, number> = {
  rookie: 0,
  champion: 20,
  ultimate: 30,
  mega: 45,
  armor: 25,
  fusion: 40,
};

/** Partner level required to reach a standard stage. */
export const STAGE_LEVEL: Record<Stage, number> = {
  rookie: 1,
  champion: 1,
  ultimate: 5,
  mega: 10,
  armor: 1,
  fusion: 1,
};

const c = (id: string, name: string, stage: Stage, traits: Trait[]): CreatureDef => ({
  id,
  name,
  stage,
  traits,
});

const PARTNER_CREATURES: CreatureDef[] = [
  // Drako – blue dragon pup
  c('drako', 'DRAKO', 'rookie', ['horns']),
  c('drakorn', 'DRAKORN', 'champion', ['horns', 'spikes']),
  c('drakrest', 'DRAKREST', 'ultimate', ['horns', 'wings']),
  c('drakaiser', 'DRAKAISER', 'mega', ['horns', 'wings', 'spikes']),
  c('pyrodrak', 'PYRODRAK', 'armor', ['crest', 'spikes']),
  c('voltdrak', 'VOLTDRAK', 'armor', ['antenna', 'wings']),
  // Mothi – moth larva
  c('mothi', 'MOTHI', 'rookie', ['antenna']),
  c('mothblade', 'MOTHBLADE', 'champion', ['antenna', 'spikes']),
  c('mothlance', 'MOTHLANCE', 'ultimate', ['antenna', 'wings']),
  c('mothreign', 'MOTHREIGN', 'mega', ['antenna', 'wings', 'crest']),
  c('thornmoth', 'THORNMOTH', 'armor', ['antenna', 'spikes', 'wings']),
  // Pippit – red songbird
  c('pippit', 'PIPPIT', 'rookie', ['crest']),
  c('gustrel', 'GUSTREL', 'champion', ['crest', 'wings']),
  c('galeraptor', 'GALERAPTOR', 'ultimate', ['crest', 'wings', 'spikes']),
  c('tempestrix', 'TEMPESTRIX', 'mega', ['crest', 'wings', 'horns']),
  c('skyfang', 'SKYFANG', 'armor', ['wings', 'ears']),
  // Burra – armoured burrower
  c('burra', 'BURRA', 'rookie', ['ears']),
  c('bouldon', 'BOULDON', 'champion', ['spikes']),
  c('quarrox', 'QUARROX', 'ultimate', ['spikes', 'horns']),
  c('titanorr', 'TITANORR', 'mega', ['spikes', 'horns', 'crest']),
  c('drillox', 'DRILLOX', 'armor', ['crest', 'spikes']),
  // Lumi – winged light pup
  c('lumi', 'LUMI', 'rookie', ['wings']),
  c('lumeon', 'LUMEON', 'champion', ['wings', 'ears']),
  c('seraphyn', 'SERAPHYN', 'ultimate', ['wings', 'crest']),
  c('archlumen', 'ARCHLUMEN', 'mega', ['wings', 'crest', 'horns']),
  c('halopeg', 'HALOPEG', 'armor', ['wings', 'horns']),
  // Nekko – spirit cat
  c('nekko', 'NEKKO', 'rookie', ['ears']),
  c('nekkara', 'NEKKARA', 'champion', ['ears', 'spikes']),
  c('valkyat', 'VALKYAT', 'ultimate', ['ears', 'wings']),
  c('aurelyx', 'AURELYX', 'mega', ['ears', 'wings', 'crest']),
  c('radiancat', 'RADIANCAT', 'armor', ['ears', 'crest']),
  // Fusions
  c('drakomoth', 'DRAKOMOTH', 'fusion', ['horns', 'wings', 'spikes']),
  c('skyvalis', 'SKYVALIS', 'fusion', ['ears', 'wings', 'crest']),
  c('terraluma', 'TERRALUMA', 'fusion', ['wings', 'spikes', 'horns']),
];

export const LINES: Record<LineId, LineDef> = {
  drako: {
    id: 'drako',
    forms: ['drako', 'drakorn', 'drakrest', 'drakaiser'],
    armor: [
      { core: 'flame', form: 'pyrodrak' },
      { core: 'bolt', form: 'voltdrak' },
    ],
    fusionWith: 'mothi',
    fusionForm: 'drakomoth',
  },
  mothi: {
    id: 'mothi',
    forms: ['mothi', 'mothblade', 'mothlance', 'mothreign'],
    armor: [{ core: 'leaf', form: 'thornmoth' }],
    fusionWith: 'drako',
    fusionForm: 'drakomoth',
  },
  pippit: {
    id: 'pippit',
    forms: ['pippit', 'gustrel', 'galeraptor', 'tempestrix'],
    armor: [{ core: 'wind', form: 'skyfang' }],
    fusionWith: 'nekko',
    fusionForm: 'skyvalis',
  },
  burra: {
    id: 'burra',
    forms: ['burra', 'bouldon', 'quarrox', 'titanorr'],
    armor: [{ core: 'stone', form: 'drillox' }],
    fusionWith: 'lumi',
    fusionForm: 'terraluma',
  },
  lumi: {
    id: 'lumi',
    forms: ['lumi', 'lumeon', 'seraphyn', 'archlumen'],
    armor: [{ core: 'hope', form: 'halopeg' }],
    fusionWith: 'burra',
    fusionForm: 'terraluma',
  },
  nekko: {
    id: 'nekko',
    forms: ['nekko', 'nekkara', 'valkyat', 'aurelyx'],
    armor: [{ core: 'light', form: 'radiancat' }],
    fusionWith: 'pippit',
    fusionForm: 'skyvalis',
  },
};

export const STARTERS: LineId[] = ['drako', 'mothi', 'pippit', 'burra', 'lumi', 'nekko'];

export const CORE_NAME: Record<CoreId, string> = {
  flame: 'FLAME',
  wind: 'WIND',
  stone: 'STONE',
  leaf: 'LEAF',
  hope: 'HOPE',
  light: 'LIGHT',
  bolt: 'BOLT',
};
export const CORE_ORDER: CoreId[] = ['flame', 'wind', 'stone', 'leaf', 'hope', 'light', 'bolt'];

export interface AreaDef {
  id: number;
  name: string;
  /** Steps from area start to the boss. */
  distance: number;
  /** Per-step chance of a wild encounter (after the cooldown). */
  encounterRate: number;
  enemies: string[];
  boss: string;
  reward: { core?: CoreId; ally?: boolean };
}

export const AREAS: AreaDef[] = [
  { id: 1, name: 'MEADOW', distance: 400, encounterRate: 1 / 120, enemies: ['sprigo', 'budbit', 'hopsel'], boss: 'thornox', reward: { core: 'flame' } },
  { id: 2, name: 'CANYON', distance: 600, encounterRate: 1 / 130, enemies: ['rockit', 'dustmaw', 'cragling'], boss: 'gorgrind', reward: { core: 'wind' } },
  { id: 3, name: 'MARSH', distance: 900, encounterRate: 1 / 140, enemies: ['bogglet', 'reedra', 'mirefin'], boss: 'mirelord', reward: { core: 'stone', ally: true } },
  { id: 4, name: 'TUNDRA', distance: 1200, encounterRate: 1 / 150, enemies: ['frostnip', 'glaciun', 'yetling'], boss: 'blizzarx', reward: { core: 'leaf' } },
  { id: 5, name: 'RUINS', distance: 1500, encounterRate: 1 / 160, enemies: ['relicor', 'golemite', 'shadeon'], boss: 'monolith', reward: { core: 'hope' } },
  { id: 6, name: 'VOLCANO', distance: 1800, encounterRate: 1 / 170, enemies: ['cinderel', 'magmaw', 'ashwing'], boss: 'pyrogant', reward: { core: 'light' } },
  { id: 7, name: 'SKYPORT', distance: 2200, encounterRate: 1 / 180, enemies: ['zephyx', 'cloudra', 'voltrik'], boss: 'stormcaw', reward: { core: 'bolt' } },
  { id: 8, name: 'CORE', distance: 3000, encounterRate: 1 / 190, enemies: ['glitchet', 'nullox', 'vexel'], boss: 'omnivoid', reward: {} },
];

/** Enemy tier by area (bosses get one tier higher, capped). */
export function enemyStage(area: number, boss: boolean): Stage {
  const tier = Math.min(3, Math.floor((area - 1) / 2) + (boss ? 1 : 0));
  return STAGE_ORDER[tier];
}

const ENEMY_TRAITS: Trait[][] = [
  ['horns'], ['ears'], ['antenna'], ['spikes'], ['wings'], ['crest'],
  ['horns', 'spikes'], ['ears', 'wings'], ['antenna', 'spikes'], ['crest', 'wings'],
];

export const CREATURES: Record<string, CreatureDef> = {};
for (const cr of PARTNER_CREATURES) CREATURES[cr.id] = cr;

AREAS.forEach((a) => {
  [...a.enemies, a.boss].forEach((id, i) => {
    const boss = id === a.boss;
    CREATURES[id] = {
      id,
      name: id.toUpperCase(),
      stage: enemyStage(a.id, boss),
      traits: ENEMY_TRAITS[(a.id * 3 + i) % ENEMY_TRAITS.length],
    };
  });
});

export const creature = (id: string): CreatureDef => {
  const cr = CREATURES[id];
  if (!cr) throw new Error(`unknown creature ${id}`);
  return cr;
};

export interface ShellDef {
  id: ShellId;
  name: string;
}
export const SHELLS: ShellDef[] = [
  { id: 'cobalt', name: 'COBALT' },
  { id: 'onyx', name: 'ONYX' },
  { id: 'clear', name: 'CLEAR' },
  { id: 'ember', name: 'EMBER' },
];
