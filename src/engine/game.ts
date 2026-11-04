/**
 * The device "firmware": a scene state machine driven by three buttons,
 * steps, shakes and a 15 fps tick. Renders into a 40x32 1-bit bitmap.
 */
import { Bitmap, W } from './bitmap';
import { CORE_NAME, CoreId, LINES, SHELLS, STAGE_LABEL, STARTERS, creature } from './data';
import { textWidth } from './font';
import { Rng, clamp } from './rng';
import {
  Clash,
  MAX_ENERGY,
  SHAKE_FULL,
  SHAKE_WINDOW_MS,
  SaveData,
  addEnergy,
  applySteps,
  areaDef,
  armorOptions,
  clearArea,
  enemyStats,
  evoCost,
  fusionOption,
  gainXp,
  migrate,
  newSave,
  nextForm,
  partnerStats,
  resolveClash,
  rookieOf,
  winXp,
  xpToNext,
} from './rules';
import { CORE_W, EGG_W, coreIcon, eggSprite, spriteFor } from './sprites';

export type Button = 'A' | 'B' | 'C';
export type Sfx =
  | 'move' | 'ok' | 'back' | 'alert' | 'evolve' | 'attack' | 'hit' | 'crit'
  | 'win' | 'lose' | 'level' | 'tick' | 'shake' | 'clear';

export interface GameHost {
  save(s: SaveData): void;
  sfx(s: Sfx): void;
  haptic?(kind: 'light' | 'heavy'): void;
  rng?: Rng;
}

export const FPS = 15;
const TRAIN_COST = 5;
const TIMING_ROUNDS = 5;
const SHAKE_TRAIN_TARGET = 22;

type BattleOpt = 'FIGHT' | 'EVOLVE' | 'ARMOR' | 'FUSE' | 'RUN';

interface Battle {
  enemy: string;
  boss: boolean;
  ehp: number;
  emax: number;
  eap: number;
  form: string;
  php: number;
  pmax: number;
  pap: number;
  phase: 'intro' | 'menu' | 'armor' | 'evolve' | 'shake' | 'clash' | 'outcome' | 'note';
  t: number;
  i: number;
  count: number;
  from?: string;
  to?: string;
  note?: string;
  last?: Clash;
}

interface MsgPage {
  lines: string[];
  sprite?: string;
  core?: CoreId;
  /** Sound played when this page comes up. */
  sfx?: Sfx;
}

export type Scene =
  | { k: 'boot'; t: number }
  | { k: 'select'; i: number }
  | { k: 'hatch'; t: number }
  | { k: 'idle'; t: number }
  | { k: 'menu'; i: number }
  | { k: 'status'; page: number }
  | { k: 'map' }
  | { k: 'items'; i: number }
  | { k: 'config'; i: number; confirm: boolean }
  | { k: 'train'; i: number }
  | { k: 'timing'; round: number; hits: number; pos: number; dir: 1 | -1; zone: number; flash: number; hit: boolean }
  | { k: 'shakeTrain'; t: number; count: number; go: boolean }
  | { k: 'battle'; b: Battle }
  | { k: 'msg'; t: number; pages: MsgPage[]; page: number; then: () => Scene };

const MENU = ['STATUS', 'MAP', 'TRAIN', 'ITEMS', 'CONFIG'] as const;
const CONFIG = ['SHELL', 'SOUND', 'SHK STEP', 'RESET'] as const;
const STATUS_PAGES = 5;
const MSG_PAGE_MS = 1800;

export class Game {
  private s: SaveData;
  scene: Scene = { k: 'boot', t: 0 };
  frame = 0;
  private bm = new Bitmap();
  private rng: Rng;
  private alertBeeps = 0;
  private alertT = 0;

  constructor(private host: GameHost, save?: unknown) {
    this.s = migrate(save);
    this.rng = host.rng ?? Math.random;
  }

  get save(): SaveData {
    return this.s;
  }

  /** True while a shake should count as an attack/training input rather than a step. */
  get wantsShake(): boolean {
    const sc = this.scene;
    return (sc.k === 'battle' && sc.b.phase === 'shake') || (sc.k === 'shakeTrain' && sc.go);
  }

  private commit() {
    const s = this.s;
    this.host.save({
      ...s,
      cores: [...s.cores],
      allies: [...s.allies],
      settings: { ...s.settings },
      pending: s.pending && { ...s.pending },
    });
  }

