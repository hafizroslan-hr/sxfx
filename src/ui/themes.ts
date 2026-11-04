import type { ShellId } from '../engine/data';

export interface Theme {
  /** Main shell plastic, top → bottom gradient. */
  body: [string, string];
  /** Face plate around the screen. */
  plate: string;
  bezel: string;
  button: string;
  buttonPressed: string;
  bigButton: string;
  ink: string;
  lcdBg: string;
  lcdOn: string;
  /** Translucent "clear" plastic look. */
  clear?: boolean;
}

export const THEMES: Record<ShellId, Theme> = {
  cobalt: {
    body: ['#2f6fd6', '#1c4fa8'],
    plate: '#eef1f6',
    bezel: '#2a2f3a',
    button: '#f4f6fa',
    buttonPressed: '#c9cfda',
    bigButton: '#ffcf33',
    ink: '#1c2a44',
    lcdBg: '#a8b89a',
    lcdOn: '#1b2416',
  },
  onyx: {
    body: ['#3a3c42', '#1d1e22'],
    plate: '#8d939e',
    bezel: '#141518',
    button: '#c8ccd3',
    buttonPressed: '#8f949c',
    bigButton: '#c8423a',
    ink: '#101114',
    lcdBg: '#9fae95',
    lcdOn: '#161c13',
  },
  clear: {
    body: ['rgba(80,170,255,0.55)', 'rgba(40,110,220,0.75)'],
    plate: 'rgba(225,240,255,0.85)',
    bezel: '#22324a',
    button: '#ffffff',
    buttonPressed: '#cfe2ff',
    bigButton: '#7fd4ff',
    ink: '#163056',
    lcdBg: '#b2c4a6',
    lcdOn: '#18241a',
    clear: true,
  },
  ember: {
    body: ['#f07a2a', '#c4501a'],
    plate: '#fff4e6',
    bezel: '#3a2a22',
    button: '#fff7ee',
    buttonPressed: '#e8d3bd',
    bigButton: '#3a3a3a',
    ink: '#4a2412',
    lcdBg: '#b4b98f',
    lcdOn: '#22220f',
  },
};
