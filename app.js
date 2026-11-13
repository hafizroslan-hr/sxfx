/* ==========================================================================
   Health Quest — vanilla JS. All data lives in localStorage on this device.
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/* ------------------------------------------------------------------ state */
const SAVE_KEY = 'hq-save-v1';
const OUTFITS = ['#d84848', '#3878d8', '#38a058', '#f0a030', '#9050c8', '#20283a'];

function defaultState() {
  return {
    profile: null, // { name, outfit }
    xp: 0,
    days: {},      // 'YYYY-MM-DD' → { steps, sleep, water, active, hr, claimed: [] }
    badges: [],
    goals: { steps: 10000, sleep: 7.5, water: 8, active: 30 },
    textSpeed: 22,
    notify: {
      enabled: false, start: '08:00', end: '21:00', every: 120,
      skip: [], sent: {}, include: { steps: true, quests: true, level: true, sleep: true },
    },
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!raw) return defaultState();
    const d = defaultState();
    return {
      ...d, ...raw,
      goals: { ...d.goals, ...raw.goals },
      notify: { ...d.notify, ...raw.notify, include: { ...d.notify.include, ...(raw.notify || {}).include } },
    };
  } catch { return defaultState(); }
}
let S = load();
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* storage full/blocked */ } };

const day = (k = dayKey()) => (S.days[k] ||= { steps: 0, sleep: 0, water: 0, active: 0, hr: 0, claimed: [] });

/* ----------------------------------------------------------- progression */
function levelInfo(xp = S.xp) {
  let level = 1, need = 100, into = xp;
  while (into >= need && level < 99) { into -= need; level++; need = 100 + 50 * (level - 1); }
  return { level, into, need };
}

function hpPct(k = dayKey()) {
  const d = S.days[k];
  if (!d || !d.sleep) return 50;
  return clamp(Math.round((d.sleep / S.goals.sleep) * 100), 5, 100);
}

function quests(k = dayKey()) {
  const d = day(k), g = S.goals;
  const qs = [
    { id: 'stroll', icon: 'shoe', title: 'MORNING STROLL', desc: 'Warm up those legs.', cur: d.steps, goal: Math.min(3000, Math.round(g.steps * 0.3)), unit: 'STEPS', xp: 30 },
    { id: 'route', icon: 'flag', title: 'THE LONG ROUTE', desc: 'Reach the flag at the end of the route.', cur: d.steps, goal: g.steps, unit: 'STEPS', xp: 100 },
    { id: 'mile', icon: 'star', title: 'EXTRA MILE', desc: 'Keep going past the flag!', cur: d.steps, goal: Math.round(g.steps * 1.3), unit: 'STEPS', xp: 60 },
    { id: 'rest', icon: 'moon', title: 'WELL RESTED', desc: 'Sleep well last night to restore HP.', cur: d.sleep, goal: g.sleep, unit: 'H', xp: 80 },
    { id: 'water', icon: 'drop', title: 'HYDRATION', desc: 'Drink glasses of water.', cur: d.water, goal: g.water, unit: 'GLS', xp: 40 },
    { id: 'train', icon: 'flame', title: 'TRAINING', desc: 'Get your heart pumping.', cur: d.active, goal: g.active, unit: 'MIN', xp: 60 },
    { id: 'checkup', icon: 'heart', title: 'CHECK-UP', desc: 'Log your resting heart rate.', cur: d.hr ? 1 : 0, goal: 1, unit: '', xp: 20 },
  ];
  const others = qs.length;
  const done = qs.filter((q) => q.cur >= q.goal).length;
  qs.push({ id: 'champ', icon: 'crown', title: 'CHAMPION DAY', desc: 'Clear every other quest today.', cur: done, goal: others, unit: 'QUESTS', xp: 120 });
  return qs.map((q) => ({ ...q, done: q.cur >= q.goal, claimed: d.claimed.includes(q.id) }));
}