  private sfx(x: Sfx) {
    this.host.sfx(x);
  }

  private goIdle(): Scene {
    return { k: 'idle', t: 0 };
  }

  private msg(pages: MsgPage[], then: () => Scene = () => this.goIdle()): Scene {
    return { k: 'msg', t: 0, pages, page: 0, then };
  }

  // ------------------------------------------------------------------ inputs

  touch(now: number) {
    this.s.lastSeen = now;
    this.commit();
  }

  addSteps(n: number) {
    const sc = this.scene.k;
    const mapActive = sc !== 'battle' && sc !== 'select' && sc !== 'hatch' && sc !== 'boot';
    const r = applySteps(this.s, n, this.rng, mapActive);
    if (r.encounter) {
      this.alertBeeps = 3;
      this.alertT = 0;
      this.sfx('alert');
      this.host.haptic?.('heavy');
    }
    this.commit();
  }

  shake() {
    const sc = this.scene;
    if (sc.k === 'battle' && sc.b.phase === 'shake') {
      sc.b.count++;
      if (sc.b.count % 3 === 0) this.sfx('shake');
      this.host.haptic?.('light');
    } else if (sc.k === 'shakeTrain' && sc.go) {
      sc.count++;
      if (sc.count % 3 === 0) this.sfx('shake');
      this.host.haptic?.('light');
    }
  }

  press(btn: Button) {
    // In shake windows the B button doubles as a shake (for devices or
    // situations where shaking isn't possible).
    if (btn === 'B' && this.wantsShake) {
      this.shake();
      return;
    }
    this.sfx(btn === 'A' ? 'move' : btn === 'B' ? 'ok' : 'back');
    const sc = this.scene;
    switch (sc.k) {
      case 'boot':
        this.scene = this.afterBoot();
        break;
      case 'select':
        if (btn === 'A') sc.i = (sc.i + 1) % STARTERS.length;
        else if (btn === 'C') sc.i = (sc.i + STARTERS.length - 1) % STARTERS.length;
        else {
          this.s.line = STARTERS[sc.i];
          this.commit();
          this.scene = { k: 'hatch', t: 0 };
        }
        break;
      case 'hatch':
        break;
      case 'idle':
        if (this.s.pending) this.scene = this.startBattle();
        else if (btn === 'A') this.scene = { k: 'menu', i: 0 };
        else if (btn === 'B') this.scene = { k: 'status', page: 0 };
        break;
      case 'menu':
        if (btn === 'A') sc.i = (sc.i + 1) % MENU.length;
        else if (btn === 'C') this.scene = this.goIdle();
        else this.scene = this.openMenu(MENU[sc.i]);
        break;
      case 'status':
        if (btn === 'C') this.scene = this.goIdle();
        else sc.page = (sc.page + 1) % STATUS_PAGES;
        break;
      case 'map':
        this.scene = btn === 'C' ? { k: 'menu', i: 1 } : sc;
        break;
      case 'items': {
        const n = this.itemList().length;
        if (btn === 'C') this.scene = { k: 'menu', i: 3 };
        else if (n) sc.i = (sc.i + 1) % n;
        break;
      }
      case 'config':
        this.pressConfig(sc, btn);
        break;
      case 'train':
        if (btn === 'A') sc.i = (sc.i + 1) % 2;
        else if (btn === 'C') this.scene = { k: 'menu', i: 2 };
        else if (this.s.energy < TRAIN_COST) this.scene = this.msg([{ lines: ['LOW', 'ENERGY'] }], () => ({ k: 'train', i: sc.i }));
        else {
          addEnergy(this.s, -TRAIN_COST);
          this.commit();
          this.scene =
            sc.i === 0
              ? { k: 'timing', round: 0, hits: 0, pos: 0, dir: 1, zone: this.newZone(), flash: 0, hit: false }
              : { k: 'shakeTrain', t: 0, count: 0, go: false };
        }
        break;
      case 'timing':
        if (btn === 'B' && sc.flash <= 0) {
          const p = Math.round(sc.pos);
          sc.hit = p >= sc.zone && p < sc.zone + 6;
          if (sc.hit) sc.hits++;
          sc.flash = 600;
          this.sfx(sc.hit ? 'crit' : 'hit');
        } else if (btn === 'C') this.scene = { k: 'train', i: 0 };
        break;
      case 'shakeTrain':
        if (btn === 'C') this.scene = { k: 'train', i: 1 };
        break;
      case 'battle':
        this.pressBattle(sc.b, btn);
        break;
      case 'msg':
        this.advanceMsg(sc);
        break;
    }
  }

