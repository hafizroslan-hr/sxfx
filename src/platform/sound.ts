import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import type { Sfx } from '../engine/game';

const SOURCES: Record<Sfx, number> = {
  move: require('../../assets/sfx/move.wav'),
  ok: require('../../assets/sfx/ok.wav'),
  back: require('../../assets/sfx/back.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  shake: require('../../assets/sfx/shake.wav'),
  alert: require('../../assets/sfx/alert.wav'),
  attack: require('../../assets/sfx/attack.wav'),
  hit: require('../../assets/sfx/hit.wav'),
  crit: require('../../assets/sfx/crit.wav'),
  evolve: require('../../assets/sfx/evolve.wav'),
  win: require('../../assets/sfx/win.wav'),
  clear: require('../../assets/sfx/clear.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  level: require('../../assets/sfx/level.wav'),
};

/**
 * One long-lived player per effect so playback starts instantly. Players are
 * created lazily on first use and kept for the app's lifetime.
 */
const players: Partial<Record<Sfx, AudioPlayer>> = {};
let ready = false;

export async function initSound() {
  if (ready) return;
  ready = true;
  try {
    // Mix with the user's music and respect the iOS silent switch like a toy would.
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
  } catch {
    // Non-fatal: default audio mode still plays.
  }
}

export function playSfx(name: Sfx) {
  try {
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(SOURCES[name]);
      p.volume = 0.8;
      players[name] = p;
    }
    p.seekTo(0);
    p.play();
  } catch {
    // Audio failures must never break gameplay.
  }
}