function streak() {
  let n = 0;
  const d = new Date();
  // Today counts only if already hit; otherwise start from yesterday.
  if (!((S.days[dayKey(d)] || {}).steps >= S.goals.steps)) d.setDate(d.getDate() - 1);
  for (;;) {
    const x = S.days[dayKey(d)];
    if (x && x.steps >= S.goals.steps) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

const allDays = () => Object.values(S.days);
const BADGES = [
  { id: 'sprout', name: 'SPROUT', shape: 'circle', c: ['#58c058', '#a8f080'], desc: 'Log your first day.', test: () => allDays().some((d) => d.steps || d.sleep || d.water || d.active) },
  { id: 'trail', name: 'TRAIL', shape: 'diamond', c: ['#e08838', '#ffd070'], desc: 'Walk 10,000 steps in one day.', test: () => allDays().some((d) => d.steps >= 10000) },
  { id: 'dream', name: 'DREAM', shape: 'star', c: ['#7058d0', '#c0b0ff'], desc: 'Hit your sleep goal on 7 nights.', test: () => allDays().filter((d) => d.sleep >= S.goals.sleep).length >= 7 },
  { id: 'wave', name: 'WAVE', shape: 'drop', c: ['#3888e0', '#a0e0ff'], desc: 'Hit your water goal on 5 days.', test: () => allDays().filter((d) => d.water >= S.goals.water).length >= 5 },
  { id: 'blaze', name: 'BLAZE', shape: 'flame', c: ['#e04838', '#ffc048'], desc: 'Hit your active goal on 5 days.', test: () => allDays().filter((d) => d.active >= S.goals.active).length >= 5 },
  { id: 'streak', name: 'STREAK', shape: 'shield', c: ['#309890', '#90f0d8'], desc: 'Reach your step goal 7 days in a row.', test: () => streak() >= 7 },
  { id: 'titan', name: 'TITAN', shape: 'hex', c: ['#808898', '#e8f0f8'], desc: 'Walk 250,000 steps in total.', test: () => allDays().reduce((a, d) => a + (d.steps || 0), 0) >= 250000 },
  { id: 'crown', name: 'CROWN', shape: 'crown', c: ['#d8a820', '#fff090'], desc: 'Reach level 10.', test: () => levelInfo().level >= 10 },
];

function checkBadges() {
  const got = [];
  for (const b of BADGES) if (!S.badges.includes(b.id) && b.test()) { S.badges.push(b.id); got.push(b); }
  if (got.length) save();
  return got;
}

/* ------------------------------------------------------------ pixel art */
// Hero sprite (original design): headband, jacket in outfit colour, backpack straps.
// 0 transparent · 1 ink · 2 skin · 3 outfit · 4 hair · 5 white · 6 trousers · 7 shoe
const HERO = [
  '................',
  '.....111111.....',
  '....14444441....',
  '...1444444441...',
  '...1333333331...',
  '...1455555541...',
  '...1421221241...',
  '...1222222221...',
  '....12255221....',
  '...1133333311...',
  '..123313313321..',
  '..122333333221..',
  '...1133333311...',
  '....16666661....',
  '....166..661....',
  '....177..771....',
];
const HERO_PAL = (outfit) => ({ 1: '#20283a', 2: '#f8c8a0', 3: outfit, 4: '#583828', 5: '#ffffff', 6: '#384060', 7: '#20283a' });

function drawSprite(ctx, rows, pal, x, y, scale = 1, flip = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[flip ? row.length - 1 - c : c];
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}
function drawHero(ctx, x, y, scale = 1, frame = 0) {
  const pal = HERO_PAL((S.profile && S.profile.outfit) || OUTFITS[0]);
  // frame 1 = bob: draw body one pixel lower except feet
  if (frame) {
    drawSprite(ctx, HERO.slice(0, 14), pal, x, y + scale, scale);
    drawSprite(ctx, HERO.slice(14), pal, x, y + 14 * scale, scale);
  } else drawSprite(ctx, HERO, pal, x, y, scale);
}

// 8x8 icons
const ICONS = {
  shoe: ['........', '........', '..111...', '..1331..', '..13331.', '.1333331', '11555551', '.1111111'],
  moon: ['...1111.', '..1331..', '.1331...', '.133....', '.133....', '.1331...', '..13311.', '...1111.'],
  drop: ['...11...', '...11...', '..1331..', '.133331.', '.135331.', '.133331.', '..1331..', '...11...'],
  flame: ['...1....', '..131...', '..1331..', '.13331.1', '.1353311', '13355331', '.133331.', '..1111..'],
  heart: ['........', '.11..11.', '13311331', '13533331', '13333331', '.133331.', '..1331..', '...11...'],
  flag: ['11111...', '13331...', '13333111', '13333331', '1..11111', '1.......', '1.......', '1.......'],
  star: ['...11...', '...131..', '.111331.', '13333331', '.133331.', '.131131.', '.11..11.', '........'],
  crown: ['........', '1..11..1', '11.11.11', '13133131', '13333331', '13353331', '11111111', '........'],
};
const ICON_COL = { shoe: '#e05040', moon: '#e8c040', drop: '#3888e0', flame: '#f07030', heart: '#e04050', flag: '#e04838', star: '#f0c030', crown: '#d8a820' };
function drawIcon(canvas, name, scale) {
  const ctx = canvas.getContext('2d');
  const rows = ICONS[name];
  canvas.width = 8 * scale; canvas.height = 8 * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSprite(ctx, rows, { 1: '#20283a', 3: ICON_COL[name], 5: '#ffffff' }, 0, 0, scale);
}

// 16x16 badge shapes, auto-outlined and shaded.
function badgeMask(shape, x, y) {
  const cx = x - 7.5, cy = y - 7.5, r = Math.hypot(cx, cy);
  switch (shape) {
    case 'circle': return r <= 7;
    case 'diamond': return Math.abs(cx) + Math.abs(cy) <= 7.6;
    case 'star': { const t = Math.atan2(cy, cx) + Math.PI / 2; return r <= 3.2 + 4.3 * Math.pow(Math.max(0, Math.cos(2.5 * t)), 2) || r <= 3.6; }
    case 'drop': return y >= 7 ? Math.hypot(cx, y - 9.5) <= 5.6 : Math.abs(cx) <= (y + 0.5) * 0.62;
    case 'flame': { const w = Math.sin(y * 1.3) * 0.8; return y >= 7 ? Math.hypot(cx, y - 9.5) <= 5.6 : Math.abs(cx + w) <= (y + 0.5) * 0.55; }
    case 'shield': return y >= 1 && (y <= 8 ? Math.abs(cx) <= 6.6 : Math.abs(cx) <= 6.6 - (y - 8) * 0.95);
    case 'hex': return Math.abs(cy) <= 6.6 && Math.abs(cx) <= 7.4 - Math.abs(cy) * 0.55;
    case 'crown': {
      if (y >= 7 && y <= 13) return Math.abs(cx) <= 6.6;
      if (y >= 2 && y < 7) return [1.5, 7.5, 13.5].some((px) => Math.abs(x - px) <= (y - 2) * 0.55 + 0.5);
      return false;
    }
  }
  return false;
}
function drawBadge(canvas, b, scale = 3) {
  const ctx = canvas.getContext('2d');
  canvas.width = 16 * scale; canvas.height = 16 * scale;
  const m = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && badgeMask(b.shape, x, y);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!m(x, y)) continue;
    const edge = !m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1);
    let col = b.c[0];
    if (edge) col = '#20283a';
    else if (x + y < 12 && (!m(x - 2, y) || !m(x, y - 2))) col = b.c[1];
    else if (x + y > 20) col = shade(b.c[0]);
    ctx.fillStyle = col;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(5 * scale, 4 * scale, scale, scale);
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.72);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/* ------------------------------------------------------------ overworld */
const MAP_W = 160, MAP_H = 144;
// Route waypoints (pixel centres). The hero walks this path as steps accumulate.
const ROUTE = [[24, 124], [24, 100], [72, 100], [72, 60], [120, 60], [120, 28], [140, 28]];
const AREAS = ['MAPLE PATH', 'RIVER WALK', 'CEDAR HILL', 'MISTY RIDGE', 'SUNSET ROAD', 'SUMMIT TRAIL'];

