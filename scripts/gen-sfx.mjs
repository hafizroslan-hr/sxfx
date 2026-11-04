#!/usr/bin/env node
/**
 * Generates the 8-bit chiptune sound effects as tiny 8-bit mono WAV files.
 * Run: node scripts/gen-sfx.mjs   (outputs to assets/sfx/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');
mkdirSync(out, { recursive: true });

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

/**
 * seq: array of [midiNote | null (rest) | {sweep:[from,to]}, durationMs, duty?]
 */
function render(seq, { volume = 0.35, duty = 0.5 } = {}) {
  const samples = [];
  for (const [note, ms, d = duty] of seq) {
    const n = Math.round((RATE * ms) / 1000);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      let f = 0;
      if (typeof note === 'number') f = NOTE(note);
      else if (note && note.sweep) f = note.sweep[0] + ((note.sweep[1] - note.sweep[0]) * i) / n;
      else if (note && note.noise) f = -1;
      let v = 0;
      if (f > 0) {
        phase = (phase + f / RATE) % 1;
        v = phase < d ? 1 : -1;
      } else if (f === -1) v = Math.random() * 2 - 1;
      // short attack / release to avoid clicks
      const env = Math.min(1, i / 40, (n - i) / 60);
      samples.push(v * env * volume);
    }
  }
  return samples;
}

function wav(name, samples) {
  const data = Buffer.alloc(samples.length);
  samples.forEach((s, i) => (data[i] = Math.max(0, Math.min(255, Math.round(128 + s * 127)))));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(join(out, `${name}.wav`), Buffer.concat([h, data]));
}

const SFX = {
  move: [[84, 30, 0.25]],
  ok: [[79, 35], [91, 45]],
  back: [[72, 35], [64, 45]],
  tick: [[96, 40, 0.25]],
  shake: [[{ sweep: [600, 900] }, 30, 0.25]],
  alert: [[88, 70], [null, 40], [88, 70], [null, 40], [88, 70], [null, 40], [93, 160]],
  attack: [[{ sweep: [1400, 200] }, 220, 0.25]],
  hit: [[{ noise: true }, 90], [{ sweep: [300, 80] }, 90]],
  crit: [[{ noise: true }, 60], [96, 50], [100, 50], [103, 120]],
  evolve: [
    [60, 70], [64, 70], [67, 70], [72, 70], [64, 70], [67, 70], [72, 70], [76, 70],
    [67, 70], [72, 70], [76, 70], [79, 70], [84, 300, 0.25],
  ],
  win: [[72, 90], [76, 90], [79, 90], [84, 240], [79, 90], [84, 360]],
  clear: [[67, 100], [72, 100], [76, 100], [79, 100], [84, 100], [88, 100], [91, 500, 0.25]],
  lose: [[67, 160], [63, 160], [60, 160], [55, 420]],
  level: [[79, 70], [84, 70], [88, 70], [91, 200]],
};

for (const [name, seq] of Object.entries(SFX)) wav(name, render(seq));
console.log(`wrote ${Object.keys(SFX).length} sfx to ${out}`);