  private afterBoot(): Scene {
    return this.s.line ? this.goIdle() : { k: 'select', i: 0 };
  }

  private openMenu(item: (typeof MENU)[number]): Scene {
    switch (item) {
      case 'STATUS':
        return { k: 'status', page: 0 };
      case 'MAP':
        return { k: 'map' };
      case 'TRAIN':
        return { k: 'train', i: 0 };
      case 'ITEMS':
        return { k: 'items', i: 0 };
      case 'CONFIG':
        return { k: 'config', i: 0, confirm: false };
    }
  }

  private pressConfig(sc: Extract<Scene, { k: 'config' }>, btn: Button) {
    const st = this.s.settings;
    if (sc.confirm) {
      if (btn === 'B') {
        this.s = newSave(st);
        this.commit();
        this.scene = { k: 'boot', t: 0 };
      } else sc.confirm = false;
      return;
    }
    if (btn === 'A') sc.i = (sc.i + 1) % CONFIG.length;
    else if (btn === 'C') this.scene = { k: 'menu', i: 4 };
    else {
      const item = CONFIG[sc.i];
      if (item === 'SHELL') {
        const idx = SHELLS.findIndex((x) => x.id === st.shell);
        st.shell = SHELLS[(idx + 1) % SHELLS.length].id;
      } else if (item === 'SOUND') st.muted = !st.muted;
      else if (item === 'SHK STEP') st.shakeSteps = !st.shakeSteps;
      else sc.confirm = true;
      this.commit();
    }
  }

  private advanceMsg(sc: Extract<Scene, { k: 'msg' }>) {
    if (sc.page + 1 < sc.pages.length) {
      sc.page++;
      sc.t = 0;
      const fx = sc.pages[sc.page].sfx;
      if (fx) this.sfx(fx);
    } else this.scene = sc.then();
  }

  private newZone() {
    return 2 + Math.floor(this.rng() * 22);
  }

  // ------------------------------------------------------------------ battle

  private startBattle(): Scene {
    const p = this.s.pending!;
    const boss = p.kind === 'boss';
    const es = enemyStats(this.s.area, this.s.loop, boss, this.rng);
    const form = rookieOf(this.s);
    const ps = partnerStats(this.s, form);
    this.alertBeeps = 0;
    return {
      k: 'battle',
      b: {
        enemy: p.enemy,
        boss,
        ehp: es.hp,
        emax: es.hp,
        eap: es.ap,
        form,
        php: ps.hp,
        pmax: ps.hp,
        pap: ps.ap,
        phase: 'intro',
        t: 0,
        i: 0,
        count: 0,
      },
    };
  }

  battleOptions(b: Battle): BattleOpt[] {
    const o: BattleOpt[] = ['FIGHT'];
    if (nextForm(this.s, b.form)) o.push('EVOLVE');
    if (armorOptions(this.s, b.form).length) o.push('ARMOR');
    if (fusionOption(this.s, b.form)) o.push('FUSE');
    if (!b.boss) o.push('RUN');
    return o;
  }

  private note(b: Battle, text: string) {
    b.phase = 'note';
    b.note = text;
    b.t = 0;
  }

  private beginEvolve(b: Battle, to: string) {
    const cost = evoCost(to);
    if (this.s.energy < cost) return this.note(b, 'LOW EN');
    addEnergy(this.s, -cost);
    this.commit();
    b.from = b.form;
    b.to = to;
    b.phase = 'evolve';
    b.t = 0;
    this.sfx('evolve');
  }