function routePoint(t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, ay] = ROUTE[i - 1], [bx, by] = ROUTE[i];
    const len = Math.abs(bx - ax) + Math.abs(by - ay);
    segs.push({ ax, ay, bx, by, len }); total += len;
  }
  let d = clamp(t, 0, 1) * total;
  for (const s of segs) {
    if (d <= s.len) { const k = s.len ? d / s.len : 0; return [s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k]; }
    d -= s.len;
  }
  return ROUTE[ROUTE.length - 1];
}

let mapStatic = null;
function buildMapStatic() {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d');
  // grass with tufts
  g.fillStyle = '#78c060'; g.fillRect(0, 0, MAP_W, MAP_H);
  g.fillStyle = '#5ca84c';
  for (let y = 0; y < MAP_H; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < MAP_W; x += 8) { g.fillRect(x + 2, y + 3, 1, 2); g.fillRect(x + 4, y + 3, 1, 2); }
  // pond
  g.fillStyle = '#20283a'; g.fillRect(95, 87, 50, 34);
  g.fillStyle = '#4890e0'; g.fillRect(97, 89, 46, 30);
  g.fillStyle = '#a8d8f8'; for (let i = 0; i < 4; i++) g.fillRect(101 + i * 10, 95 + (i % 2) * 10, 5, 1);
  // path (sand) along route, 14px wide with darker edges
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, ay] = ROUTE[i - 1], [bx, by] = ROUTE[i];
    const x = Math.min(ax, bx) - 7, y = Math.min(ay, by) - 7, w = Math.abs(bx - ax) + 14, h = Math.abs(by - ay) + 14;
    g.fillStyle = '#c8a868'; g.fillRect(x, y, w, h);
  }
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, ay] = ROUTE[i - 1], [bx, by] = ROUTE[i];
    const x = Math.min(ax, bx) - 6, y = Math.min(ay, by) - 6, w = Math.abs(bx - ax) + 12, h = Math.abs(by - ay) + 12;
    g.fillStyle = '#e8d098'; g.fillRect(x, y, w, h);
  }
  g.fillStyle = '#d0b478';
  for (let i = 0; i < 40; i++) { const [px, py] = routePoint(i / 40); g.fillRect(Math.round(px) + ((i * 7) % 9) - 4, Math.round(py) + ((i * 5) % 7) - 3, 1, 1); }
  // trees
  const tree = (x, y) => {
    g.fillStyle = '#20283a'; g.fillRect(x + 1, y, 12, 12); g.fillRect(x, y + 1, 14, 10);
    g.fillStyle = '#2f7a3a'; g.fillRect(x + 1, y + 1, 12, 10);
    g.fillStyle = '#48a050'; g.fillRect(x + 2, y + 2, 7, 5);
    g.fillStyle = '#20283a'; g.fillRect(x + 5, y + 12, 4, 4);
    g.fillStyle = '#7a5030'; g.fillRect(x + 6, y + 12, 2, 3);
  };
  [[0, 0], [16, 0], [32, 0], [48, 0], [0, 16], [0, 32], [0, 48], [0, 64], [144, 48], [144, 64], [144, 128], [128, 128], [40, 128], [56, 128], [40, 20], [88, 20], [104, 16], [48, 64], [88, 72], [64, 36]].forEach(([x, y]) => tree(x, y));
  // house at route start
  g.fillStyle = '#20283a'; g.fillRect(4, 112, 40, 32);
  g.fillStyle = '#c84838'; g.fillRect(6, 114, 36, 12);
  g.fillStyle = '#e06850'; for (let x = 6; x < 42; x += 4) g.fillRect(x, 115, 2, 10);
  g.fillStyle = '#f0e8d0'; g.fillRect(6, 126, 36, 16);
  g.fillStyle = '#20283a'; g.fillRect(20, 130, 8, 12);
  g.fillStyle = '#8fc8f0'; g.fillRect(9, 129, 7, 6); g.fillRect(32, 129, 7, 6);
  // sign
  g.fillStyle = '#20283a'; g.fillRect(84, 104, 12, 9); g.fillRect(89, 113, 2, 5);
  g.fillStyle = '#c89858'; g.fillRect(85, 105, 10, 7);
  return c;
}

