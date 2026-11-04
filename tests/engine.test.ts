/// <reference types="node" />
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Bitmap } from '../src/engine/bitmap';
import { AREAS, CREATURES, LINES, STARTERS } from '../src/engine/data';
import { Game, GameHost, Scene, Sfx } from '../src/engine/game';
import { mulberry32 } from '../src/engine/rng';
import {
  SHAKE_FULL,
  SaveData,
  applySteps,
  armorOptions,
  clearArea,
  fusionOption,
  gainXp,
  migrate,
  newSave,
  nextForm,
  resolveClash,
  shakePower,
  xpToNext,
} from '../src/engine/rules';
import { spriteFor } from '../src/engine/sprites';

function host(seed = 1) {
  const sounds: Sfx[] = [];
  let saved: SaveData | null = null;
  const h: GameHost = {
    save: (s) => (saved = s),
    sfx: (x) => sounds.push(x),
    rng: mulberry32(seed),
  };
  return { h, sounds, saved: () => saved };
}

/** Read the scene without TS narrowing across mutations. */
const scene = (g: Game): Scene => g.scene;

const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms; t += 66) g.tick(66);
};

test('every creature has a non-empty, symmetric sprite', () => {
  for (const id of Object.keys(CREATURES)) {
    const [a, b] = spriteFor(id);
    assert.ok(a.some((v) => v), id);
    assert.ok(b.some((v) => v), id);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 8; x++) assert.equal(a[y * 16 + x], a[y * 16 + 15 - x], `${id} asymmetric`);
  }
});

test('every line references real creatures and a reciprocal fusion partner', () => {
  for (const id of STARTERS) {
    const l = LINES[id];
    l.forms.forEach((f) => assert.ok(CREATURES[f], f));
    l.armor.forEach((a) => assert.ok(CREATURES[a.form], a.form));
    assert.equal(LINES[l.fusionWith].fusionWith, id);
    assert.equal(LINES[l.fusionWith].fusionForm, l.fusionForm);
  }
});

test('bitmap text renders and path merges runs', () => {
  const bm = new Bitmap();
  bm.fill(0, 0, 5, 1);
  assert.equal(bm.toPath(), 'M0 0h5v1h-5z');
  bm.clear();
  bm.text(0, 0, 'HI');
  assert.ok(bm.px.some((v) => v));
});

test('steps advance the map, charge energy and trigger the boss', () => {
  const s = newSave();
  s.line = 'drako';
  s.energy = 0;
  const never = () => 0.999; // no wild encounters
  applySteps(s, 105, never, true);
  assert.equal(s.areaSteps, 105);
  assert.equal(s.energy, 10);
  assert.equal(s.energyFrac, 5);
  const r = applySteps(s, 10_000, never, true);
  assert.deepEqual(r.encounter, { kind: 'boss', enemy: AREAS[0].boss });
  assert.equal(s.areaSteps, AREAS[0].distance);
  // Map is frozen while a battle is pending, but steps still count.
  applySteps(s, 50, never, true);
  assert.equal(s.areaSteps, AREAS[0].distance);
  assert.equal(s.totalSteps, 10_155);
});

test('wild encounters respect the cooldown', () => {
  const s = newSave();
  s.line = 'drako';
  const always = () => 0;
  const r = applySteps(s, 39, always, true);
  assert.equal(r.encounter, null);
  const r2 = applySteps(s, 1, always, true);
  assert.equal(r2.encounter?.kind, 'wild');
});

test('shake power scales and full shakes crit', () => {
  assert.ok(shakePower(10, 0).power < shakePower(10, 9).power);
  assert.equal(shakePower(10, SHAKE_FULL).crit, true);
  const c = resolveClash(10, SHAKE_FULL, 1000, () => 0.5);
  assert.equal(c.winner, 'p');
});

test('evolution gates: levels, cores, allies', () => {
  const s = newSave();
  s.line = 'drako';
  assert.equal(nextForm(s, 'drako')?.form, 'drakorn');
  assert.equal(nextForm(s, 'drakorn'), null); // needs level 5
  gainXp(s, 10_000);
  assert.equal(nextForm(s, 'drakorn')?.form, 'drakrest');
  assert.equal(armorOptions(s, 'drako').length, 0);
  s.cores.push('flame');
  assert.equal(armorOptions(s, 'drako')[0].form, 'pyrodrak');
  assert.equal(armorOptions(s, 'drakorn').length, 0); // only from rookie
  assert.equal(fusionOption(s, 'drakorn'), null);
  s.allies.push('mothi');
  assert.equal(fusionOption(s, 'drakorn'), 'drakomoth');
});