  private pressBattle(b: Battle, btn: Button) {
    if (b.phase === 'menu') {
      const opts = this.battleOptions(b);
      b.i = Math.min(b.i, opts.length - 1);
      if (btn === 'A') b.i = (b.i + 1) % opts.length;
      else if (btn === 'C') b.i = (b.i + opts.length - 1) % opts.length;
      else {
        const opt = opts[b.i];
        if (opt === 'FIGHT') {
          b.phase = 'shake';
          b.t = 0;
          b.count = 0;
          this.sfx('tick');
        } else if (opt === 'EVOLVE') this.beginEvolve(b, nextForm(this.s, b.form)!.form);
        else if (opt === 'ARMOR') {
          b.phase = 'armor';
          b.i = 0;
        } else if (opt === 'FUSE') this.beginEvolve(b, fusionOption(this.s, b.form)!);
        else if (opt === 'RUN') {
          if (this.rng() < 0.75) {
            this.s.pending = null;
            this.commit();
            this.scene = this.msg([{ lines: ['GOT', 'AWAY'] }]);
          } else this.note(b, 'NO ESCAPE');
        }
      }
    } else if (b.phase === 'armor') {
      const opts = armorOptions(this.s, b.form);
      if (btn === 'A') b.i = (b.i + 1) % opts.length;
      else if (btn === 'C') {
        b.phase = 'menu';
        b.i = 0;
      } else this.beginEvolve(b, opts[b.i].form);
    } else if (b.phase === 'intro' || b.phase === 'note') {
      b.t = 99999; // skip
    }
  }

  private finishEvolve(b: Battle) {
    const frac = b.php / b.pmax;
    const ps = partnerStats(this.s, b.to!);
    b.form = b.to!;
    b.pmax = ps.hp;
    b.pap = ps.ap;
    b.php = Math.max(1, Math.round(ps.hp * frac));
    b.phase = 'menu';
    b.i = 0;
  }

  private win(b: Battle) {
    const s = this.s;
    const area = s.area;
    s.wins++;
    const xp = winXp(area, b.boss);
    const ups = gainXp(s, xp);
    addEnergy(s, 5);
    s.pending = null;
    const pages: MsgPage[] = [{ lines: ['WIN!'], sprite: b.form }, { lines: [`+${xp} XP`] }];
    if (ups) pages.push({ lines: ['LEVEL UP', `LV ${s.level}`], sfx: 'level' });
    if (b.boss) {
      const r = clearArea(s);
      pages.push({ lines: [`AREA ${area}`, 'CLEAR!'] });
      if (r.core) pages.push({ lines: ['GOT CORE', CORE_NAME[r.core]], core: r.core });
      if (r.ally) pages.push({ lines: ['ALLY ' + creature(LINES[r.ally].forms[0]).name], sprite: LINES[r.ally].forms[0] });
      if (r.looped) pages.push({ lines: ['ALL CLEAR', `LOOP ${s.loop}`] });
    }
    this.commit();
    this.sfx(b.boss ? 'clear' : 'win');
    this.scene = this.msg(pages);
  }

  private lose(b: Battle) {
    const s = this.s;
    s.losses++;
    addEnergy(s, -10);
    s.pending = null;
    const pages: MsgPage[] = [{ lines: ['LOSE...'], sprite: b.enemy }];
    if (b.boss) {
      const back = Math.min(100, s.areaSteps);
      s.areaSteps -= back;
      pages.push({ lines: ['RETREAT', `${back} STEPS`] });
    }
    this.commit();
    this.sfx('lose');
    this.scene = this.msg(pages);
  }

  private tickBattle(b: Battle, dt: number) {
    b.t += dt;
    switch (b.phase) {
      case 'intro':
        if (b.t >= 1600) {
          b.phase = 'menu';
          b.t = 0;
        }
        break;
      case 'note':
        if (b.t >= 900) {
          b.phase = 'menu';
          b.t = 0;
        }
        break;
      case 'evolve':
        if (b.t >= 2600) this.finishEvolve(b);
        break;
      case 'shake': {
        const before = Math.ceil((SHAKE_WINDOW_MS - (b.t - dt)) / 1000);
        const after = Math.ceil((SHAKE_WINDOW_MS - b.t) / 1000);
        if (after < before && after > 0) this.sfx('tick');
        if (b.t >= SHAKE_WINDOW_MS) {
          b.last = resolveClash(b.pap, b.count, b.eap, this.rng);
          b.phase = 'clash';
          b.t = 0;
          this.sfx('attack');
        }
        break;
      }
      case 'clash':
        if (b.t >= 1200) {
          const c = b.last!;
          if (c.winner === 'p') b.ehp = Math.max(0, b.ehp - c.dmg);
          else if (c.winner === 'e') b.php = Math.max(0, b.php - c.dmg);
          else {
            b.ehp = Math.max(0, b.ehp - 1);
            b.php = Math.max(0, b.php - 1);
          }
          this.sfx(c.crit ? 'crit' : 'hit');
          this.host.haptic?.(c.winner === 'e' || c.crit ? 'heavy' : 'light');
          b.phase = 'outcome';
          b.t = 0;
        }
        break;
      case 'outcome':
        if (b.t >= 1000) {
          if (b.ehp <= 0) this.win(b);
          else if (b.php <= 0) this.lose(b);
          else {
            b.phase = 'menu';
            b.t = 0;
          }
        }
        break;
    }
  }