let frameNo = 0;
function drawMap() {
  const cv = $('#map');
  const ctx = cv.getContext('2d');
  if (!mapStatic) mapStatic = buildMapStatic();
  ctx.drawImage(mapStatic, 0, 0);
  const d = day();
  const t = d.steps / S.goals.steps;
  // flowers sway
  const f = Math.floor(frameNo / 4) % 2;
  [[60, 118], [74, 124], [130, 12], [24, 70], [112, 132], [30, 84]].forEach(([x, y], i) => {
    ctx.fillStyle = i % 2 ? '#f8f8f8' : '#f0d040';
    ctx.fillRect(x + ((i + f) % 2), y, 3, 3);
    ctx.fillStyle = '#e04848'; ctx.fillRect(x + 1 + ((i + f) % 2), y + 1, 1, 1);
  });
  // goal flag
  const [fx, fy] = ROUTE[ROUTE.length - 1];
  ctx.fillStyle = '#20283a'; ctx.fillRect(fx + 2, fy - 14, 2, 18);
  ctx.fillStyle = t >= 1 ? '#f0c030' : '#e04838';
  const wave = Math.floor(frameNo / 3) % 2;
  ctx.fillRect(fx + 4, fy - 14 + wave, 9, 6);
  ctx.fillStyle = '#20283a'; ctx.fillRect(fx + 4, fy - 8 + wave, 9, 1);
  // progress dots behind the hero
  ctx.fillStyle = '#f8f4e3';
  for (let i = 0; i <= 20; i++) { if (i / 20 > t) break; const [px, py] = routePoint(i / 20); ctx.fillRect(Math.round(px), Math.round(py), 1, 1); }
  // hero
  const [hx, hy] = routePoint(t);
  const bob = Math.floor(frameNo / 6) % 2;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(hx) - 5, Math.round(hy) + 7, 10, 2);
  drawHero(ctx, Math.round(hx) - 8, Math.round(hy) - 8, 1, bob);
  // celebration sparkles
  if (t >= 1 && frameNo % 8 < 4) {
    ctx.fillStyle = '#fff8a0';
    [[-12, -10], [10, -12], [12, 4], [-12, 4]].forEach(([dx, dy]) => ctx.fillRect(Math.round(hx) + dx, Math.round(hy) + dy, 2, 2));
  }
}

/* ---------------------------------------------------------------- dialog */
let typing = null;
function typeText(el, text, onDone) {
  if (typing) clearInterval(typing.id);
  el.textContent = '';
  let i = 0;
  const speed = Number(S.textSpeed) || 22;
  const id = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) { clearInterval(id); typing = null; onDone && onDone(); }
  }, speed);
  typing = { id, el, text };
}
function finishTyping() {
  if (!typing) return false;
  clearInterval(typing.id);
  typing.el.textContent = typing.text;
  typing = null;
  return true;
}

let dialogIdx = 0;
function dialogLines() {
  const name = S.profile ? S.profile.name : 'HERO';
  const d = day(), g = S.goals, left = Math.max(0, g.steps - d.steps);
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const lines = [`${greet}, ${name}!\nYou've walked ${fmt(d.steps)} steps today.`];
  lines.push(left > 0 ? `${fmt(left)} more steps to\nreach the flag!` : `You reached the flag!\nThe route is yours today!`);
  const ready = quests().filter((q) => q.done && !q.claimed).length;
  if (ready) lines.push(`${ready} quest reward${ready > 1 ? 's are' : ' is'}\nready to claim!`);
  lines.push(d.sleep ? `You slept ${d.sleep}h last night.\nHP is at ${hpPct()}%.` : `Log last night's sleep\nto restore your HP!`);
  if (d.water < g.water) lines.push(`Stay hydrated! ${d.water}/${g.water}\nglasses so far.`);
  const st = streak();
  if (st > 1) lines.push(`Step streak: ${st} days!\nKeep it going!`);
  return lines;
}
function nextDialog(reset = false) {
  if (!reset && finishTyping()) return;
  const lines = dialogLines();
  dialogIdx = reset ? 0 : (dialogIdx + 1) % lines.length;
  typeText($('#dialog-text'), lines[dialogIdx]);
}

/* ----------------------------------------------------------------- popup */
const popupQueue = [];
let popupBusy = false;
function popup(text) {
  return new Promise((resolve) => { popupQueue.push({ text, resolve }); if (!popupBusy) showNextPopup(); });
}
function showNextPopup() {
  const item = popupQueue.shift();
  if (!item) { popupBusy = false; $('#popup').hidden = true; return; }
  popupBusy = true;
  $('#popup').hidden = false;
  typeText($('#popup-text'), item.text);
  $('#popup').onclick = () => {
    if (finishTyping()) return;
    item.resolve();
    showNextPopup();
  };
}

/* ------------------------------------------------------------ navigation */
const stack = [];
function show(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  $('#menu').hidden = true;
  if (stack[stack.length - 1] !== id) stack.push(id);
  RENDER[id] && RENDER[id]();
  window.scrollTo(0, 0);
}
function back() {
  stack.pop();
  show(stack.pop() || 'world');
}