test('levelling consumes xp', () => {
  const s = newSave();
  gainXp(s, xpToNext(1) + 1);
  assert.equal(s.level, 2);
  assert.equal(s.xp, 1);
});

test('clearing area 3 grants the ally and the final area loops', () => {
  const s = newSave();
  s.line = 'pippit';
  s.area = 3;
  const r = clearArea(s);
  assert.equal(r.core, 'stone');
  assert.equal(r.ally, 'nekko');
  assert.equal(s.area, 4);
  s.area = AREAS.length;
  assert.equal(clearArea(s).looped, true);
  assert.equal(s.area, 1);
  assert.equal(s.loop, 1);
});

test('migrate fills missing fields', () => {
  const m = migrate({ level: 7, settings: { muted: true } });
  assert.equal(m.level, 7);
  assert.equal(m.settings.muted, true);
  assert.equal(m.settings.shell, 'cobalt');
  assert.deepEqual(m.cores, []);
});

test('full flow: pick partner, walk, fight and win a battle', () => {
  const { h, saved, sounds } = host(7);
  const g = new Game(h);
  g.press('B'); // skip boot
  assert.equal(scene(g).k, 'select');
  g.press('A');
  g.press('B'); // choose Mothi
  assert.equal(g.save.line, 'mothi');
  run(g, 3200);
  assert.equal(scene(g).k, 'msg');
  run(g, 4000);
  assert.equal(scene(g).k, 'idle');

  // Walk until something shows up.
  for (let i = 0; i < 100 && !g.save.pending; i++) g.addSteps(20);
  assert.ok(g.save.pending);
  assert.ok(sounds.includes('alert'));
  g.press('B');
  assert.equal(scene(g).k, 'battle');

  let rounds = 0;
  while (scene(g).k === 'battle' && rounds < 40) {
    const sc = scene(g);
    if (sc.k === 'battle' && sc.b.phase === 'menu') {
      // pick FIGHT
      while (g.battleOptions(sc.b)[sc.b.i] !== 'FIGHT') g.press('A');
      g.press('B');
      for (let k = 0; k < SHAKE_FULL; k++) g.shake();
      rounds++;
    }
    g.tick(100);
  }
  assert.equal(scene(g).k, 'msg');
  assert.equal(saved()!.wins + saved()!.losses, 1);
  assert.equal(saved()!.pending, null);
});

test('armor evolution during battle spends energy and changes form', () => {
  const { h } = host(3);
  const s = newSave();
  s.line = 'drako';
  s.cores = ['flame'];
  s.energy = 100;
  s.pending = { kind: 'wild', enemy: 'sprigo' };
  const g = new Game(h, s);
  g.press('B'); // boot -> idle
  g.press('B'); // start battle
  run(g, 1700);
  const sc = scene(g);
  assert.ok(sc.k === 'battle' && sc.b.phase === 'menu');
  if (sc.k !== 'battle') return;
  while (g.battleOptions(sc.b)[sc.b.i] !== 'ARMOR') g.press('A');
  g.press('B');
  assert.equal(sc.b.phase, 'armor');
  g.press('B');
  assert.equal(sc.b.phase, 'evolve');
  run(g, 2700);
  assert.equal(sc.b.form, 'pyrodrak');
  assert.equal(g.save.energy, 75);
});

test('config cycles shell and toggles sound', () => {
  const { h, saved } = host();
  const s = newSave();
  s.line = 'lumi';
  const g = new Game(h, s);
  g.press('B');
  g.press('A'); // menu
  for (let i = 0; i < 4; i++) g.press('A'); // -> CONFIG
  g.press('B');
  assert.equal(scene(g).k, 'config');
  g.press('B');
  assert.equal(saved()!.settings.shell, 'onyx');
  g.press('A');
  g.press('B');
  assert.equal(saved()!.settings.muted, true);
});

test('every scene renders without throwing', () => {
  const { h } = host(11);
  const s = newSave();
  s.line = 'burra';
  s.cores = ['stone', 'flame'];
  s.allies = ['lumi'];
  const g = new Game(h, s);
  const walk = (btns: string) => {
    for (const b of btns) {
      g.press(b as 'A' | 'B' | 'C');
      for (let i = 0; i < 20; i++) {
        g.tick(66);
        g.render();
      }
    }
  };
  walk('B'); // idle
  walk('BBBBBC'); // status pages
  walk('ABCABBAACABBBCCAAAABAAAB'); // menus
  g.render();
});