  // -------------------------------------------------------------------- tick

  tick(dt: number) {
    this.frame++;
    const sc = this.scene;
    switch (sc.k) {
      case 'boot':
        sc.t += dt;
        if (sc.t > 2600) this.scene = this.afterBoot();
        break;
      case 'hatch':
        sc.t += dt;
        if (sc.t > 3000) {
          const id = rookieOf(this.s);
          this.sfx('evolve');
          this.scene = this.msg([{ lines: [creature(id).name], sprite: id }, { lines: ['HELLO!'] }]);
        }
        break;
      case 'idle':
        sc.t += dt;
        break;
      case 'timing':
        if (sc.flash > 0) {
          sc.flash -= dt;
          if (sc.flash <= 0) {
            sc.round++;
            if (sc.round >= TIMING_ROUNDS) this.scene = this.timingResult(sc.hits);
            else {
              sc.zone = this.newZone();
              sc.pos = 0;
              sc.dir = 1;
            }
          }
        } else {
          sc.pos += sc.dir * ((22 + sc.round * 7) * dt) / 1000;
          if (sc.pos >= 29) {
            sc.pos = 29;
            sc.dir = -1;
          }
          if (sc.pos <= 0) {
            sc.pos = 0;
            sc.dir = 1;
          }
        }
        break;
      case 'shakeTrain':
        sc.t += dt;
        if (!sc.go && sc.t >= 1200) {
          sc.go = true;
          sc.t = 0;
          this.sfx('tick');
        } else if (sc.go && sc.t >= SHAKE_WINDOW_MS) this.scene = this.shakeResult(sc.count);
        break;
      case 'battle':
        this.tickBattle(sc.b, dt);
        break;
      case 'msg':
        sc.t += dt;
        if (sc.t >= MSG_PAGE_MS) this.advanceMsg(sc);
        break;
    }
    // Re-beep the encounter alert a few times so it's noticeable.
    if (this.s.pending && this.alertBeeps > 0 && this.scene.k !== 'battle') {
      this.alertT += dt;
      if (this.alertT >= 3500) {
        this.alertT = 0;
        this.alertBeeps--;
        if (this.alertBeeps > 0) this.sfx('alert');
      }
    }
  }

  private timingResult(hits: number): Scene {
    const gain = hits >= 5 ? 2 : hits >= 3 ? 1 : 0;
    this.s.baseAp += gain;
    this.commit();
    this.sfx(gain ? 'level' : 'lose');
    return this.msg([{ lines: [`HIT ${hits}/${TIMING_ROUNDS}`] }, { lines: gain ? [`AP +${gain}`] : ['TRY', 'AGAIN'] }], () => ({ k: 'train', i: 0 }));
  }

  private shakeResult(count: number): Scene {
    const gain = count >= SHAKE_TRAIN_TARGET ? 3 : count >= 14 ? 1 : 0;
    this.s.baseHp += gain;
    this.commit();
    this.sfx(gain ? 'level' : 'lose');
    return this.msg([{ lines: [`SHAKE ${count}`] }, { lines: gain ? [`HP +${gain}`] : ['TRY', 'AGAIN'] }], () => ({ k: 'train', i: 1 }));
  }

  // ------------------------------------------------------------------ render

  private sprite(id: string, x: number, y: number, bob = true) {
    const f = spriteFor(id);
    this.bm.blit(f[bob && Math.floor(this.frame / 8) % 2 ? 1 : 0], 16, x, y);
  }

  private blink(period = 8) {
    return Math.floor(this.frame / period) % 2 === 0;
  }

  private itemList(): ({ core: CoreId } | { ally: string })[] {
    return [
      ...this.s.cores.map((core) => ({ core })),
      ...this.s.allies.map((a) => ({ ally: LINES[a].forms[0] })),
    ];
  }