/* ------------------------------------------------------------- renderers */
function renderHud() {
  const li = levelInfo();
  $('#hud-name').textContent = S.profile ? S.profile.name : '';
  $('#hud-lv').textContent = li.level;
  const hp = hpPct();
  const bar = $('#hud-hp');
  bar.style.width = hp + '%';
  bar.className = hp > 50 ? '' : hp > 20 ? 'mid' : 'lo';
  $('#hud-xp').style.width = (li.into / li.need) * 100 + '%';
  $('#area-sign').textContent = AREAS[(li.level - 1) % AREAS.length];
}

const RENDER = {
  world() {
    renderHud();
    // restart sign animation
    const s = $('#area-sign'); s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
    nextDialog(true);
  },

  quests() {
    $('#quest-date').textContent = dayKey();
    const ul = $('#quest-list');
    ul.innerHTML = '';
    for (const q of quests()) {
      const li = document.createElement('li');
      li.className = `box quest${q.done ? ' done' : ''}${q.claimed ? ' claimed' : ''}`;
      const pct = clamp((q.cur / q.goal) * 100, 0, 100);
      const curTxt = q.unit === 'H' ? q.cur : fmt(q.cur);
      const goalTxt = q.unit === 'H' ? q.goal : fmt(q.goal);
      li.innerHTML = `
        <canvas class="q-ico pixel"></canvas>
        <div>
          <h4>${q.title}</h4>
          <p class="q-desc">${q.desc}</p>
          <div class="bar-row"><div class="bar xp-bar"><i style="width:${pct}%"></i></div></div>
          <div class="q-foot">
            <span>${q.id === 'checkup' ? (q.done ? 'LOGGED' : 'NOT YET') : `${curTxt}/${goalTxt} ${q.unit}`}</span>
            ${q.claimed ? '<span class="stamp">CLEARED ✓</span>'
              : q.done ? `<button class="q-claim" data-claim="${q.id}">+${q.xp} EXP</button>`
              : `<span class="reward">${q.xp} EXP</span>`}
          </div>
        </div>`;
      drawIcon($('canvas', li), q.icon, 4);
      ul.appendChild(li);
    }
  },

  log() {
    const k = $('#log-date').value || dayKey();
    $('#log-date').value = k;
    $('#log-date').max = dayKey();
    const d = S.days[k] || {};
    for (const key of ['steps', 'sleep', 'water', 'active', 'hr']) $(`#in-${key}`).value = d[key] || '';
  },

  card() {
    const li = levelInfo();
    $('#card-name').textContent = S.profile.name;
    $('#card-lv').textContent = li.level;
    $('#card-xp').textContent = fmt(S.xp);
    const st = streak();
    $('#card-streak').textContent = `${st} DAY${st === 1 ? '' : 'S'}`;
    $('#card-xpbar').style.width = (li.into / li.need) * 100 + '%';
    const pc = $('#portrait'); const ctx = pc.getContext('2d');
    ctx.clearRect(0, 0, 32, 32); ctx.fillStyle = '#8fc8f0'; ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#78c060'; ctx.fillRect(0, 24, 32, 8);
    drawHero(ctx, 8, 10, 1);

    const keys = Object.keys(S.days).sort().slice(-7);
    const recent = keys.map((k) => S.days[k]);
    const avg = (f) => (recent.length ? recent.reduce((a, d) => a + (d[f] || 0), 0) / recent.length : 0);
    const total = allDays().reduce((a, d) => a + (d.steps || 0), 0);
    const best = allDays().reduce((a, d) => Math.max(a, d.steps || 0), 0);
    const rows = [
      ['STAMINA', Math.round(avg('steps') / 100), `avg ${fmt(avg('steps'))} steps`],
      ['REST', Math.round(avg('sleep') * 10), `avg ${avg('sleep').toFixed(1)}h`],
      ['POWER', Math.round(avg('active') * 2), `avg ${Math.round(avg('active'))} min`],
      ['SPIRIT', Math.round(avg('water') * 10), `avg ${avg('water').toFixed(1)} gls`],
    ];
    $('#card-stats').innerHTML =
      rows.map(([n, v, sub]) => `<tr><td>${n}</td><td><b>${v}</b> <span class="tiny">${sub}</span></td></tr>`).join('') +
      `<tr><td>TOTAL STEPS</td><td>${fmt(total)}</td></tr><tr><td>BEST DAY</td><td>${fmt(best)}</td></tr>` +
      `<tr><td>BADGES</td><td>${S.badges.length}/${BADGES.length}</td></tr>`;

    const chart = $('#week-chart');
    chart.innerHTML = '';
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const max = Math.max(S.goals.steps, ...days.map((d) => (S.days[dayKey(d)] || {}).steps || 0));
    for (const d of days) {
      const st = (S.days[dayKey(d)] || {}).steps || 0;
      const col = document.createElement('div');
      col.className = 'col';
      col.innerHTML = `<div class="b${st >= S.goals.steps ? ' hit' : ''}" style="height:${(st / max) * 80}%"></div><span>${'SMTWTFS'[d.getDay()]}</span>`;
      col.title = `${dayKey(d)}: ${fmt(st)} steps`;
      chart.appendChild(col);
    }
  },

  badges() {
    const grid = $('#badge-grid');
    grid.innerHTML = '';
    $('#badge-count').textContent = `${S.badges.length}/${BADGES.length}`;
    for (const b of BADGES) {
      const has = S.badges.includes(b.id);
      const btn = document.createElement('button');
      btn.className = `badge${has ? '' : ' locked'}`;
      btn.innerHTML = `<canvas class="pixel"></canvas><span>${has ? b.name : '???'}</span>`;
      drawBadge($('canvas', btn), b, 4);
      btn.onclick = () => {
        $$('.badge', grid).forEach((x) => x.classList.remove('sel'));
        btn.classList.add('sel');
        $('#badge-info').textContent = has ? `${b.name} BADGE — ${b.desc}` : `LOCKED — ${b.desc}`;
      };
      grid.appendChild(btn);
    }
  },

  notify() {
    const n = S.notify;
    $('#notif-start').value = n.start;
    $('#notif-end').value = n.end;
    $('#notif-every').value = String(n.every);
    for (const k of Object.keys(n.include)) $(`#inc-${k}`).checked = n.include[k];
    renderNotify();
  },

  options() {
    $('#g-steps').value = S.goals.steps;
    $('#g-sleep').value = S.goals.sleep;
    $('#g-water').value = S.goals.water;
    $('#g-active').value = S.goals.active;
    $('#text-speed').value = String(S.textSpeed);
  },
};

