# Stride Pocket-3

A retro pedometer virtual-pet for iOS and Android (Expo / React Native). Your real-world steps move
a pixel partner across an 8-area map. Shaking your phone powers its attacks. Your partner evolves,
armor-evolves and fuses in battle on a 40×32 dot-matrix LCD inside a handheld shell.

All creatures, names, items, shell designs and sounds are original to this project.

## Running

```sh
npm install
npx expo start          # then press i / a, or scan with Expo Go
npm test                # engine unit tests (node:test via tsx)
npm run typecheck
npx expo lint
npm run sfx             # regenerate the chiptune WAVs in assets/sfx/
```

Pedometer and haptics need a real device. On the web build you can play with the keyboard:
`A`/`←`, `B`/`Enter`/`→`, `C`/`Esc`, `Space` = shake (adds 1 step outside battle), `S` = walk 25 steps.

## Controls

| Button | Role |
| --- | --- |
| **A** (top-left) | Scroll menus / options |
| **B** (right, large) | Confirm / act / view status. In a shake window it also counts as a shake. |
| **C** (bottom) | Cancel / back |

## Gameplay

- **Partner select.** Pick one of 6 starters (Drako, Mothi, Pippit, Burra, Lumi, Nekko). It hatches from an egg.
- **Walking.** Steps come from the hardware pedometer (Core Motion on iOS, step sensor on Android).
  *Shake-to-step* uses the accelerometer as a fallback. It turns off automatically while the pedometer
  is reporting, so steps are never counted twice, and you can toggle it in CONFIG.
  On iOS, steps walked while the app was closed are credited on the next launch (up to 7 days).
- **Map.** There are 8 areas (Meadow → Core), each a fixed number of steps long. Wild encounters trigger
  at random after a 40-step cooldown. A boss waits at the end of each area. The red LED and an alert
  beep tell you a battle is waiting. After area 8 the map loops at higher difficulty.
- **Combat.** Choose **FIGHT**, then shake the phone for 3 seconds. The shake count sets attack power
  (60–150% of AP), and 18 or more shakes is a guaranteed critical. Your strike is compared with the
  enemy's: the stronger one lands.
- **Evolution, in battle, costs energy:**
  - *Standard:* Rookie → Champion (any level) → Ultimate (Lv 5) → Mega (Lv 10).
  - *Armor:* from Rookie, using a **Core** won from area bosses. For example, Drako + Flame Core =
    Pyrodrak, and Drako + Bolt Core = Voltdrak.
  - *Fusion:* from Champion, once your partner's fusion ally joins after the Area 3 boss.
    The pairs are Drakorn + Mothblade = Drakomoth, Gustrel + Nekkara = Skyvalis, and
    Bouldon + Lumeon = Terraluma.
  - Forms revert to Rookie after each battle.
- **Energy** is earned at 1 per 10 steps plus 5 per win. It is spent on evolutions and training.
- **Training:** *Timing* (stop the cursor in the zone, 5 rounds) raises AP. *Shake* (22 shakes in 3 s) raises HP.
- **Status:** name and level, stage and XP, HP / AP / energy, win / loss record, total steps and cores.
- **Config:** four shells (Cobalt, Onyx, Clear, Ember), sound on/off, shake-to-step on/off, and reset.

## Architecture

```
App.tsx                  wires engine ⇄ store, sensors, sound, haptics, lifecycle
src/engine/              pure TypeScript: no React Native imports, unit-tested
  game.ts                scene state machine, input handling, LCD rendering
  rules.ts               save model, stats, step/encounter logic, battle math
  data.ts                creatures, evolution lines, areas, cores, shells
  sprites.ts             deterministic procedural 16×16 sprites (mirror-symmetric + traits)
  bitmap.ts, font.ts     40×32 1-bit framebuffer, 3×5 pixel font, SVG path output
src/state/store.ts       zustand + persist → AsyncStorage (survives restarts)
src/platform/            pedometer, accelerometer shake detector, expo-audio SFX
src/ui/                  LCD (react-native-svg) and the handheld shell + buttons
scripts/gen-sfx.mjs      synthesises the square-wave/noise SFX as 8-bit WAVs
```

- **State.** The `Game` engine holds the working copy of `SaveData` and commits snapshots to the
  zustand store. `persist` writes them to AsyncStorage. Older saves are filled in by `migrate()`.
- **Performance.** The engine ticks at a fixed **15 fps**. Each frame renders a 1-bit framebuffer into
  a run-merged SVG path, and React re-renders only when the pixels actually change. The LCD
  dot-grid, ghost cells and drop shadow are static layers.

## Notes and limits

- Pedometer updates are not delivered while the app is in the background (an OS/Expo limitation).
  On iOS the gap is back-filled from Core Motion history on the next launch. On Android, steps
  taken while the app is fully closed are not recovered.
- The pedometer and expo-haptics work in Expo Go. A production build uses `eas build`.