  render(): Bitmap {
    const bm = this.bm;
    bm.clear();
    const sc = this.scene;
    const f = this.frame;
    const s = this.s;
    switch (sc.k) {
      case 'boot': {
        bm.textC(6, 'STRIDE');
        bm.fill(6, 13, 28, 1);
        bm.textC(16, 'POCKET 3');
        if (sc.t > 900 && this.blink()) bm.textC(25, 'PRESS B');
        break;
      }
      case 'select': {
        const id = LINES[STARTERS[sc.i]].forms[0];
        bm.textC(0, 'CHOOSE');
        this.sprite(id, 12, 7);
        if (this.blink(6)) {
          bm.text(1, 13, '<');
          bm.text(36, 13, '>');
        }
        bm.textC(26, creature(id).name, f);
        break;
      }
      case 'hatch': {
        const crack = Math.min(3, Math.floor(sc.t / 700));
        const wob = sc.t > 600 ? (Math.floor(f / 2) % 3) - 1 : 0;
        if (sc.t > 2600 && this.blink(2)) bm.fill(0, 0, W, 32);
        else bm.blit(eggSprite(crack), EGG_W, 14 + wob, 9);
        break;
      }
      case 'idle':
        this.renderIdle();
        break;
      case 'menu': {
        if (s.pending && this.blink()) bm.text(0, 0, '!');
        bm.textC(0, 'MENU');
        bm.fill(0, 6, W, 1);
        bm.textC(14, MENU[sc.i]);
        if (this.blink(6)) {
          bm.text(0, 14, '<');
          bm.text(37, 14, '>');
        }
        for (let i = 0; i < MENU.length; i++) {
          const x = 10 + i * 4 + 1;
          if (i === sc.i) bm.fill(x, 26, 3, 3);
          else bm.set(x + 1, 27);
        }
        break;
      }
      case 'status':
        this.renderStatus(sc.page);
        break;
      case 'map': {
        const a = areaDef(s.area);
        bm.textC(0, s.loop ? `AREA ${a.id}+${s.loop}` : `AREA ${a.id}`);
        bm.textC(8, a.name, f);
        bm.bar(2, 16, 36, 4, s.areaSteps / a.distance);
        const mx = 2 + Math.round((33 * s.areaSteps) / a.distance);
        if (this.blink(5)) bm.fill(mx, 14, 2, 1);
        bm.textC(24, `${a.distance - s.areaSteps} LEFT`, f);
        break;
      }
      case 'items': {
        const list = this.itemList();
        if (!list.length) {
          bm.textC(8, 'NO');
          bm.textC(16, 'ITEMS');
          break;
        }
        const it = list[sc.i % list.length];
        if ('core' in it) {
          bm.blit(coreIcon(it.core), CORE_W, 16, 2);
          bm.textC(13, CORE_NAME[it.core]);
          const ok = s.line && LINES[s.line].armor.some((x) => x.core === it.core);
          bm.textC(22, ok ? 'ARMOR OK' : 'CORE');
        } else {
          this.sprite(it.ally, 12, 0);
          bm.textC(20, creature(it.ally).name, f);
          bm.textC(26, 'ALLY');
        }
        bm.text(0, 0, `${(sc.i % list.length) + 1}`);
        break;
      }
      case 'config': {
        if (sc.confirm) {
          bm.textC(4, 'RESET?');
          bm.textC(14, 'B = YES');
          bm.textC(22, 'C = NO');
          break;
        }
        const item = CONFIG[sc.i];
        const st = s.settings;
        bm.textC(2, item);
        const val =
          item === 'SHELL'
            ? SHELLS.find((x) => x.id === st.shell)!.name
            : item === 'SOUND'
              ? st.muted ? 'OFF' : 'ON'
              : item === 'SHK STEP'
                ? st.shakeSteps ? 'ON' : 'OFF'
                : 'PRESS B';
        bm.fill(0, 11, W, 9);
        const tw = textWidth(val);
        bm.text(Math.floor((W - tw) / 2), 13, val, 0);
        for (let i = 0; i < CONFIG.length; i++) {
          const x = 12 + i * 4 + 1;
          if (i === sc.i) bm.fill(x, 26, 3, 3);
          else bm.set(x + 1, 27);
        }
        break;
      }
      case 'train': {
        bm.textC(0, 'TRAIN');
        bm.fill(0, 6, W, 1);
        bm.textC(11, sc.i === 0 ? 'TIMING' : 'SHAKE');
        bm.textC(19, sc.i === 0 ? 'AP UP' : 'HP UP');
        bm.textC(27, `EN ${s.energy}`);
        break;
      }
      case 'timing': {
        bm.text(0, 0, `R${Math.min(sc.round + 1, TIMING_ROUNDS)}`);
        for (let i = 0; i < sc.hits; i++) bm.fill(38 - i * 3, 1, 2, 2);
        const x0 = 4;
        bm.frame(x0, 12, 32, 7);
        bm.fill(x0 + 1 + sc.zone, 13, 6, 5);
        const cx = x0 + 1 + Math.round(sc.pos);
        bm.invert(cx, 10, 1, 11);
        if (sc.flash > 0) bm.textC(25, sc.hit ? 'GOOD!' : 'MISS');
        else bm.textC(25, 'PRESS B');
        break;
      }
      case 'shakeTrain': {
        if (!sc.go) {
          bm.textC(8, 'READY');
          bm.textC(18, 'SHAKE!');
          break;
        }
        bm.textC(0, `${Math.ceil((SHAKE_WINDOW_MS - sc.t) / 1000)}`);
        this.sprite(rookieOf(s), 12 + (sc.count % 2 ? 1 : -1), 5, false);
        bm.bar(2, 25, 36, 5, sc.count / SHAKE_TRAIN_TARGET);
        bm.text(1, 0, `${sc.count}`);
        break;
      }
      case 'battle':
        this.renderBattle(sc.b);
        break;
      case 'msg': {
        const p = sc.pages[sc.page];
        if (p.sprite) {
          this.sprite(p.sprite, 12, 2);
          bm.textC(25, p.lines[0], f);
        } else if (p.core) {
          bm.blit(coreIcon(p.core), CORE_W, 16, 2);
          p.lines.forEach((l, i) => bm.textC(13 + i * 8, l, f));
        } else {
          const n = p.lines.length;
          const y0 = 16 - Math.round((n * 8 - 3) / 2);
          p.lines.forEach((l, i) => bm.textC(y0 + i * 8, l, f));
        }
        break;
      }
    }
    return bm;
  }