/* ---------------------------------------------------------- notifications */
function slots() {
  const n = S.notify;
  const a = minutesOf(n.start), b = minutesOf(n.end), out = [];
  if (b < a) return out;
  for (let m = a; m <= b; m += Number(n.every)) out.push(hhmm(m));
  return out;
}

function summary(at = new Date()) {
  const inc = S.notify.include;
  const d = day(), g = S.goals;
  const qs = quests();
  const done = qs.filter((q) => q.done);
  const li = levelInfo();
  const title = `HEALTH QUEST · ${pad(at.getHours())}:${pad(at.getMinutes())} REPORT`;
  const lines = [];
  if (inc.steps) {
    const left = Math.max(0, g.steps - d.steps);
    lines.push(left ? `👟 ${fmt(d.steps)} steps — ${fmt(left)} to go (${Math.floor((d.steps / g.steps) * 100)}%)` : `🏁 Goal smashed: ${fmt(d.steps)} steps!`);
  }
  if (inc.quests) {
    lines.push(done.length
      ? `⭐ ${done.length}/${qs.length} quests: ${done.slice(0, 3).map((q) => q.title.toLowerCase()).join(', ')}${done.length > 3 ? '…' : ''}`
      : '⭐ No quests cleared yet — first stop: Morning Stroll!');
  }
  if (inc.sleep) lines.push(`🌙 Sleep ${d.sleep || '—'}h · 💧 ${d.water}/${g.water} glasses`);
  if (inc.level) lines.push(`🎮 ${S.profile ? S.profile.name : 'Hero'} Lv ${li.level} · ${li.need - li.into} EXP to next`);
  const unclaimed = qs.filter((q) => q.done && !q.claimed).length;
  if (unclaimed) lines.push(`🎁 ${unclaimed} reward${unclaimed > 1 ? 's' : ''} waiting to claim`);
  return { title, body: lines.join('\n') || 'Open Health Quest to check your progress.' };
}

async function sendNotification(test = false) {
  const { title, body } = summary();
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    if (test) popup(`${title}\n\n${body}`);
    return false;
  }
  const opts = { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'hq-summary', renotify: true };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
    return true;
  } catch {
    try { new Notification(title, opts); return true; } catch { return false; }
  }
}

function nextSlot() {
  const today = dayKey(), now = nowMin();
  const sent = S.notify.sent[today] || [];
  return slots().find((s) => !S.notify.skip.includes(s) && !sent.includes(s) && minutesOf(s) >= now) || null;
}

function renderNotify() {
  const n = S.notify;
  const tg = $('#notif-toggle');
  tg.setAttribute('aria-checked', String(n.enabled));
  tg.textContent = n.enabled ? 'ON' : 'OFF';
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#notif-perm').textContent =
    perm === 'granted' ? 'Permission granted. Summaries will pop up at the times below.'
      : perm === 'denied' ? 'Notifications are blocked. Enable them in your browser settings.'
        : perm === 'unsupported' ? 'This browser has no notifications. Add to home screen (iOS 16.4+) or use Chrome.'
          : 'Turn on to allow notifications.';
  const sent = n.sent[dayKey()] || [];
  const chips = $('#slot-chips');
  chips.innerHTML = '';
  const list = slots();
  if (!list.length) chips.innerHTML = '<span class="tiny">"UNTIL" must be after "FROM".</span>';
  for (const s of list) {
    const b = document.createElement('button');
    b.className = `chip${n.skip.includes(s) ? ' off' : ''}${sent.includes(s) ? ' sent' : ''}`;
    b.textContent = s;
    b.setAttribute('aria-pressed', String(!n.skip.includes(s)));
    b.onclick = () => {
      n.skip = n.skip.includes(s) ? n.skip.filter((x) => x !== s) : [...n.skip, s];
      save(); renderNotify();
    };
    chips.appendChild(b);
  }
  const { title, body } = summary();
  $('#np-title').textContent = title;
  $('#np-body').textContent = body;
  $('#notif-next').textContent = n.enabled ? nextSlot() || 'tomorrow' : 'off';
}

