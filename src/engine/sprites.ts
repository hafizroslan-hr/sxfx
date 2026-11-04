/**
 * Procedural 16x16 mirror-symmetric creature sprites. Each creature id is a
 * seed, so a given creature always looks the same. Stage controls body size,
 * traits add recognisable features (horns, wings...). Two frames: stand + bob.
 */
import { CoreId, CORE_ORDER, Stage, Trait, creature } from './data';
import { hashStr, mulberry32 } from './rng';

export const S = 16;
export type Frames = [Uint8Array, Uint8Array];

/** [half body width, body height] */
const SIZE: Record<Stage, [number, number]> = {
  rookie: [5, 9],
  champion: [6, 11],
  ultimate: [7, 13],
  mega: [8, 14],
  armor: [7, 13],
  fusion: [8, 14],
};

export function makeSprite(seed: string, stage: Stage, traits: Trait[]): Frames {
  const rnd = mulberry32(hashStr(seed));
  const g = new Uint8Array(S * S);
  const set = (d: number, y: number, v = 1) => {
    if (d < 0 || d > 7 || y < 0 || y > 15) return;
    g[y * S + 7 - d] = v;
    g[y * S + 8 + d] = v;
  };
  const [bw, bh] = SIZE[stage];
  const top = S - bh;
  const headH = Math.max(3, Math.round(bh * (stage === 'rookie' ? 0.55 : 0.42)));
  const hw = Math.max(2, Math.min(bw, Math.round(bw * 0.7 + rnd() * 1.2)));
  const legsH = bh >= 11 ? 3 : 2;

  // Head: rounded block.
  for (let r = 0; r < headH; r++) {
    const w = hw - (r === 0 ? 1 : 0) - (r === headH - 1 && rnd() < 0.5 ? 1 : 0);
    for (let d = 0; d < w; d++) if (d < w - 1 || rnd() < 0.85) set(d, top + r);
  }

  // Torso with jittered width and a few symmetric belly marks.
  let tw = Math.max(2, Math.min(bw, bw - 1 + Math.round(rnd())));
  for (let r = headH; r < bh - legsH; r++) {
    if (rnd() < 0.35) tw = Math.max(2, Math.min(bw, tw + (rnd() < 0.5 ? -1 : 1)));
    for (let d = 0; d < tw; d++) {
      if (d === tw - 1 && rnd() > 0.8) continue;
      if (d > 0 && d < tw - 1 && rnd() < 0.1) continue;
      set(d, top + r);
    }
  }
  // Neck always solid so head and torso connect.
  set(0, top + headH);
  set(1, top + headH);

  // Legs + feet.
  const li = Math.max(1, Math.floor(tw / 2) - (rnd() < 0.5 ? 1 : 0));
  const legW = bw >= 7 ? 2 : 1 + (rnd() < 0.5 ? 1 : 0);
  for (let r = bh - legsH; r < bh; r++) {
    for (let d = li; d < li + legW; d++) set(d, top + r);
    if (r === bh - 1) set(li + legW, top + r);
  }
  // Hip joins torso to legs.
  for (let d = 0; d < li + legW; d++) set(d, top + bh - legsH);

  // Arms for anything past rookie (and some rookies).
  if (stage !== 'rookie' || rnd() < 0.5) {
    const ay = top + headH + 1;
    set(tw, ay);
    set(tw + 1, ay + 1);
    if (bh >= 11) set(tw + 1, ay + 2);
  }

  // Eyes and mouth.
  const eyeY = top + Math.max(1, Math.floor(headH * 0.45));
  const eyeD = hw >= 4 ? 2 : 1;
  set(eyeD, eyeY - 1);
  set(eyeD, eyeY + 1);
  set(eyeD, eyeY, 0);
  if (stage === 'mega' || stage === 'fusion') set(eyeD + 1 < hw ? eyeD + 1 : eyeD, eyeY, 0);
  if (rnd() < 0.6 && eyeY + 2 < top + headH) set(0, eyeY + 2, 0);

  for (const t of traits) {
    switch (t) {
      case 'horns':
        set(hw - 1, top - 1);
        set(hw, top - 2);
        break;
      case 'ears':
        set(hw - 1, top - 1);
        set(hw - 2, top - 1);
        set(hw - 1, top - 2);
        break;
      case 'antenna':
        set(1, top - 1);
        set(2, top - 2);
        set(2, top - 3);
        break;
      case 'crest':
        set(0, top - 1);
        set(0, top - 2);
        set(1, top - 1);
        break;
      case 'wings': {
        const wy = top + headH - 1;
        for (let k = 0; k < 3; k++)
          for (let j = 0; j < 3 - k; j++) set(tw + 1 + j, wy + k);
        set(tw + 3, wy - 1);
        break;
      }
      case 'spikes':
        for (let r = headH; r < bh - legsH; r += 2) set(tw, top + r);
        break;
    }
  }

  // Frame 2: "bob" – body drops one row, feet stay planted.
  const f2 = new Uint8Array(S * S);
  for (let x = 0; x < S; x++) f2[15 * S + x] = g[15 * S + x];
  for (let y = 1; y < 15; y++) for (let x = 0; x < S; x++) f2[y * S + x] = g[(y - 1) * S + x];
  return [g, f2];
}

const cache = new Map<string, Frames>();
export function spriteFor(id: string): Frames {
  let f = cache.get(id);
  if (!f) {
    const cr = creature(id);
    f = makeSprite(id, cr.stage, cr.traits);
    cache.set(id, f);
  }
  return f;
}

/** 10x12 egg used for the hatch sequence; `crack` 0..3 adds cracks. */
export function eggSprite(crack: number): Uint8Array {
  const w = 12;
  const h = 14;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h * 0.58) / (h * 0.58);
      const k = ny < 0 ? 1.15 : 1; // narrower top
      const r = nx * nx * k * k + ny * ny;
      if (r <= 1) g[y * w + x] = r > 0.62 ? 1 : 0;
    }
  // spots
  [[4, 5], [7, 8], [5, 10], [8, 4]].forEach(([x, y]) => (g[y * w + x] = 1));
  const cracks = [
    [[3, 6], [4, 7], [5, 6], [6, 7]],
    [[6, 7], [7, 6], [8, 7]],
    [[2, 8], [3, 9], [8, 9], [9, 8]],
  ];
  for (let i = 0; i < Math.min(crack, 3); i++) cracks[i].forEach(([x, y]) => (g[y * w + x] = 1));
  return g;
}
export const EGG_W = 12;

/** 7x7 diamond icon per core, with a distinct inner pattern. */
export function coreIcon(core: CoreId): Uint8Array {
  const n = 7;
  const g = new Uint8Array(n * n);
  const idx = CORE_ORDER.indexOf(core) + 1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.abs(x - 3) + Math.abs(y - 3);
      if (d === 3) g[y * n + x] = 1;
      if (d === 1 && idx & (1 << ((x + y) % 3))) g[y * n + x] = 1;
      if (d === 0 && idx & 4) g[y * n + x] = 1;
    }
  return g;
}
export const CORE_W = 7;