  private renderIdle() {
    const bm = this.bm;
    const s = this.s;
    const f = this.frame;
    bm.text(0, 0, 'EN');
    bm.bar(8, 0, 14, 5, s.energy / MAX_ENERGY);
    const a = areaDef(s.area);
    const label = `A${a.id}`;
    bm.text(W - textWidth(label), 0, label);

    if (!s.line) return;
    const id = rookieOf(s);
    // Wander back and forth like an LCD pet.
    const cyc = Math.floor(f / 3) % 32;
    const off = cyc < 16 ? cyc - 8 : 24 - cyc;
    if (s.pending) {
      this.sprite(id, 4, 7);
      if (this.blink(4)) {
        bm.fill(27, 8, 3, 9);
        bm.fill(27, 19, 3, 3);
      }
      if (this.blink(6)) bm.textC(26, s.pending.kind === 'boss' ? 'BOSS!' : 'BATTLE!');
    } else {
      this.sprite(id, 12 + off, 7);
      bm.text(0, 26, '#');
      const left = `${a.distance - s.areaSteps}`;
      bm.text(W - textWidth(left), 26, left);
      // tiny progress track
      const px = 5 + Math.round((W - 7 - textWidth(left) - 5) * (s.areaSteps / a.distance));
      for (let x = 5; x < W - textWidth(left) - 2; x += 2) bm.set(x, 28);
      bm.fill(px, 27, 2, 3);
    }
  }

  private renderStatus(page: number) {
    const bm = this.bm;
    const s = this.s;
    const f = this.frame;
    if (!s.line) return;
    const id = rookieOf(s);
    const st = partnerStats(s, id);
    switch (page) {
      case 0:
        this.sprite(id, 12, 0);
        bm.textC(18, creature(id).name, f);
        bm.textC(26, `LV ${s.level}`);
        break;
      case 1:
        bm.textC(2, STAGE_LABEL[creature(id).stage]);
        bm.textC(12, `XP ${s.xp}`);
        bm.textC(20, `/${xpToNext(s.level)}`);
        break;
      case 2:
        bm.text(0, 2, '*');
        bm.textIn(4, 36, 2, `HP ${st.hp}`);
        bm.text(0, 12, '>');
        bm.textIn(4, 36, 12, `AP ${st.ap}`);
        bm.textC(22, `EN ${s.energy}`);
        break;
      case 3: {
        const tot = s.wins + s.losses;
        bm.textC(2, `WIN ${s.wins}`);
        bm.textC(10, `LOSE ${s.losses}`);
        bm.textC(20, tot ? `${Math.round((100 * s.wins) / tot)}%` : '--%');
        break;
      }
      case 4:
        bm.textC(2, 'STEPS');
        bm.textC(12, `${s.totalSteps}`, f);
        bm.textC(22, `${s.cores.length} CORES`, f);
        break;
    }
    for (let i = 0; i < STATUS_PAGES; i++) {
      bm.set(13 + i * 3, 31);
      if (i === page) bm.set(14 + i * 3, 31);
    }
  }