/** Runs every 20s: fires any slot whose time has come (within a 20-min grace window). */
function schedulerTick() {
  const n = S.notify;
  if (!n.enabled) return;
  const today = dayKey(), now = nowMin();
  n.sent[today] ||= [];
  // keep only today's log
  for (const k of Object.keys(n.sent)) if (k !== today) delete n.sent[k];
  for (const s of slots()) {
    if (n.skip.includes(s) || n.sent[today].includes(s)) continue;
    const m = minutesOf(s);
    if (now >= m && now - m <= 20) { n.sent[today].push(s); save(); sendNotification(); break; }
  }
  if ($('#notify').classList.contains('active')) renderNotify();
}

/* ------------------------------------------------------------------ CSV */
const CSV_ALIASES = {
  date: ['date', 'day', 'start', 'startdate'],
  steps: ['steps', 'stepcount', 'step_count', 'step count'],
  sleep: ['sleep', 'sleephours', 'sleep_hours', 'sleep hours', 'asleep', 'sleep_h', 'sleepanalysis'],
  water: ['water', 'glasses', 'water_glasses'],
  active: ['active', 'activeminutes', 'active_minutes', 'active minutes', 'exercise', 'exerciseminutes', 'exercise_minutes', 'exercise time'],
  hr: ['hr', 'restinghr', 'resting_hr', 'resting heart rate', 'restingheartrate', 'heart_rate', 'heartrate'],
};
function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')));
  if (rows.length < 2) throw new Error('No data rows found.');
  const head = rows[0].map((h) => h.toLowerCase().replace(/\s*\(.*\)$/, ''));
  const col = {};
  for (const [k, names] of Object.entries(CSV_ALIASES)) {
    const i = head.findIndex((h) => names.includes(h) || names.includes(h.replace(/\s+/g, '')));
    if (i >= 0) col[k] = i;
  }
  if (col.date === undefined) throw new Error('Missing a "date" column.');
  let n = 0;
  for (const r of rows.slice(1)) {
    const raw = r[col.date];
    if (!raw) continue;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(raw);
    if (isNaN(dt)) continue;
    const d = day(dayKey(dt));
    for (const k of ['steps', 'sleep', 'water', 'active', 'hr']) {
      if (col[k] === undefined) continue;
      let v = parseFloat(r[col[k]]);
      if (!isFinite(v)) continue;
      if (k === 'sleep' && v > 24) v = Math.round((v / 60) * 4) / 4; // minutes → hours
      d[k] = k === 'sleep' ? v : Math.round(v);
    }
    n++;
  }
  return n;
}

/* ---------------------------------------------------------------- events */
async function afterDataChange() {
  save();
  for (const b of checkBadges()) await popup(`${S.profile.name} received the\n${b.name} BADGE!`);
}

async function claim(id) {
  const q = quests().find((x) => x.id === id);
  if (!q || !q.done || q.claimed) return;
  const before = levelInfo().level;
  day().claimed.push(id);
  S.xp += q.xp;
  save();
  RENDER.quests();
  await popup(`${q.title} cleared!\n${S.profile.name} gained ${q.xp} EXP!`);
  const after = levelInfo().level;
  if (after > before) await popup(`${S.profile.name} grew to\nLV. ${after}!`);
  await afterDataChange();
  renderHud();
}

