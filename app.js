/* Leave & OIL Tracker — single-page, offline-first web app.
 * Data is stored in the browser (localStorage). Use Admin → Backup to export/import.
 */
(() => {
  'use strict';

  const STORE_KEY = 'leaveTracker.v1';
  const UNLOCK_KEY = 'leaveTracker.unlocked';
  const EXPIRY_WARN_DAYS = 30;

  // ---------- State ----------
  const emptyState = () => ({ version: 1, settings: { pinHash: null, year: new Date().getFullYear() }, resources: [], txns: [] });
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('Could not load saved data', e);
      return emptyState();
    }
  }
  function normalize(s) {
    const base = emptyState();
    if (!s || typeof s !== 'object') return base;
    return {
      version: 1,
      settings: Object.assign(base.settings, s.settings || {}),
      resources: Array.isArray(s.resources) ? s.resources : [],
      txns: Array.isArray(s.txns) ? s.txns : [],
    };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save — storage is unavailable or full'); }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const getRes = id => state.resources.find(r => r.id === id);
  const txnsOf = rid => state.txns.filter(t => t.rid === rid);
  const round = n => Math.round(n * 100) / 100;
  const fmt = n => { const v = round(n); return (Number.isInteger(v) ? v.toString() : v.toFixed(1).replace(/\.0$/, '')); };
  const dayWord = n => `${fmt(n)} day${Math.abs(round(n)) === 1 ? '' : 's'}`;

  // ---------- Balances ----------
  function balances(rid) {
    const r = getRes(rid);
    const ts = txnsOf(rid);
    let alAdj = 0, alUsed = 0, oilEarned = 0, oilUsed = 0;
    for (const t of ts) {
      const d = Number(t.days) || 0;
      if (t.bucket === 'AL') {
        if (t.kind === 'leave') alUsed += d; else alAdj += d;
      } else if (t.bucket === 'OIL') {
        if (t.kind === 'leave') oilUsed += d;
        else if (t.kind === 'credit') oilEarned += d;
        else if (d >= 0) oilEarned += d; else oilUsed += -d;
      }
    }
    const alTotal = (Number(r?.alQuota) || 0) + alAdj;
    return {
      alTotal: round(alTotal), alUsed: round(alUsed), al: round(alTotal - alUsed),
      oilEarned: round(oilEarned), oilUsed: round(oilUsed), oil: round(oilEarned - oilUsed),
      oilLots: oilLots(rid, oilUsed),
    };
  }

  // Allocate OIL consumption to credits, earliest expiry first, to know what is left on each credit.
  function oilLots(rid, consumed) {
    const credits = txnsOf(rid)
      .filter(t => t.bucket === 'OIL' && (t.kind === 'credit' || (t.kind === 'adjust' && t.days > 0)))
      .map(t => ({ id: t.id, date: t.date, expiry: t.expiry || null, days: Number(t.days) || 0, note: t.note }))
      .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || (a.date || '').localeCompare(b.date || ''));
    let left = consumed;
    const today = todayISO();
    for (const c of credits) {
      const use = Math.min(c.days, Math.max(0, left));
      c.remaining = round(c.days - use);
      left -= use;
      c.expired = !!(c.expiry && c.expiry < today && c.remaining > 0);
      c.expiringSoon = !!(c.expiry && !c.expired && c.remaining > 0 && daysBetween(today, c.expiry) <= EXPIRY_WARN_DAYS);
    }
    return credits;
  }

  // ---------- Dates ----------
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  function workingDays(start, end) {
    if (!start || !end || end < start) return 0;
    let n = 0;
    const d = parseISO(start), e = parseISO(end);
    while (d <= e) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
    return n;
  }
  function fmtDate(s) {
    if (!s) return '';
    return parseISO(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtRange(a, b) { return !b || a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`; }

  // ---------- Helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $('#view');

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Admin PIN lock ----------
  async function hashPin(pin) {
    const data = new TextEncoder().encode('leave-tracker:' + pin);
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0; return 'djb2-' + h;
  }
  const isUnlocked = () => { if (!state.settings.pinHash) return true; try { return sessionStorage.getItem(UNLOCK_KEY) === state.settings.pinHash; } catch { return false; } };
  function setUnlocked(v) { try { v ? sessionStorage.setItem(UNLOCK_KEY, state.settings.pinHash) : sessionStorage.removeItem(UNLOCK_KEY); } catch {} }

  // Runs fn only after admin is unlocked (prompts for PIN if needed).
  function requireAdmin(fn) {
    if (isUnlocked()) return fn();
    openModal({
      title: 'Admin PIN',
      okText: 'Unlock',
      body: `<p class="muted small">Enter the admin PIN to make changes.</p>
        <div class="field"><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></div>`,
      onSubmit: async fd => {
        if ((await hashPin(fd.get('pin'))) !== state.settings.pinHash) return 'Incorrect PIN';
        setUnlocked(true); updateChrome(); setTimeout(fn, 0); return true;
      },
    });
  }

  // ---------- Modal ----------
  const modal = $('#modal');
  let modalHandler = null;
  function openModal({ title, body, okText = 'Save', danger = false, onSubmit, onOpen }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body + '<div class="notice danger" id="modalErr" hidden></div>';
    const ok = $('#modalOk');
    ok.textContent = okText;
    ok.className = 'btn ' + (danger ? 'danger' : 'primary');
    modalHandler = onSubmit;
    modal.showModal();
    onOpen && onOpen($('#modalBody'));
    const first = $('#modalBody [autofocus]') || $('#modalBody input, #modalBody select');
    first && first.focus();
  }
  $('#modalCancel').addEventListener('click', () => modal.close());
  $('#modalForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!modalHandler) return modal.close();
    const res = await modalHandler(new FormData(e.target), $('#modalBody'));
    if (res === true || res === undefined) { modal.close(); render(); }
    else { const err = $('#modalErr'); err.textContent = res; err.hidden = false; }
  });

  // ---------- Forms (shared) ----------
  function resourceForm(r = {}) {
    return `
      <div class="field"><label>Name</label><input name="name" required maxlength="80" value="${esc(r.name)}" placeholder="e.g. Aisyah Rahman" autofocus></div>
      <div class="field"><label>Role / team (optional)</label><input name="role" maxlength="80" value="${esc(r.role)}" placeholder="e.g. Business Analyst"></div>
      <div class="grid2">
        <div class="field"><label>Annual leave quota (days)</label><input name="alQuota" type="number" step="0.5" min="0" required value="${r.alQuota ?? 14}"></div>
        <div class="field"><label>Opening OIL balance</label><input name="oilOpening" type="number" step="0.5" min="0" value="0" ${r.id ? 'disabled title="Use Add OIL on the person page"' : ''}></div>
      </div>
      ${r.id ? '' : `<div class="field"><label>OIL expiry date (optional)</label><input name="oilExpiry" type="date"></div>`}`;
  }

  function addResource() {
    requireAdmin(() => openModal({
      title: 'Add resource',
      body: resourceForm(),
      onSubmit: fd => {
        const name = fd.get('name').trim();
        if (!name) return 'Name is required';
        const r = { id: uid(), name, role: fd.get('role').trim(), alQuota: Number(fd.get('alQuota')) || 0, createdAt: Date.now() };
        state.resources.push(r);
        const oil = Number(fd.get('oilOpening')) || 0;
        if (oil > 0) state.txns.push({ id: uid(), rid: r.id, bucket: 'OIL', kind: 'credit', days: oil, date: todayISO(), expiry: fd.get('oilExpiry') || null, note: 'Opening balance', createdAt: Date.now() });
        save(); toast(`${name} added`);
      },
    }));
  }

  function editResource(id) {
    const r = getRes(id);
    requireAdmin(() => openModal({
      title: 'Edit resource',
      body: resourceForm(r),
      onSubmit: fd => {
        const name = fd.get('name').trim();
        if (!name) return 'Name is required';
        Object.assign(r, { name, role: fd.get('role').trim(), alQuota: Number(fd.get('alQuota')) || 0 });
        save(); toast('Saved');
      },
    }));
  }

  function deleteResource(id) {
    const r = getRes(id);
    requireAdmin(() => openModal({
      title: 'Delete resource?',
      okText: 'Delete', danger: true,
      body: `<p>This removes <b>${esc(r.name)}</b> and all of their leave and OIL history. This cannot be undone.</p>`,
      onSubmit: () => {
        state.resources = state.resources.filter(x => x.id !== id);
        state.txns = state.txns.filter(t => t.rid !== id);
        save(); toast('Deleted');
        if (location.hash.startsWith('#/r/')) location.hash = '#/admin';
      },
    }));
  }

  function addOil(id) {
    const r = getRes(id);
    requireAdmin(() => openModal({
      title: `Add OIL — ${r.name}`,
      body: `
        <div class="grid2">
          <div class="field"><label>Days earned</label><input name="days" type="number" step="0.5" min="0.5" value="1" required autofocus></div>
          <div class="field"><label>Date earned</label><input name="date" type="date" value="${todayISO()}" required></div>
        </div>
        <div class="field"><label>Expiry date (optional)</label><input name="expiry" type="date"></div>
        <div class="field"><label>Reason</label><input name="note" maxlength="140" placeholder="e.g. Weekend go-live support"></div>`,
      onSubmit: fd => {
        const days = Number(fd.get('days'));
        if (!(days > 0)) return 'Days must be more than 0';
        const expiry = fd.get('expiry') || null;
        if (expiry && expiry < fd.get('date')) return 'Expiry date is before the date earned';
        state.txns.push({ id: uid(), rid: id, bucket: 'OIL', kind: 'credit', days, date: fd.get('date'), expiry, note: fd.get('note').trim(), createdAt: Date.now() });
        save(); toast(`+${dayWord(days)} OIL for ${r.name}`);
      },
    }));
  }

  function adjust(id) {
    const r = getRes(id);
    requireAdmin(() => openModal({
      title: `Adjust balance — ${r.name}`,
      body: `
        <p class="muted small">Use for carry-forward, corrections or forfeiting expired OIL. Positive adds days, negative removes days.</p>
        <div class="field"><label>Balance</label>
          <div class="seg"><label><input type="radio" name="bucket" value="AL" checked><span>Annual leave</span></label><label><input type="radio" name="bucket" value="OIL"><span>OIL</span></label></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Days (+/−)</label><input name="days" type="number" step="0.5" required placeholder="e.g. 3 or -1" autofocus></div>
          <div class="field"><label>Date</label><input name="date" type="date" value="${todayISO()}" required></div>
        </div>
        <div class="field"><label>Reason</label><input name="note" maxlength="140" required placeholder="e.g. Carry forward from ${new Date().getFullYear() - 1}"></div>`,
      onSubmit: fd => {
        const days = Number(fd.get('days'));
        if (!days) return 'Enter a non-zero number of days';
        state.txns.push({ id: uid(), rid: id, bucket: fd.get('bucket'), kind: 'adjust', days, date: fd.get('date'), note: fd.get('note').trim(), createdAt: Date.now() });
        save(); toast('Adjustment recorded');
      },
    }));
  }

  function forfeitExpired(id) {
    const b = balances(id);
    const amt = round(b.oilLots.filter(l => l.expired).reduce((s, l) => s + l.remaining, 0));
    if (!amt) return;
    requireAdmin(() => openModal({
      title: 'Forfeit expired OIL?',
      okText: 'Forfeit', danger: true,
      body: `<p>Remove <b>${dayWord(amt)}</b> of expired OIL from ${esc(getRes(id).name)}'s balance?</p>`,
      onSubmit: () => {
        state.txns.push({ id: uid(), rid: id, bucket: 'OIL', kind: 'adjust', days: -amt, date: todayISO(), note: 'Expired OIL forfeited', createdAt: Date.now() });
        save(); toast('Expired OIL forfeited');
      },
    }));
  }

  function deleteTxn(tid) {
    const t = state.txns.find(x => x.id === tid);
    if (!t) return;
    requireAdmin(() => openModal({
      title: 'Remove this entry?',
      okText: 'Remove', danger: true,
      body: `<p>${esc(describeTxn(t).title)} · ${esc(describeTxn(t).when)}</p><p class="muted small">${t.kind === 'leave' ? 'The days will be returned to the balance.' : 'The balance will be recalculated.'}</p>`,
      onSubmit: () => { state.txns = state.txns.filter(x => x.id !== tid); save(); toast('Entry removed'); },
    }));
  }

  function describeTxn(t) {
    const d = Number(t.days);
    if (t.kind === 'leave') return { title: `${t.bucket === 'AL' ? 'Annual leave' : 'Off in lieu'} taken`, when: fmtRange(t.start, t.end), amt: -d };
    if (t.kind === 'credit') return { title: 'OIL earned', when: fmtDate(t.date) + (t.expiry ? ` · expires ${fmtDate(t.expiry)}` : ''), amt: d };
    return { title: `${t.bucket === 'AL' ? 'Annual leave' : 'OIL'} adjustment`, when: fmtDate(t.date), amt: d };
  }

  // ---------- Views ----------
  function pillsHtml(b) {
    const alPct = b.alTotal > 0 ? Math.max(0, Math.min(100, (b.al / b.alTotal) * 100)) : 0;
    const oilPct = b.oilEarned > 0 ? Math.max(0, Math.min(100, (b.oil / b.oilEarned) * 100)) : 0;
    return `<div class="pills">
      <div class="pill ${b.al < 0 ? 'neg' : 'al'}"><small>Annual leave left</small><b>${fmt(b.al)}</b> <span class="small">/ ${fmt(b.alTotal)}</span><div class="bar"><i style="width:${alPct}%"></i></div></div>
      <div class="pill ${b.oil < 0 ? 'neg' : 'oil'}"><small>OIL left</small><b>${fmt(b.oil)}</b> <span class="small">/ ${fmt(b.oilEarned)}</span><div class="bar"><i style="width:${oilPct}%"></i></div></div>
    </div>`;
  }

  function oilFlags(b) {
    const exp = round(b.oilLots.filter(l => l.expired).reduce((s, l) => s + l.remaining, 0));
    const soon = round(b.oilLots.filter(l => l.expiringSoon).reduce((s, l) => s + l.remaining, 0));
    return (exp ? `<span class="badge danger">${dayWord(exp)} OIL expired</span> ` : '') +
      (soon ? `<span class="badge warn">${dayWord(soon)} OIL expiring soon</span>` : '');
  }

  let searchTerm = '';
  function renderTeam() {
    setTitle('Team', false);
    if (!state.resources.length) {
      view.innerHTML = `<div class="card empty"><div class="big">&#128101;</div><p><b>No resources yet</b></p><p>Add the people who report to you, with their leave and OIL balances.</p><button class="btn primary" id="emptyAdd">Add resource</button></div>`;
      $('#emptyAdd').onclick = addResource;
      return;
    }
    let totAl = 0, totOil = 0, onLeave = 0;
    const today = todayISO();
    for (const r of state.resources) {
      const b = balances(r.id); totAl += b.al; totOil += b.oil;
      if (txnsOf(r.id).some(t => t.kind === 'leave' && t.start <= today && t.end >= today)) onLeave++;
    }
    view.innerHTML = `
      <div class="summary">
        <div class="stat"><b>${state.resources.length}</b><span>People</span></div>
        <div class="stat"><b>${fmt(totAl)}</b><span>AL days left</span></div>
        <div class="stat"><b>${fmt(totOil)}</b><span>OIL days left</span></div>
      </div>
      ${onLeave ? `<div class="notice info">${onLeave} ${onLeave === 1 ? 'person is' : 'people are'} on leave today.</div>` : ''}
      <input class="search" id="search" type="search" placeholder="Search name or role" value="${esc(searchTerm)}">
      <div id="people"></div>`;
    const draw = () => {
      const q = searchTerm.toLowerCase();
      const list = state.resources.filter(r => !q || r.name.toLowerCase().includes(q) || (r.role || '').toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      $('#people').innerHTML = list.length ? list.map(r => {
        const b = balances(r.id);
        const away = txnsOf(r.id).some(t => t.kind === 'leave' && t.start <= today && t.end >= today);
        return `<a class="card person" href="#/r/${r.id}">
          <div class="row"><div class="avatar">${esc(initials(r.name))}</div>
            <div class="grow"><div class="name">${esc(r.name)}</div><div class="muted small">${esc(r.role || '—')}</div></div>
            ${away ? '<span class="badge grey">On leave</span>' : ''}</div>
          ${pillsHtml(b)}
          ${oilFlags(b) ? `<div style="margin-top:10px">${oilFlags(b)}</div>` : ''}
        </a>`;
      }).join('') : '<p class="empty">No matches</p>';
    };
    $('#search').addEventListener('input', e => { searchTerm = e.target.value; draw(); });
    draw();
  }

  function renderResource(id) {
    const r = getRes(id);
    if (!r) { location.hash = '#/'; return; }
    setTitle(r.name, true);
    const b = balances(id);
    const hist = txnsOf(id).slice().sort((a, c) => ((c.start || c.date) || '').localeCompare((a.start || a.date) || '') || c.createdAt - a.createdAt);
    const lots = b.oilLots.filter(l => l.remaining > 0);
    view.innerHTML = `
      <div class="card">
        <div class="row"><div class="avatar">${esc(initials(r.name))}</div>
          <div class="grow"><div class="name"><b>${esc(r.name)}</b></div><div class="muted small">${esc(r.role || '—')}</div></div>
          <button class="btn sm" data-act="edit">Edit</button></div>
        ${pillsHtml(b)}
        <table class="tbl small" style="margin-top:12px">
          <tr><td class="muted">AL quota (incl. adjustments)</td><td class="amt" style="text-align:right">${fmt(b.alTotal)}</td></tr>
          <tr><td class="muted">AL taken</td><td class="amt" style="text-align:right">${fmt(b.alUsed)}</td></tr>
          <tr><td class="muted">OIL earned</td><td class="amt" style="text-align:right">${fmt(b.oilEarned)}</td></tr>
          <tr><td class="muted">OIL used / forfeited</td><td class="amt" style="text-align:right">${fmt(b.oilUsed)}</td></tr>
        </table>
      </div>
      <div class="actions" style="margin-bottom:12px">
        <a class="btn primary" href="#/apply/${id}">Apply leave</a>
        <button class="btn" data-act="oil">+ Add OIL</button>
        <button class="btn" data-act="adjust">Adjust</button>
        <button class="btn danger" data-act="delete">Delete</button>
      </div>
      ${lots.length ? `<div class="card"><h3>OIL available</h3><ul class="list">${lots.map(l => `
        <li class="row between"><div><div>${dayWord(l.remaining)} <span class="muted small">of ${fmt(l.days)}</span></div>
          <div class="muted small">Earned ${fmtDate(l.date)}${l.note ? ' · ' + esc(l.note) : ''}</div></div>
          ${l.expired ? `<span class="badge danger">Expired ${fmtDate(l.expiry)}</span>` : l.expiry ? `<span class="badge ${l.expiringSoon ? 'warn' : 'grey'}">Exp. ${fmtDate(l.expiry)}</span>` : '<span class="badge grey">No expiry</span>'}
        </li>`).join('')}</ul>
        ${lots.some(l => l.expired) ? '<button class="btn sm danger" data-act="forfeit" style="margin-top:10px">Forfeit expired OIL</button>' : ''}</div>` : ''}
      <div class="card"><h3>History</h3>
        ${hist.length ? `<ul class="list">${hist.map(t => {
          const d = describeTxn(t);
          return `<li class="row"><span class="badge ${t.bucket === 'AL' ? 'al' : 'oil'}">${t.bucket}</span>
            <div class="grow"><div>${esc(d.title)}</div><div class="muted small">${esc(d.when)}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
            <span class="amt ${d.amt < 0 ? 'minus' : 'plus'}">${d.amt > 0 ? '+' : ''}${fmt(d.amt)}</span>
            <button class="icon-btn" data-del="${t.id}" aria-label="Remove entry" title="Remove">&#10005;</button></li>`;
        }).join('')}</ul>` : '<p class="muted">No leave or OIL recorded yet.</p>'}
      </div>`;
    view.onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      const del = e.target.closest('[data-del]')?.dataset.del;
      if (del) return deleteTxn(del);
      ({ edit: () => editResource(id), oil: () => addOil(id), adjust: () => adjust(id), delete: () => deleteResource(id), forfeit: () => forfeitExpired(id) })[a]?.();
    };
  }

  function renderApply(preId) {
    setTitle('Apply leave', !!preId);
    if (!state.resources.length) {
      view.innerHTML = `<div class="card empty"><p>Add a resource first.</p><a class="btn primary" href="#/admin">Go to Admin</a></div>`;
      return;
    }
    const sorted = state.resources.slice().sort((a, b) => a.name.localeCompare(b.name));
    const t = todayISO();
    view.innerHTML = `
      <form class="card" id="applyForm" autocomplete="off">
        <div class="field"><label>Resource</label>
          <select name="rid" required>${preId ? '' : '<option value="">Select a person…</option>'}${sorted.map(r => `<option value="${r.id}" ${r.id === preId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Deduct from</label>
          <div class="seg"><label><input type="radio" name="bucket" value="AL" checked><span>Annual leave</span></label><label><input type="radio" name="bucket" value="OIL"><span>Off in lieu (OIL)</span></label></div></div>
        <div class="grid2">
          <div class="field"><label>From</label><input name="start" type="date" value="${t}" required></div>
          <div class="field"><label>To</label><input name="end" type="date" value="${t}" required></div>
        </div>
        <div class="field"><label class="check"><input type="checkbox" name="half"> Half day</label></div>
        <div class="field"><label>Days to deduct</label><input name="days" type="number" step="0.5" min="0.5" required>
          <div class="muted small" style="margin-top:4px">Auto-calculated as working days (Mon–Fri). Change it if there is a public holiday.</div></div>
        <div class="field"><label>Note (optional)</label><input name="note" maxlength="140" placeholder="e.g. Family trip"></div>
        <div id="preview"></div>
        <button class="btn primary block" type="submit">Deduct &amp; record leave</button>
      </form>`;
    const f = $('#applyForm');
    let daysTouched = false;
    const recalc = () => {
      const start = f.start.value; let end = f.end.value;
      if (start && (!end || end < start)) { f.end.value = end = start; }
      if (f.half.checked) { f.end.value = start; end = start; }
      f.end.disabled = f.half.checked;
      if (!daysTouched) { const w = workingDays(start, end); f.days.value = f.half.checked ? (w ? 0.5 : 0) : w; }
      preview();
    };
    const preview = () => {
      const r = getRes(f.rid.value); const box = $('#preview');
      if (!r) { box.innerHTML = ''; return; }
      const b = balances(r.id); const bucket = f.bucket.value; const days = Number(f.days.value) || 0;
      const cur = bucket === 'AL' ? b.al : b.oil; const after = round(cur - days);
      const overlap = txnsOf(r.id).find(x => x.kind === 'leave' && f.start.value && x.start <= (f.end.value || f.start.value) && x.end >= f.start.value);
      box.innerHTML = `<div class="notice ${after < 0 ? 'danger' : 'info'}">
          ${bucket === 'AL' ? 'Annual leave' : 'OIL'} balance: <b>${fmt(cur)}</b> → <b>${fmt(after)}</b> after this leave
          ${after < 0 ? '<br>Not enough balance. You can still record it — the balance will go negative.' : ''}</div>
        ${overlap ? `<div class="notice warn">Overlaps existing leave: ${esc(fmtRange(overlap.start, overlap.end))}</div>` : ''}
        ${days === 0 ? '<div class="notice warn">The selected dates have no working days.</div>' : ''}`;
    };
    f.addEventListener('input', e => {
      if (e.target.name === 'days') { daysTouched = true; return preview(); }
      if (['start', 'end', 'half'].includes(e.target.name)) daysTouched = false;
      recalc();
    });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const rid = f.rid.value, r = getRes(rid);
      const days = Number(f.days.value);
      if (!r) return toast('Select a resource');
      if (!(days > 0)) return toast('Days must be more than 0');
      requireAdmin(() => {
        const start = f.start.value, end = f.half.checked ? start : f.end.value;
        state.txns.push({ id: uid(), rid, bucket: f.bucket.value, kind: 'leave', days, start, end, half: f.half.checked, note: f.note.value.trim(), createdAt: Date.now() });
        save();
        toast(`−${dayWord(days)} ${f.bucket.value} for ${r.name}`);
        location.hash = `#/r/${rid}`;
      });
    });
    recalc();
  }

  function renderAdmin() {
    setTitle('Admin', false);
    const sorted = state.resources.slice().sort((a, b) => a.name.localeCompare(b.name));
    view.innerHTML = `
      <div class="card">
        <div class="row between"><h2 style="margin:0">Resources</h2><button class="btn primary sm" data-act="add">+ Add resource</button></div>
        ${sorted.length ? `<ul class="list" style="margin-top:12px">${sorted.map(r => {
          const b = balances(r.id);
          return `<li class="row"><div class="avatar">${esc(initials(r.name))}</div>
            <a class="grow person" href="#/r/${r.id}"><div class="name">${esc(r.name)}</div>
              <div class="small"><span class="badge al">AL ${fmt(b.al)}/${fmt(b.alTotal)}</span> <span class="badge oil">OIL ${fmt(b.oil)}</span></div></a>
            <button class="btn sm" data-oil="${r.id}" title="Add OIL">+OIL</button>
            <button class="btn sm" data-edit="${r.id}">Edit</button></li>`;
        }).join('')}</ul>` : '<p class="muted">No resources yet. Add your first one.</p>'}
      </div>
      <div class="card"><h2>Bulk add</h2>
        <p class="muted small">One person per line: <code>Name, AL quota, OIL balance</code> (OIL optional).</p>
        <textarea id="bulk" rows="4" placeholder="Aisyah Rahman, 16, 2&#10;Daniel Lim, 14"></textarea>
        <button class="btn sm" data-act="bulk" style="margin-top:8px">Add all</button></div>
      <div class="card"><h2>New leave year</h2>
        <p class="muted small">Archive current history into a backup file, then reset everyone's AL taken. Unused AL can be carried forward.</p>
        <button class="btn sm" data-act="newyear">Start new leave year…</button></div>
      <div class="card"><h2>Backup &amp; export</h2>
        <p class="muted small">Data is saved on this device only. Export a backup regularly, and import it on another device to move your data.</p>
        <div class="row wrap">
          <button class="btn sm" data-act="export">Export backup (JSON)</button>
          <label class="btn sm" style="margin:0;color:var(--text)">Import backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
          <button class="btn sm" data-act="csv">Export balances (CSV)</button>
        </div></div>
      <div class="card"><h2>Security</h2>
        <p class="muted small">${state.settings.pinHash ? 'An admin PIN is set. Changes need the PIN once per browser session.' : 'Set a PIN so only you can make changes on this device.'}</p>
        <div class="row wrap">
          <button class="btn sm" data-act="pin">${state.settings.pinHash ? 'Change PIN' : 'Set admin PIN'}</button>
          ${state.settings.pinHash ? '<button class="btn sm" data-act="removepin">Remove PIN</button>' : ''}
        </div></div>
      <div class="card"><h2>Danger zone</h2><button class="btn sm danger" data-act="wipe">Erase all data</button></div>`;

    view.onclick = e => {
      const el = e.target.closest('[data-act],[data-edit],[data-oil]');
      if (!el) return;
      if (el.dataset.edit) return editResource(el.dataset.edit);
      if (el.dataset.oil) return addOil(el.dataset.oil);
      ({ add: addResource, bulk: bulkAdd, export: exportJson, csv: exportCsv, pin: setPin, removepin: removePin, wipe: wipeAll, newyear: newYear })[el.dataset.act]?.();
    };
    $('#importFile').addEventListener('change', importJson);
  }

  // ---------- Admin actions ----------
  function bulkAdd() {
    const lines = $('#bulk').value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return toast('Nothing to add');
    requireAdmin(() => {
      let n = 0;
      for (const line of lines) {
        const [name, al, oil] = line.split(/[,\t;]/).map(s => s.trim());
        if (!name) continue;
        const r = { id: uid(), name, role: '', alQuota: Number(al) || 0, createdAt: Date.now() };
        state.resources.push(r); n++;
        if (Number(oil) > 0) state.txns.push({ id: uid(), rid: r.id, bucket: 'OIL', kind: 'credit', days: Number(oil), date: todayISO(), expiry: null, note: 'Opening balance', createdAt: Date.now() });
      }
      save(); toast(`${n} resource${n === 1 ? '' : 's'} added`); render();
    });
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportJson() { download(`leave-tracker-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded'); }
  function exportCsv() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Role', 'AL quota', 'AL taken', 'AL balance', 'OIL earned', 'OIL used', 'OIL balance'].map(q).join(',')];
    for (const r of state.resources.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const b = balances(r.id);
      rows.push([r.name, r.role, b.alTotal, b.alUsed, b.al, b.oilEarned, b.oilUsed, b.oil].map(q).join(','));
    }
    download(`leave-balances-${todayISO()}.csv`, rows.join('\r\n'), 'text/csv');
    toast('CSV downloaded');
  }
  function importJson(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    requireAdmin(() => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!Array.isArray(data.resources) || !Array.isArray(data.txns)) throw new Error('bad');
          openModal({
            title: 'Replace current data?',
            okText: 'Import', danger: true,
            body: `<p>The backup has <b>${data.resources.length}</b> resources and <b>${data.txns.length}</b> entries. It will replace everything currently on this device.</p>`,
            onSubmit: () => { const pin = state.settings.pinHash; state = normalize(data); if (!state.settings.pinHash) state.settings.pinHash = pin; save(); setUnlocked(true); toast('Backup imported'); },
          });
        } catch { toast('That file is not a valid backup'); }
      };
      reader.readAsText(file);
    });
  }
  function setPin() {
    requireAdmin(() => openModal({
      title: state.settings.pinHash ? 'Change admin PIN' : 'Set admin PIN',
      body: `<div class="field"><label>New PIN (4+ digits)</label><input name="pin" type="password" inputmode="numeric" minlength="4" required autofocus autocomplete="new-password"></div>
        <div class="field"><label>Confirm PIN</label><input name="pin2" type="password" inputmode="numeric" required autocomplete="new-password"></div>
        <p class="muted small">This keeps casual users of this device from editing data. It is not encryption.</p>`,
      onSubmit: async fd => {
        const p = fd.get('pin');
        if (p.length < 4) return 'PIN must be at least 4 characters';
        if (p !== fd.get('pin2')) return 'PINs do not match';
        state.settings.pinHash = await hashPin(p); save(); setUnlocked(true); toast('PIN saved');
      },
    }));
  }
  function removePin() {
    requireAdmin(() => { state.settings.pinHash = null; save(); setUnlocked(false); toast('PIN removed'); render(); });
  }
  function wipeAll() {
    requireAdmin(() => openModal({
      title: 'Erase all data?', okText: 'Erase everything', danger: true,
      body: '<p>All resources, leave and OIL records on this device will be deleted. Export a backup first if you might need it.</p><div class="field"><label>Type ERASE to confirm</label><input name="c" required autofocus></div>',
      onSubmit: fd => { if (fd.get('c') !== 'ERASE') return 'Type ERASE to confirm'; state = emptyState(); save(); setUnlocked(false); toast('All data erased'); },
    }));
  }
  function newYear() {
    requireAdmin(() => openModal({
      title: 'Start new leave year',
      okText: 'Start new year',
      body: `
        <p class="small">A backup of the current data downloads first. Then for each person:</p>
        <ul class="small"><li>Annual leave history and adjustments are cleared.</li><li>OIL with remaining balance is kept; used OIL history is cleared.</li></ul>
        <div class="field"><label>Max AL days to carry forward (0 = none)</label><input name="cf" type="number" min="0" step="0.5" value="0"></div>`,
      onSubmit: fd => {
        exportJson();
        const cf = Math.max(0, Number(fd.get('cf')) || 0);
        const today = todayISO(); const next = [];
        for (const r of state.resources) {
          const b = balances(r.id);
          const carry = Math.min(cf, Math.max(0, b.al));
          if (carry > 0) next.push({ id: uid(), rid: r.id, bucket: 'AL', kind: 'adjust', days: carry, date: today, note: 'Carry forward', createdAt: Date.now() });
          for (const l of b.oilLots) if (l.remaining > 0) next.push({ id: uid(), rid: r.id, bucket: 'OIL', kind: 'credit', days: l.remaining, date: l.date, expiry: l.expiry, note: l.note || 'Brought forward', createdAt: Date.now() });
          if (b.oil < 0) next.push({ id: uid(), rid: r.id, bucket: 'OIL', kind: 'adjust', days: b.oil, date: today, note: 'Negative OIL brought forward', createdAt: Date.now() });
        }
        state.txns = next; state.settings.year = new Date().getFullYear(); save(); toast('New leave year started');
      },
    }));
  }

  // ---------- Router ----------
  function setTitle(t, back) { $('#pageTitle').textContent = t; $('#backBtn').hidden = !back; document.title = `${t} · Leave Tracker`; }
  function updateChrome() {
    const lb = $('#lockBtn');
    lb.hidden = !state.settings.pinHash;
    lb.innerHTML = isUnlocked() ? '&#128275;' : '&#128274;';
    lb.title = isUnlocked() ? 'Unlocked — tap to lock' : 'Locked';
  }
  function render() {
    view.onclick = null;
    const h = location.hash.slice(1) || '/';
    const parts = h.split('/').filter(Boolean);
    const tab = parts[0] === 'apply' ? 'apply' : parts[0] === 'admin' ? 'admin' : 'team';
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    if (parts[0] === 'r' && parts[1]) renderResource(parts[1]);
    else if (parts[0] === 'apply') renderApply(parts[1]);
    else if (parts[0] === 'admin') renderAdmin();
    else renderTeam();
    updateChrome();
  }
  $('#backBtn').addEventListener('click', () => history.length > 1 ? history.back() : (location.hash = '#/'));
  $('#lockBtn').addEventListener('click', () => {
    if (isUnlocked()) { setUnlocked(false); toast('Admin locked'); updateChrome(); }
    else requireAdmin(() => toast('Unlocked'));
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(); render(); } });
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