  private renderBattle(b: Battle) {
    const bm = this.bm;
    const f = this.frame;
    const t = b.t;
    bm.bar(0, 0, 18, 4, b.php / b.pmax);
    bm.bar(22, 0, 18, 4, b.ehp / b.emax);

    let px = 1;
    let ex = 23;
    let showP = true;
    let showE = true;
    let pid = b.form;

    switch (b.phase) {
      case 'intro':
        ex = 23 + Math.round(Math.max(0, 1 - t / 700) * 20);
        if (t < 900 && b.boss) {
          if (this.blink(3)) bm.textC(26, 'BOSS!');
        } else bm.textC(26, creature(b.enemy).name, f);
        break;
      case 'menu': {
        const opts = this.battleOptions(b);
        const opt = opts[Math.min(b.i, opts.length - 1)];
        bm.textC(26, opt);
        if (this.blink(6)) {
          bm.text(0, 26, '<');
          bm.text(37, 26, '>');
        }
        break;
      }
      case 'note':
        bm.textC(26, b.note ?? '');
        break;
      case 'armor': {
        const opts = armorOptions(this.s, b.form);
        const o = opts[b.i % opts.length];
        showE = false;
        bm.blit(coreIcon(o.core), CORE_W, 27, 9);
        bm.textC(26, CORE_NAME[o.core]);
        break;
      }
      case 'evolve': {
        showE = false;
        px = 12;
        // Alternate forms faster and faster, then reveal.
        const period = Math.max(1, Math.round(8 - t / 300));
        if (t < 2000) pid = Math.floor(f / period) % 2 ? b.to! : b.from!;
        else pid = b.to!;
        if (t > 1900 && t < 2100) {
          bm.fill(0, 0, W, 32);
          return;
        }
        bm.textC(26, t < 2000 ? 'EVOLVE!' : creature(b.to!).name, f);
        break;
      }
      case 'shake': {
        const left = Math.ceil((3000 - t) / 1000);
        bm.text(19, 12, `${clamp(left, 0, 3)}`);
        px += b.count % 2 ? 1 : 0;
        bm.bar(2, 25, 36, 6, b.count / SHAKE_FULL);
        if (b.count >= SHAKE_FULL && this.blink(2)) bm.invert(3, 26, 34, 4);
        if (b.count === 0 && this.blink(4)) bm.textC(18, 'SHAKE!');
        break;
      }
      case 'clash': {
        const c = b.last!;
        if (t < 300) {
          px += 2;
          ex -= 2;
        } else if (t < 900) {
          const k = (t - 300) / 600;
          if (c.winner === 'p' || c.winner === 'tie') {
            const x = Math.round(17 + k * (c.winner === 'tie' ? 2 : 6));
            bm.fill(x, 12, c.crit ? 4 : 3, c.crit ? 4 : 3);
          }
          if (c.winner === 'e' || c.winner === 'tie') {
            const x = Math.round(21 - k * (c.winner === 'tie' ? 2 : 6));
            bm.fill(x, 12, 3, 3);
          }
        } else if (this.blink(2)) {
          if (c.winner === 'p') showE = false;
          else if (c.winner === 'e') showP = false;
        }
        bm.textC(26, c.crit ? 'CRITICAL' : `X${b.count}`);
        break;
      }
      case 'outcome': {
        const c = b.last!;
        const txt = c.winner === 'p' ? `HIT ${c.dmg}` : c.winner === 'e' ? `OUCH ${c.dmg}` : 'CLASH';
        bm.textC(26, txt);
        break;
      }
    }
    if (showP) this.sprite(pid, px, 7);
    if (showE) this.sprite(b.enemy, ex, 7);
  }
}