function wire() {
  // Title
  const ng = !S.profile;
  $('#new-game').hidden = !ng;
  let outfit = OUTFITS[0];
  OUTFITS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === 0));
    b.setAttribute('aria-label', `Outfit ${i + 1}`);
    b.onclick = () => {
      outfit = c;
      $$('#outfits button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      drawTitle(c);
    };
    $('#outfits').appendChild(b);
  });
  $('#start-btn').onclick = async () => {
    if (!S.profile) {
      const name = ($('#name-input').value || 'ALEX').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8) || 'ALEX';
      S.profile = { name, outfit };
      save();
      show('world');
      await popup(`Welcome, ${name}!\nEvery step you take moves you along the route.`);
      await popup('Clear daily quests to earn EXP and collect all 8 BADGES!');
      await popup('Tap +LOG to record your steps, sleep and more. Good luck!');
    } else show('world');
  };

  // World
  $('#dialog').onclick = () => nextDialog();
  $('#menu-btn').onclick = () => {
    const m = $('#menu');
    m.hidden = !m.hidden;
    if (!m.hidden) $('button', m).focus();
  };
  $('[data-close-menu]').onclick = () => { $('#menu').hidden = true; };
  $$('[data-open]').forEach((b) => (b.onclick = () => show(b.dataset.open)));
  $$('[data-back]').forEach((b) => (b.onclick = back));

  // Quests
  $('#quest-list').onclick = (e) => { const b = e.target.closest('[data-claim]'); if (b) claim(b.dataset.claim); };

  // Log
  $$('.stat-input').forEach((row) => {
    const input = $('input', row), step = Number(row.dataset.step);
    $$('button', row).forEach((b) => (b.onclick = () => {
      const v = Math.max(0, (parseFloat(input.value) || 0) + Number(b.dataset.d) * step);
      input.value = String(Math.round(v * 100) / 100);
    }));
  });
  $('#log-date').onchange = RENDER.log;
  $('#save-log').onclick = async () => {
    const k = $('#log-date').value || dayKey();
    const d = day(k);
    for (const key of ['steps', 'sleep', 'water', 'active', 'hr']) {
      const v = parseFloat($(`#in-${key}`).value);
      d[key] = isFinite(v) && v >= 0 ? (key === 'sleep' ? v : Math.round(v)) : 0;
    }
    await afterDataChange();
    await popup(k === dayKey() ? 'Data saved!\nCheck your QUESTS for rewards.' : `Saved data for ${k}.`);
    show('world');
  };
  $('#csv-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const n = parseCsv(await f.text());
      await afterDataChange();
      await popup(`Imported ${n} day${n === 1 ? '' : 's'} of\nhealth data!`);
      RENDER.log();
    } catch (err) { popup(`Import failed.\n${err.message}`); }
    e.target.value = '';
  };

  // Notify
  $('#notif-toggle').onclick = async () => {
    const n = S.notify;
    if (!n.enabled && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignored */ }
    }
    n.enabled = !n.enabled;
    save(); renderNotify();
  };
  const upd = () => {
    const n = S.notify;
    n.start = $('#notif-start').value || '08:00';
    n.end = $('#notif-end').value || '21:00';
    n.every = Number($('#notif-every').value);
    for (const k of Object.keys(n.include)) n.include[k] = $(`#inc-${k}`).checked;
    save(); renderNotify();
  };
  ['#notif-start', '#notif-end', '#notif-every', '#inc-steps', '#inc-quests', '#inc-level', '#inc-sleep'].forEach((s) => ($(s).onchange = upd));
  $('#notif-test').onclick = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignored */ }
    }
    const ok = await sendNotification(true);
    if (ok) popup('Test summary sent!\nCheck your notifications.');
    renderNotify();
  };

  // Options
  $('#save-goals').onclick = async () => {
    const num = (sel, lo, hi, def) => { const v = parseFloat($(sel).value); return isFinite(v) ? clamp(v, lo, hi) : def; };
    S.goals = {
      steps: Math.round(num('#g-steps', 1000, 100000, 10000)),
      sleep: num('#g-sleep', 4, 12, 7.5),
      water: Math.round(num('#g-water', 1, 20, 8)),
      active: Math.round(num('#g-active', 5, 300, 30)),
    };
    S.textSpeed = Number($('#text-speed').value);
    save();
    await popup('Options saved!');
    back();
  };
  $('#export-btn').onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `health-quest-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#restore-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (!raw || typeof raw !== 'object' || !raw.days) throw new Error('Not a Health Quest backup.');
      localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
      S = load();
      await popup('Backup restored!');
      show('world');
    } catch (err) { popup(`Restore failed.\n${err.message}`); }
    e.target.value = '';
  };
  $('#reset-btn').onclick = () => {
    if (!confirm('Erase all Health Quest data on this device?')) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  };

  // Keyboard: Enter/Space advance text, Escape = back.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select')) return;
    if (e.key === 'Escape') { if (!$('#menu').hidden) $('#menu').hidden = true; else if (stack.length > 1) back(); }
  });

  // Day rollover: re-render if the date changes while open.
  let lastDay = dayKey();
  setInterval(() => {
    if (dayKey() !== lastDay) { lastDay = dayKey(); const cur = stack[stack.length - 1]; if (cur && RENDER[cur]) RENDER[cur](); }
  }, 60000);
}

/* ----------------------------------------------------------- title art */
function drawTitle(outfit) {
  const c = $('#title-art'); const g = c.getContext('2d');
  g.clearRect(0, 0, 160, 96);
  // sun
  g.fillStyle = '#ffe070'; g.fillRect(118, 10, 20, 20); g.fillRect(114, 14, 28, 12); g.fillRect(122, 6, 12, 28);
  // hills
  g.fillStyle = '#4c9440';
  for (let x = 0; x < 160; x++) { const h = 22 + Math.round(10 * Math.sin(x / 18) + 5 * Math.sin(x / 7)); g.fillRect(x, 96 - h, 1, h); }
  g.fillStyle = '#78c060';
  for (let x = 0; x < 160; x++) { const h = 12 + Math.round(4 * Math.sin(x / 11 + 1)); g.fillRect(x, 96 - h, 1, h); }
  // clouds
  g.fillStyle = '#ffffff';
  [[14, 18], [60, 8]].forEach(([x, y]) => { g.fillRect(x, y + 4, 28, 6); g.fillRect(x + 6, y, 14, 12); });
  const prev = S.profile;
  if (!S.profile) S.profile = { name: '', outfit };
  drawHero(g, 64, 50, 2, Math.floor(frameNo / 8) % 2);
  if (!prev) S.profile = null;
}

/* ------------------------------------------------------------------ boot */
function boot() {
  wire();
  $$('canvas[data-icon]').forEach((c) => drawIcon(c, c.dataset.icon, 2));
  stack.push('title');

  // 15 fps animation loop for the overworld and title art.
  let last = 0;
  const loop = (t) => {
    if (t - last >= 1000 / 15) {
      last = t;
      frameNo++;
      if ($('#world').classList.contains('active')) drawMap();
      else if ($('#title').classList.contains('active') && frameNo % 4 === 0) {
        const sel = $('#outfits [aria-checked="true"]');
        drawTitle(S.profile ? S.profile.outfit : sel ? sel.style.background : OUTFITS[0]);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  setInterval(schedulerTick, 20000);
  schedulerTick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedulerTick(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
