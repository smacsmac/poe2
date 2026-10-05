/* Crafting Playbook app: Design -> Plan -> Reference. Vanilla JS over the planner engine. */
(function () {
  'use strict';
  var DATA = window.DATA, PRICES = window.PRICES;
  var E = window.createEngine(DATA, PRICES);
  var MODS = E.MODS, FAMS = E.FAMS, SIDE = E.SIDE;
  var IDX = {};
  DATA.ids.forEach(function (k, i) { IDX[k] = i; });
  var FAMKEY = {};
  FAMS.forEach(function (f, i) { FAMKEY[f.s + ':' + f.g] = i; });
  var CLS = {};
  DATA.classes.forEach(function (c) { CLS[c.id] = c; });
  var BASES = {};
  DATA.bases.forEach(function (b) { (BASES[b.c] = BASES[b.c] || []).push(b); });
  var GROUPS = [
    ['Armour', ['helmet', 'body', 'gloves', 'boots']],
    ['Off-hand', ['shield', 'buckler', 'focus', 'quiver']],
    ['Jewellery', ['ring', 'amulet', 'belt']],
    ['Caster weapons', ['wand', 'staff', 'sceptre']],
    ['Martial weapons', ['bow', 'crossbow', 'spear', 'mace1', 'mace2', 'qstaff', 'talisman']]
  ];
  var DEFAULT_BASE = { gloves: 'Blacksteel Gauntlets', helmet: 'Gladiatorial Helm', body: 'Thane Mail', boots: 'Blacksteel Sabatons', shield: 'Golden Targe', amulet: 'Stellar Amulet', ring: 'Prismatic Ring', belt: 'Heavy Belt' };
  var KIND = { base: 'Base', aug: 'Augment', regal: 'Regal', essence: 'Essence', slam: 'Exalt', sacrifice: 'Exalt', craft: 'Crafted mod', desec: 'Desecration', remove: 'Fix', fixMagic: 'Fix', finish: 'Finish', stop: 'Stuck', done: 'Done' };
  var DEV = Math.random().toString(36).slice(2, 9);
  var LS = 'poe2-crafting-playbook-app-v2';

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function ico(id, cls) { return '<svg class="ico ' + (cls || '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function dash(t) { return String(t).replace(/(\d)-(\d)/g, '$1–$2'); }
  function trimNum(s) { return s.indexOf('.') > -1 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmt(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (v >= 0.1) {
      if (v < 1) return trimNum(v.toFixed(2)) + ' div';
      if (v < 10) return trimNum(v.toFixed(1)) + ' div';
      return Math.round(v) + ' div';
    }
    var ex = v * PRICES.exPerDiv[app.league];
    if (ex < 0.95) return '<1 ex';
    return Math.max(1, Math.round(ex)) + ' ex';
  }
  function plural(n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function modText(mi) { return dash(MODS[mi].x); }
  function tierLab(cat, mi) {
    var l = E.labelTier(cat, { f: famOf(mi), mi: mi });
    return l.charAt(0) === 'T' ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }
  function famOf(mi) { return MODS[mi].f; }

  /* ---------- state ---------- */
  var app = { view: 'design', league: 'fr', curId: null, crafts: {}, pk: null, ui: { opt: null, optFor: null, doneAll: false, open: {}, confirmDel: null, confirmReset: false } };

  function defaultBase(cls) {
    var name = DEFAULT_BASE[cls];
    var list = BASES[cls] || [];
    if (name && list.some(function (b) { return b.n === name; })) return name;
    return list.slice().sort(function (a, b) { return b.lv - a.lv; })[0].n;
  }
  function blankCraft(cls, base) {
    cls = cls || 'gloves';
    var c = { id: newId(), cls: cls, base: base || defaultBase(cls), ilvl: 82, runeforge: cls === 'gloves', targets: [[], []], st: null, planSt: null, hist: [], stale: false, at: Date.now(), dev: DEV, editing: false };
    fitTargets(c);
    return c;
  }
  function cur() { return app.crafts[app.curId]; }
  function catOf(c) { return E.catalog(c.base, c.ilvl); }
  function fitTargets(c) {
    var cat = catOf(c);
    [0, 1].forEach(function (s) {
      var t = (c.targets[s] || []).filter(Boolean);
      var out = [];
      for (var i = 0; i < cat.caps[s]; i++) out.push(t[i] || null);
      c.targets[s] = out;
    });
  }
  function designOf(c) {
    return {
      cls: c.cls, base: c.base, ilvl: c.ilvl, runeforge: !!c.runeforge, league: app.league,
      targets: c.targets.map(function (side) {
        return side.map(function (t) { return t ? { f: famOf(t.mi), mi: t.mi, lv: MODS[t.mi].l } : null; });
      })
    };
  }
  function touch(c) { c.at = Date.now(); c.dev = DEV; queueSave(c.id); refreshBadges(); }
  function refreshBadges() {
    var c = cur();
    if (!c) return;
    renderCraftsBadge();
    if (!c.planSt) { updateTabStep(null); return; }
    var steps = E.plan(designOf(c), c.planSt);
    updateTabStep(steps[0].kind === 'done' ? '✓' : String(c.hist.filter(function (x) { return !x.e; }).length + 1));
  }
  function slotNoun(cls) {
    var n = CLS[cls].n.toLowerCase();
    return 'Your ' + n + (/s$/.test(n) ? ' are' : ' is');
  }
  function targetCount(c) { return c.targets[0].filter(Boolean).length + c.targets[1].filter(Boolean).length; }

  /* ---------- packing for storage (stable mod ids, not array positions) ---------- */
  function packMod(m) {
    var o = { id: m.id, s: m.s, mk: m.mark || 'auto' };
    if (m.mi !== null && m.mi !== undefined) o.k = DATA.ids[m.mi];
    if (m.pseudo) o.ps = m.pseudo === 'junk' ? 'junk' : 1;
    if (m.crafted) o.c = 1;
    if (m.desec) o.d = 1;
    if (m.fract) o.f = 1;
    if (m.est) o.e = 1;
    return o;
  }
  function unpackMod(o) {
    var mi = o.k !== undefined ? IDX[o.k] : null;
    var m = { id: o.id, s: o.s, mi: mi === undefined ? null : mi, mark: o.mk || 'auto' };
    if (o.ps || m.mi === null) { m.pseudo = o.ps === 'junk' ? 'junk' : 'any'; m.mi = null; }
    if (o.c) m.crafted = true;
    if (o.d) m.desec = true;
    if (o.f) m.fract = true;
    if (o.e) m.est = true;
    return m;
  }
  function packSt(st) {
    if (!st) return null;
    return { r: st.rarity, m: st.mods.map(packMod), d: st.done || {}, sk: Object.keys(st.skip || {}).filter(function (f) { return st.skip[f]; }).map(function (f) { return FAMS[f].s + ':' + FAMS[f].g; }) };
  }
  function unpackSt(o) {
    if (!o) return null;
    var skip = {};
    (o.sk || []).forEach(function (k) { if (FAMKEY[k] !== undefined) skip[FAMKEY[k]] = true; });
    return { rarity: o.r || 'none', mods: (o.m || []).map(unpackMod), done: o.d || {}, skip: skip };
  }
  function packCraft(c) {
    return JSON.parse(JSON.stringify({
      v: 2, id: c.id, cls: c.cls, base: c.base, ilvl: c.ilvl, rf: !!c.runeforge,
      t: c.targets.map(function (side) { return side.map(function (t) { return t ? { k: DATA.ids[t.mi] } : null; }); }),
      st: packSt(c.st), ps: packSt(c.planSt), sl: !!c.stale,
      h: c.hist.slice(-30).map(function (h) { return { t: h.t, o: h.o, e: h.e ? 1 : 0, st: packSt(h.st), ps: packSt(h.ps), sl: !!h.sl }; }),
      at: c.at, dev: c.dev
    }));
  }
  function unpackCraft(o) {
    if (!o || !o.cls || !CLS[o.cls] || !BASES[o.cls]) return null;
    var base = (BASES[o.cls].some(function (b) { return b.n === o.base; })) ? o.base : defaultBase(o.cls);
    var c = {
      id: o.id, cls: o.cls, base: base, ilvl: Math.max(1, Math.min(100, o.ilvl || 82)), runeforge: !!o.rf,
      targets: [0, 1].map(function (s) { return ((o.t || [])[s] || []).map(function (t) { return t && IDX[t.k] !== undefined ? { mi: IDX[t.k] } : null; }); }),
      st: unpackSt(o.st), planSt: unpackSt(o.ps), stale: !!o.sl,
      hist: (o.h || []).map(function (h) { return { t: h.t, o: h.o, e: !!h.e, st: unpackSt(h.st), ps: unpackSt(h.ps), sl: !!h.sl }; }),
      at: o.at || 0, dev: o.dev || '', editing: false
    };
    fitTargets(c);
    return c;
  }

  /* ---------- storage: your account (db) when available, this browser otherwise ---------- */
  var store = { mode: 'local', col: null, inflight: {}, dirty: {}, timers: {}, last: {}, remoteIds: null, readOnly: false };
  function worth(c) { return c && (targetCount(c) > 0 || c.st); }
  function saveLocal() {
    try {
      var all = {};
      Object.keys(app.crafts).forEach(function (id) { if (worth(app.crafts[id]) || id === app.curId) all[id] = packCraft(app.crafts[id]); });
      localStorage.setItem(LS, JSON.stringify({ cur: app.curId, league: app.league, view: app.view, crafts: all }));
    } catch (e) { /* storage blocked: the page still works for this visit */ }
  }
  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || 'null');
      if (!raw || typeof raw !== 'object') return;
      if (raw.league === 'fr' || raw.league === 'roa') app.league = raw.league;
      if (raw.view === 'design' || raw.view === 'plan' || raw.view === 'ref') app.view = raw.view;
      Object.keys(raw.crafts || {}).forEach(function (id) { var c = unpackCraft(raw.crafts[id]); if (c) app.crafts[id] = c; });
      if (raw.cur && app.crafts[raw.cur]) app.curId = raw.cur;
    } catch (e) { /* ignore a bad cache */ }
  }
  function queueSave(id) {
    saveLocalSoon();
    if (store.mode !== 'db' || store.readOnly) return;
    clearTimeout(store.timers[id]);
    store.timers[id] = setTimeout(function () { pushRemote(id); }, 900);
  }
  var localTimer = null;
  function saveLocalSoon() { clearTimeout(localTimer); localTimer = setTimeout(saveLocal, 250); }
  function pushRemote(id) {
    var c = app.crafts[id];
    if (!c || !store.col || !worth(c)) return;
    var body = packCraft(c), json = JSON.stringify(body);
    if (store.last[id] === json) return;
    if (store.inflight[id]) { store.dirty[id] = true; return; }
    store.inflight[id] = true;
    store.col.doc(id).set(body).then(function () { store.last[id] = json; }).catch(function (e) {
      if (e && e.code === 'unavailable') { setTimeout(function () { pushRemote(id); }, 1500 + Math.random() * 1500); return; }
      store.readOnly = true; renderStore();
    }).then(function () {
      store.inflight[id] = false;
      if (store.dirty[id]) { store.dirty[id] = false; pushRemote(id); }
    });
  }
  function deleteRemote(id) {
    if (store.mode !== 'db' || store.readOnly || !store.col) return;
    store.col.doc(id).delete().catch(function () { /* already gone or not allowed */ });
  }
  function onRemote(snap) {
    var first = store.remoteIds === null;
    var ids = new Set();
    var curChanged = false;
    snap.docs.forEach(function (d) {
      var body = d.data();
      if (!body || body.v !== 2) return;
      ids.add(d.id);
      var json = JSON.stringify(body);
      if (store.last[d.id] === json) return;
      var mine = app.crafts[d.id];
      if (!mine || ((body.at || 0) > mine.at && body.dev !== DEV)) {
        var c = unpackCraft(body);
        if (c) { app.crafts[d.id] = c; store.last[d.id] = json; if (d.id === app.curId) curChanged = true; }
      } else if (body.at === mine.at) store.last[d.id] = json;
    });
    if (first) {
      Object.keys(app.crafts).forEach(function (id) { if (!ids.has(id) && worth(app.crafts[id])) pushRemote(id); else if (ids.has(id)) pushRemote(id); });
      var curC = cur();
      if (curC && !worth(curC)) {
        var newest = Array.from(ids).map(function (id) { return app.crafts[id]; }).filter(Boolean).sort(function (a, b) { return b.at - a.at; })[0];
        if (newest) { delete app.crafts[app.curId]; app.curId = newest.id; curChanged = true; }
      }
    } else {
      store.remoteIds.forEach(function (id) {
        if (!ids.has(id) && app.crafts[id] && !store.inflight[id]) {
          delete app.crafts[id];
          if (id === app.curId) { var c = blankCraft(); app.crafts[c.id] = c; app.curId = c.id; curChanged = true; }
        }
      });
    }
    store.remoteIds = ids;
    store.mode = 'db';
    saveLocal();
    renderStore();
    if (curChanged) renderAll(); else renderCraftsBadge();
  }
  function initDb() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    Promise.all([window.claude.use('user'), window.claude.use('db')]).then(function (r) {
      var user = r[0], db = r[1];
      if (!user || !db) return null;
      return user.id().then(function (uid) {
        if (!uid) return;
        try { store.col = db.collection('data/users/' + uid); } catch (e) { return; }
        store.col.onSnapshot(onRemote, function () { store.mode = 'local'; store.col = null; renderStore(); });
      });
    }).catch(function () { /* stay on this browser's storage */ });
  }

  /* ---------- navigation ---------- */
  function go(view, opts) {
    app.view = view;
    if (view !== 'design') closeFind(false);
    ['design', 'plan', 'ref'].forEach(function (v) { $('v-' + v).hidden = v !== view; });
    document.querySelectorAll('[data-go]').forEach(function (b) {
      if (b.classList.contains('brand')) return;
      if (b.getAttribute('data-go') === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'plan') renderPlan();
    if (view === 'design') renderDesign();
    if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
    saveLocalSoon();
  }

  /* ---------- hero art ---------- */
  var HERO_GLOVES = '<svg viewBox="0 0 120 140" role="img" aria-label="Gauntlet">' +
    '<g stroke="var(--art-brass-lo)" stroke-width="1.2" stroke-linejoin="round">' +
    '<g transform="rotate(-38 32 92)"><rect x="25" y="73" width="13" height="16" rx="4" fill="url(#g-steel)"/><path d="M25.5 73V63q6.5-9 12 0v10z" fill="url(#g-steel)"/><path d="M26 81h11" stroke="var(--art-brass)"/></g>' +
    '<rect x="34" y="41" width="11" height="14" rx="3" fill="url(#g-steel)"/><rect x="34" y="29" width="11" height="12.5" rx="3" fill="url(#g-steel)"/><path d="M34 29.5V22q5.5-9 11 0v7.5z" fill="url(#g-steel)"/>' +
    '<rect x="47.5" y="39" width="12" height="16" rx="3" fill="url(#g-steel)"/><rect x="47.5" y="25" width="12" height="14.5" rx="3" fill="url(#g-steel)"/><path d="M47.5 25.5V15q6-10 12 0v10.5z" fill="url(#g-steel)"/>' +
    '<rect x="61.5" y="41" width="11" height="14" rx="3" fill="url(#g-steel)"/><rect x="61.5" y="28" width="11" height="13.5" rx="3" fill="url(#g-steel)"/><path d="M61.5 28.5V20q5.5-9 11 0v8.5z" fill="url(#g-steel)"/>' +
    '<rect x="74.5" y="45" width="9.5" height="11" rx="3" fill="url(#g-steel)"/><rect x="74.5" y="35" width="9.5" height="10.5" rx="3" fill="url(#g-steel)"/><path d="M74.5 35.5V29q4.75-8 9.5 0v6.5z" fill="url(#g-steel)"/>' +
    '<path d="M31 64q0-9 9-9.5h42q9 .5 9 9.5v34q0 8-8 8H39q-8 0-8-8z" fill="url(#g-steel)"/>' +
    '<path d="M31.5 60.5Q61 50 90.5 60.5V67Q61 57 31.5 67z" fill="url(#g-brass)"/>' +
    '<path d="M61 69l8 15-8 17-8-17z" fill="url(#g-steel-side)" stroke="var(--art-brass)"/>' +
    '<path d="M38 72v26M84 72v26" stroke="var(--art-steel-hi)" stroke-opacity=".5"/>' +
    '<path d="M30 105h62l6.5 28q-37.5 7-75 0z" fill="url(#g-steel)"/>' +
    '<path d="M28.5 113h65M26.5 122h69" stroke="var(--art-brass)" stroke-width="2.2"/>' +
    '</g>' +
    '<g fill="url(#g-brass)"><circle cx="37" cy="69.5" r="2.2"/><circle cx="85" cy="69.5" r="2.2"/><circle cx="37" cy="99" r="2.2"/><circle cx="85" cy="99" r="2.2"/><circle cx="61" cy="84" r="2.6"/><circle cx="34" cy="129" r="1.8"/><circle cx="88" cy="129" r="1.8"/><circle cx="61" cy="130.5" r="1.8"/></g>' +
    '</svg>';
  function heroArt(cls) {
    if (cls === 'gloves') return HERO_GLOVES;
    return '<svg class="line" aria-hidden="true"><use href="#i-' + cls + '"/></svg>';
  }

  /* ---------- design ---------- */
  function railHTML(c) {
    var h = '';
    GROUPS.forEach(function (g) {
      h += '<p class="rail-h">' + g[0] + '</p>';
      g[1].forEach(function (id) {
        h += '<button type="button" class="slot" data-act="cls" data-cls="' + id + '" aria-pressed="' + (c.cls === id) + '">' +
          '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg><span>' + esc(CLS[id].n) + '</span></button>';
      });
    });
    return h;
  }
  function renderRail() {
    var c = cur();
    $('rail').innerHTML = railHTML(c);
    $('slot-pick').innerHTML = '<svg aria-hidden="true"><use href="#i-' + c.cls + '"/></svg><span class="sp-n"><span class="vh">Item slot: </span>' + esc(CLS[c.cls].n) + '</span>' +
      '<span class="sp-all">All slots' + ico('u-chev') + '</span>';
    if (slotsOpen()) $('sl-list').innerHTML = railHTML(c);
  }
  /* Phones: the slot list opens as a drawer from the left instead of the side rail. */
  function slotsOpen() { return !$('slots').hidden; }
  function openSlots() {
    var el = $('slots');
    el.innerHTML = '<div class="drawer-card" role="dialog" aria-modal="true" aria-labelledby="sl-t"><div class="dr-head"><h2 id="sl-t">Choose a slot</h2>' +
      '<button type="button" class="btn small quiet x" data-act="slots-close" aria-label="Close">' + ico('u-x') + '</button></div>' +
      '<div class="sl-list" id="sl-list">' + railHTML(cur()) + '</div></div>';
    el.hidden = false;
    $('slot-pick').setAttribute('aria-expanded', 'true');
    var on = el.querySelector('.slot[aria-pressed="true"]');
    if (on) on.focus();
  }
  function closeSlots() {
    var el = $('slots');
    if (el.hidden) return;
    el.hidden = true; el.innerHTML = '';
    var b = $('slot-pick');
    b.setAttribute('aria-expanded', 'false');
    b.focus({ preventScroll: true });
  }
  function baseProps(b) {
    var parts = [];
    var a = b.ar || {};
    if (a.Armour) parts.push('Armour <b>' + a.Armour + '</b>');
    if (a.Evasion) parts.push('Evasion <b>' + a.Evasion + '</b>');
    if (a.EnergyShield) parts.push('Energy Shield <b>' + a.EnergyShield + '</b>');
    if (b.ar && b.ar.BlockChance) parts.push('Block <b>' + b.ar.BlockChance + '%</b>');
    var w = b.wp;
    if (w) {
      if (w.PhysicalMin) parts.push('Physical <b>' + w.PhysicalMin + '–' + w.PhysicalMax + '</b>');
      if (w.AttackRateBase) parts.push('Attacks/s <b>' + w.AttackRateBase + '</b>');
      if (w.CritChanceBase) parts.push('Crit <b>' + w.CritChanceBase + '%</b>');
    }
    var lines = [];
    if (parts.length) lines.push('<p class="props">' + parts.join(' · ') + '</p>');
    if (b.rf) {
      var rf = [];
      if (b.rf.Ward) rf.push('Runic Ward <b>' + b.rf.Ward + '</b>');
      if (b.rf.Armour) rf.push('Armour <b>' + b.rf.Armour + '</b>');
      if (b.rf.Evasion) rf.push('Evasion <b>' + b.rf.Evasion + '</b>');
      if (b.rf.EnergyShield) rf.push('Energy Shield <b>' + b.rf.EnergyShield + '</b>');
      lines.push('<p class="props"><span class="rf">Runeforged:</span> ' + rf.join(' · ') + '</p>');
    }
    if (b.rfw && b.rfw.ChaosMin) lines.push('<p class="props"><span class="rf">Runeforged:</span> Chaos <b>' + b.rfw.ChaosMin + '–' + b.rfw.ChaosMax + '</b></p>');
    var rq = [];
    if (b.lv) rq.push('Level <b>' + b.lv + '</b>');
    if (b.rq[0]) rq.push('<b>' + b.rq[0] + '</b> Str');
    if (b.rq[1]) rq.push('<b>' + b.rq[1] + '</b> Dex');
    if (b.rq[2]) rq.push('<b>' + b.rq[2] + '</b> Int');
    if (rq.length) lines.push('<p class="props">Requires ' + rq.join(', ') + '</p>');
    return lines.join('');
  }
  function implicitLines(b) {
    if (!b.im) return [];
    var lines = b.im.split('\n');
    var out = lines.filter(function (l) { return l.indexOf('{variant') !== 0; }).map(dash);
    if (lines.some(function (l) { return l.indexOf('{variant') === 0; })) out.push('Grants one of several skills');
    return out;
  }
  function baseOptions(c) {
    var list = (BASES[c.cls] || []).slice().sort(function (a, b) { return b.lv - a.lv || a.n.localeCompare(b.n); });
    var subs = {};
    list.forEach(function (b) { (subs[b.sub || ''] = subs[b.sub || ''] || []).push(b); });
    var keys = Object.keys(subs).sort();
    function opts(arr) { return arr.map(function (b) { return '<option value="' + esc(b.n) + '"' + (b.n === c.base ? ' selected' : '') + '>' + esc(b.n) + ' · ' + b.lv + '</option>'; }).join(''); }
    if (keys.length === 1) return opts(subs[keys[0]]);
    return keys.map(function (k) { return '<optgroup label="' + esc(k || 'Other') + '">' + opts(subs[k]) + '</optgroup>'; }).join('');
  }
  /* Which planned step puts each target on the item, from a fresh base. Keeps Design and Plan in agreement. */
  function routeMap(c) {
    var map = {};
    if (!targetCount(c)) return map;
    var steps = E.plan(designOf(c), { rarity: 'none', mods: [], done: {}, skip: {} });
    steps.forEach(function (st) {
      var p = st.project;
      if (!p) return;
      (p.mods || []).forEach(function (m) {
        if (m.mi === null || m.mi === undefined) return;
        var f = famOf(m.mi);
        if (!map[f]) map[f] = st;
      });
    });
    return map;
  }
  function routeFor(c, cat, rmap, t) {
    var design = designOf(c);
    var tt = { f: famOf(t.mi), mi: t.mi, lv: MODS[t.mi].l };
    var m = E.methods(cat, tt);
    var st = rmap[tt.f];
    var r = { line: '', odds: '', warn: false, kind: st ? st.kind : 'none' };
    var slamOdds = m.slam ? E.oddsLabel(E.slamOddsFor(design, tt).greater) : '';
    if (st) {
      switch (st.kind) {
        case 'base': r.line = 'On the magic base you buy or roll'; r.odds = 'base'; return r;
        case 'aug': r.line = 'Augment it onto the magic base'; r.odds = slamOdds; return r;
        case 'essence': r.line = 'Crafted slot · <b>' + esc(st.mats[0].n) + '</b> when the item goes rare'; r.odds = 'certain'; return r;
        case 'craft': r.line = 'Crafted slot · <b>' + esc(st.mats[st.mats.length - 1].n) + '</b>'; r.odds = 'certain'; return r;
        case 'desec': r.line = 'Desecration · pick it from 3 at the Well of Souls (' + esc(E.oddsLabel(st.odds.p)) + ' it’s offered)'; r.odds = 'pick'; return r;
        case 'regal': r.line = 'Perfect Regal might land it; otherwise an Exalt slam, ' + esc(slamOdds) + ' per Greater Exalt'; r.odds = slamOdds; return r;
        default: r.line = 'Exalt slam · ' + esc(slamOdds) + ' per Greater Exalt' + (m.essEarly.length ? ' · or <b>' + esc(m.essEarly[0].name) + '</b>' : ''); r.odds = slamOdds; return r;
      }
    }
    r.warn = true;
    if (m.craftOnly) r.line = 'Only from ' + esc((m.alloy[0] || m.essLate[0] || m.essEarly[0]).name) + ', and the one crafted slot is already taken';
    else if (m.desecOnly) r.line = 'Only from desecration, and the one desecrated slot is already taken';
    else if (m.impossible) r.line = 'Not available at item level ' + c.ilvl;
    else r.line = 'No room left for it with the other targets';
    return r;
  }
  function renderDesign() {
    var c = cur();
    renderRail();
    var cat = catOf(c);
    var b = cat.base;
    var rmap = routeMap(c);
    var h = '<article class="item" aria-label="Item design">';
    h += '<div class="item-head"><div class="art">' + heroArt(c.cls) + '</div>' +
      '<label class="base-pick"><span class="bp-name">' + esc(c.base) + '</span><select id="d-base" aria-label="Base type">' + baseOptions(c) + '</select></label>' +
      '<p class="item-sub">' + esc(CLS[c.cls].n) + (b.sub ? ' · ' + esc(b.sub) : '') + '</p></div>';
    h += '<div class="item-body">' + baseProps(b);
    h += '<label class="ilvl">Item level <input id="d-ilvl" type="number" inputmode="numeric" min="1" max="100" value="' + c.ilvl + '"></label>';
    var imp = implicitLines(b);
    if (imp.length) h += '<p class="implicit"><small>Implicit · comes with the base</small>' + imp.map(esc).join('<br>') + '</p>';
    h += '<div class="tip-rule" aria-hidden="true"><i></i></div>';
    [0, 1].forEach(function (s) {
      var n = cat.caps[s];
      h += '<p class="grp">' + (s ? 'Suffixes' : 'Prefixes') + '<span>' + plural(n, 'slot') + (n !== 3 ? ' on this base' : '') + '</span></p>';
      if (!n) { h += '<p class="props">This base allows no ' + SIDE[s] + 'es.</p>'; return; }
      h += '<ol class="boxes">';
      c.targets[s].forEach(function (t, i) {
        if (!t) {
          h += '<li class="box empty"><button type="button" class="box-main" data-act="d-pick" data-s="' + s + '" data-i="' + i + '">' + ico('u-plus') + 'Add a ' + SIDE[s] + '</button></li>';
          return;
        }
        var r = routeFor(c, cat, rmap, t);
        var opts = E.tierOptions(cat, famOf(t.mi));
        var sel = '<label class="box-tier"><span class="vh">Lowest tier you’ll accept</span><select data-act="d-tier" data-s="' + s + '" data-i="' + i + '">' +
          opts.map(function (o) {
            var lab = o.kind === 'roll' ? o.label + '+ · lvl ' + o.l : o.kind === 'essence' ? 'Essence' : o.kind === 'alloy' ? 'Alloy' : 'Desecrated';
            return '<option value="' + o.mi + '"' + (o.mi === t.mi ? ' selected' : '') + '>' + esc(lab) + '</option>';
          }).join('') + '</select></label>';
        h += '<li class="box' + (r.warn ? ' warn' : '') + '"><button type="button" class="box-main" data-act="d-pick" data-s="' + s + '" data-i="' + i + '" aria-label="Change ' + esc(E.famName(famOf(t.mi))) + '">' +
          '<span class="box-text">' + esc(modText(t.mi)) + '</span><span class="box-route">' + r.line + '</span></button>' + sel +
          '<button type="button" class="box-x" data-act="d-clear" data-s="' + s + '" data-i="' + i + '" aria-label="Remove ' + esc(E.famName(famOf(t.mi))) + '">' + ico('u-x') + '</button></li>';
      });
      h += '</ol>';
    });
    h += '<p class="tier-hint">T1 is the top tier. A box set to <b>T2+</b> takes T2 or T1, and lower tiers are cheaper to hit.</p>';
    if (b.rf || b.rfw) {
      h += '<label class="rf-toggle"><input type="checkbox" id="d-rf"' + (c.runeforge ? ' checked' : '') + '><span>Runeforge it at the end' +
        '<small>' + (b.rf ? 'Adds Runic Ward' + (b.rf.Ward ? ' (' + b.rf.Ward + ' base)' : '') + ' at the Verisium Anvil and trades some base defences for it. Needed for increased Runic Ward to do much.' : 'Changes the weapon’s base damage at the Verisium Anvil.') + '</small></span></label>';
    }
    h += '</div></article>';
    $('d-item').innerHTML = h;
    renderRoute(c, cat, rmap);
  }
  function renderRoute(c, cat, rmap) {
    var all = [];
    [0, 1].forEach(function (s) { c.targets[s].forEach(function (t) { if (t) all.push(t); }); });
    var h = '<div class="panel"><h2>How it gets made</h2><p class="lede">Every mod has a route. The odds are per orb and rough.</p>';
    if (!all.length) h += '<ul class="rlist"><li><span class="empty">Add mods to the boxes and their routes show up here.</span></li></ul>';
    else {
      h += '<ul class="rlist">';
      var warns = [], crafted = null, desec = null;
      all.forEach(function (t) {
        var r = routeFor(c, cat, rmap, t);
        var name = E.famName(famOf(t.mi));
        var odds = r.odds === 'certain' ? 'certain' : r.odds === 'pick' ? 'your pick' : r.odds === 'base' ? 'on base' : r.odds;
        if (r.kind === 'craft' || r.kind === 'essence') crafted = name;
        if (r.kind === 'desec') desec = name;
        h += '<li><span class="r-n">' + esc(name) + '</span><span class="r-o">' + esc(odds || '—') + '</span><span class="r-h">' + r.line + '</span></li>';
        if (r.warn) warns.push(esc(name) + ': ' + r.line.replace(/<[^>]+>/g, ''));
      });
      h += '</ul>';
      h += '<div class="slots2"><div class="slot2' + (crafted ? '' : ' free') + '"><span>Crafted slot</span><b>' + (crafted ? esc(crafted) : 'Free') + '</b></div>' +
        '<div class="slot2' + (desec ? '' : ' free') + '"><span>Desecration</span><b>' + (desec ? esc(desec) : 'Free') + '</b></div></div>';
      if (warns.length) h += '<div class="warns">' + warns.map(function (w) { return '<p class="warnline">' + w + '</p>'; }).join('') + '</div>';
    }
    var started = !!c.planSt;
    h += '<button type="button" class="btn primary cta" data-act="to-plan"' + (all.length ? '' : ' disabled') + '>' + ico('u-hammer') + (started ? 'Back to the plan' : 'Craft it') + ico('u-arrow') + '</button>';
    h += '</div>';
    h += '<p class="fine">Odds count every eligible tier the same, because the game data doesn’t publish spawn weights. Treat them as a guide, not a promise.</p>';
    $('d-route').innerHTML = h;
  }

  function startCraftFor(cls, base) {
    var prevCls = cur().cls;
    var n = blankCraft(cls, base);
    app.crafts[n.id] = n; app.curId = n.id;
    toast('Started a new craft for ' + (base || CLS[cls].n) + '. ' + slotNoun(prevCls) + ' saved in My crafts.');
    touch(n);
  }
  function changeClass(cls, base) {
    var c = cur();
    if (c.cls === cls) return;
    if (targetCount(c) || c.st) startCraftFor(cls, base);
    else { c.cls = cls; c.base = base || defaultBase(cls); c.runeforge = cls === 'gloves'; c.targets = [[], []]; fitTargets(c); touch(c); }
    renderDesign(); refreshBadges();
  }
  /* A base picked from the search. Another slot works like clicking that slot. The same slot changes this design's
     base, unless the item is already under way, which starts a new craft so the one in progress stays as it is. */
  function useBase(name) {
    var c = cur(), b = E.BASE[name];
    if (!b || name === c.base) return;
    if (b.c !== c.cls) changeClass(b.c, name);
    else if (c.st) { startCraftFor(b.c, name); renderDesign(); refreshBadges(); }
    else { c.base = name; revalidate(c, name); touch(c); renderDesign(); }
    revealSlot();
  }
  /* Scroll the slot list (a sideways strip on narrow screens) so the chosen slot is in view on screen. */
  function revealSlot() {
    var rail = $('rail'), el = rail.querySelector('[aria-pressed="true"]');
    if (!el) return;
    var r = rail.getBoundingClientRect(), s = el.getBoundingClientRect();
    var top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
    if (s.left < r.left) rail.scrollLeft -= r.left - s.left + 8; else if (s.right > r.right) rail.scrollLeft += s.right - r.right + 8;
    if (s.top < top) rail.scrollTop -= top - s.top + 8; else if (s.bottom > bottom) rail.scrollTop += s.bottom - bottom + 8;
  }

  /* ---------- design: find a base in any slot ---------- */
  var find = { res: [], act: 0 };
  /* Marks the query words in text, normalised like E.findBases (case, apostrophes, punctuation). Word starts
     only, unless mid is set and the word has no word-start match. */
  function hiText(text, words, mid) {
    text = String(text);
    var low = '', at = [], on = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i).toLowerCase();
      if (ch === '\'' || ch === '’') continue;
      if (/[a-z0-9]/.test(ch)) { low += ch; at.push(i); } else if (low && low.charAt(low.length - 1) !== ' ') { low += ' '; at.push(i); }
    }
    words.forEach(function (w) {
      var hit = -1;
      for (var j = low.indexOf(w); j > -1; j = low.indexOf(w, j + 1)) {
        if (j === 0 || low.charAt(j - 1) === ' ') { hit = j; break; }
        if (mid && hit < 0) hit = j;
      }
      if (hit > -1) for (var k = at[hit]; k <= at[hit + w.length - 1]; k++) on[k] = true;
    });
    var h = '', open = false;
    for (var m = 0; m < text.length; m++) {
      if (!!on[m] !== open) { h += open ? '</mark>' : '<mark>'; open = !open; }
      h += esc(text.charAt(m));
    }
    return h + (open ? '</mark>' : '');
  }
  function findOpen() { return !$('find-pop').hidden; }
  function renderFind() {
    var inp = $('find-q');
    var q = inp.value.trim();
    if (!q) { closeFind(false); return; }
    var c = cur();
    var r = E.findBases(q, { cls: c.cls, limit: 50 });
    find.res = r.list; find.act = 0;
    var h = '';
    r.list.forEach(function (x, i) {
      var b = x.b;
      var w = function (kinds) { return r.words.filter(function (_, j) { return kinds.indexOf(x.on[j]) > -1; }); };
      var meta = [hiText(CLS[b.c].n, w('k'))];
      if (b.sub) meta.push(hiText(b.sub, w('t')));
      meta.push('Level ' + b.lv);
      h += '<li class="fo' + (i === 0 ? ' on' : '') + '" id="fo-' + i + '" role="option" aria-selected="' + (i === 0) + '" data-act="find-pick" data-i="' + i + '">' +
        '<svg aria-hidden="true"><use href="#i-' + b.c + '"/></svg><span class="fo-n">' + hiText(b.n, w('nm'), true) + '</span>' +
        (b.n === c.base ? '<span class="rec">Current</span>' : '') +
        '<span class="fo-m">' + meta.join(' · ') + '</span>' +
        (x.imp ? '<span class="fo-i">' + hiText(dash(x.imp), w('i')) + '</span>' : '') + '</li>';
    });
    var list = $('find-list');
    list.innerHTML = h;
    list.scrollTop = 0;
    var foot = '';
    if (!r.total) foot = 'No base matches “' + esc(q) + '”. Try part of a name, a slot or a defence, like <b>cryptic</b> or <b>evasion boots</b>.';
    else if (r.total > r.list.length) foot = 'Showing ' + r.list.length + ' of ' + r.total + '. Keep typing to narrow it down.';
    $('find-foot').innerHTML = foot;
    $('find-pop').hidden = false;
    inp.setAttribute('aria-expanded', String(r.list.length > 0));
    inp.removeAttribute('aria-activedescendant');
    $('find-status').textContent = r.total ? plural(r.total, 'base') + ' found' : 'No base found';
  }
  function setFindAct(i, kb) {
    var list = $('find-list');
    find.act = i;
    list.querySelectorAll('.fo').forEach(function (el, j) { el.classList.toggle('on', j === i); el.setAttribute('aria-selected', String(j === i)); });
    var o = list.children[i];
    if (!o || !kb) return;
    $('find-q').setAttribute('aria-activedescendant', o.id);
    if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop - 4;
    else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight + 4;
  }
  function closeFind(clear) {
    var inp = $('find-q');
    if (clear) inp.value = '';
    $('find-pop').hidden = true;
    find.res = [];
    inp.setAttribute('aria-expanded', 'false');
    inp.removeAttribute('aria-activedescendant');
  }
  function pickFound(i) {
    var x = find.res[i];
    if (!x) return;
    closeFind(true);
    $('find-status').textContent = '';
    if (window.matchMedia('(pointer: coarse)').matches) $('find-q').blur();
    useBase(x.b.n);
  }
  function initFind() {
    var inp = $('find-q'), list = $('find-list');
    inp.addEventListener('input', renderFind);
    inp.addEventListener('focus', function () { if (inp.value.trim()) renderFind(); });
    inp.addEventListener('click', function () { if (!findOpen() && inp.value.trim()) renderFind(); });
    inp.addEventListener('blur', function () { closeFind(false); });
    inp.addEventListener('keydown', function (e) {
      var n = find.res.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!findOpen()) { renderFind(); return; }
        if (n) setFindAct((find.act + (e.key === 'ArrowDown' ? 1 : -1) + n) % n, true);
      } else if (e.key === 'Enter') {
        if (findOpen() && n) { e.preventDefault(); pickFound(find.act); }
      } else if (e.key === 'Escape') {
        if (findOpen()) { e.preventDefault(); e.stopPropagation(); closeFind(false); } else if (inp.value) { e.preventDefault(); inp.value = ''; }
      }
    });
    /* Keep focus in the box while the list is used with a mouse or finger. */
    $('find-pop').addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('mousemove', function (e) {
      var o = e.target.closest('.fo');
      if (o && +o.getAttribute('data-i') !== find.act) setFindAct(+o.getAttribute('data-i'), false);
    });
  }
  /* Keep targets valid after a base or item level change: same family, best tier still at or under the old level. */
  function revalidate(c, why) {
    var cat = catOf(c);
    var dropped = [], lowered = [];
    [0, 1].forEach(function (s) {
      c.targets[s] = c.targets[s].map(function (t) {
        if (!t) return null;
        var f = famOf(t.mi);
        var opts = E.tierOptions(cat, f);
        if (!opts.length) { dropped.push(E.famName(f)); return null; }
        if (opts.some(function (o) { return o.mi === t.mi; })) return t;
        var want = MODS[t.mi].l;
        var same = opts.filter(function (o) { return o.kind === 'roll' && o.l <= want; })[0] || opts.filter(function (o) { return o.kind === 'roll'; }).slice(-1)[0] || opts[0];
        lowered.push(E.famName(f));
        return { mi: same.mi };
      });
    });
    fitTargets(c);
    if (c.planSt) c.stale = true;
    var msg = [];
    if (dropped.length) msg.push('Removed ' + dropped.join(', ') + ' (not on ' + why + ')');
    if (lowered.length) msg.push('Adjusted the tier of ' + lowered.join(', '));
    if (msg.length) toast(msg.join('. ') + '.');
  }

  /* ---------- plan: the item (want vs have) ---------- */
  function statusInfo(m, t) {
    if (m.pseudo) return { cls: 'st-junk', text: m.pseudo === 'junk' ? 'Not wanted' : 'Junk to sacrifice' };
    var tier = tierLab(catOf(cur()), m.mi);
    var tl = m.est ? tier + ' or better' : tier;
    switch (m.status) {
      case 'hit': return m.accepted ? { cls: 'st-keep', text: 'Kept at ' + tier + ' (lower than wanted)' } : { cls: 'st-hit', text: 'On target · ' + tl };
      case 'low': return { cls: 'st-low', text: 'Lower tier than wanted · ' + tier + (t ? ' vs ' + tierLab(catOf(cur()), t.mi) : '') };
      case 'keep': return { cls: 'st-keep', text: 'Not a target, keeping it · ' + tier };
      default: return { cls: 'st-junk', text: 'Not wanted · ' + tier };
    }
  }
  function rowsFor(c, s, cat) {
    var mods = (c.st ? c.st.mods : []).filter(function (m) { return m.s === s; });
    var used = new Set();
    var rows = c.targets[s].map(function (t) {
      var have = null;
      if (t) {
        have = mods.find(function (m) { return !used.has(m) && m.mi !== null && m.mi !== undefined && famOf(m.mi) === famOf(t.mi); }) || null;
        if (have) used.add(have);
      }
      return { t: t, m: have };
    });
    mods.filter(function (m) { return !used.has(m); }).forEach(function (m) {
      var r = rows.find(function (x) { return !x.m && !x.t; }) || rows.find(function (x) { return !x.m; });
      if (r) r.m = m; else rows.push({ t: null, m: m });
    });
    while (rows.length < cat.caps[s]) rows.push({ t: null, m: null });
    return rows;
  }
  function renderPlanItem() {
    var c = cur();
    var cat = catOf(c);
    var design = designOf(c);
    if (c.st) E.analyze(cat, design, c.st);
    var skip = (c.st && c.st.skip) || {};
    var rar = c.st ? c.st.rarity : null;
    var nameCls = rar === 'rare' ? '' : rar === 'magic' ? ' magic' : ' normal';
    var h = '<article class="item" id="p-card" aria-label="Your item">';
    h += '<div class="item-head slim"><svg aria-hidden="true"><use href="#i-' + c.cls + '"/></svg>' +
      '<p class="nm' + nameCls + '">' + esc(c.base) + '</p><p class="sb">Item level ' + c.ilvl + ' · <a href="#design" data-go="design" style="color:inherit">edit design</a></p></div>';
    h += '<div class="item-body">';
    if (!c.st) {
      h += '<div class="startbar"><p><b>Where are you starting?</b></p><div class="row">' +
        '<button type="button" class="tbtn" data-act="start-blank">Nothing yet<small>Plan from a fresh base</small></button>' +
        '<button type="button" class="tbtn" data-act="start-copy">An item in progress<small>Copies your targets in. Remove what you don’t have.</small></button></div></div>';
    } else {
      h += '<div class="rarity"><span class="vh">Rarity</span><div class="seg" role="group" aria-label="Rarity">' +
        ['none', 'magic', 'rare'].map(function (v) { return '<button type="button" data-act="rarity" data-v="' + v + '" aria-pressed="' + (rar === v) + '">' + { none: 'Normal', magic: 'Magic', rare: 'Rare' }[v] + '</button>'; }).join('') +
        '</div><button type="button" class="tbtn" data-act="start-copy" style="padding:.3rem .6rem;font-size:.82rem">Copy targets in</button>' +
        '<button type="button" class="tbtn" data-act="start-blank" style="padding:.3rem .6rem;font-size:.82rem">Clear item</button></div>';
    }
    h += '<div class="cols-h" aria-hidden="true"><span>Want</span><span>Have</span></div>';
    [0, 1].forEach(function (s) {
      if (!cat.caps[s]) return;
      h += '<p class="grp">' + (s ? 'Suffixes' : 'Prefixes') + '</p><div class="srows">';
      rowsFor(c, s, cat).forEach(function (r) {
        var w;
        if (r.t) {
          var f = famOf(r.t.mi);
          var sk = !!skip[f];
          var tl = tierLab(cat, r.t.mi);
          w = '<div class="want' + (sk ? ' skipped' : '') + '"><span class="wn">' + esc(E.famName(f)) + '</span><span class="wt">' + esc(tl) + (tl.charAt(0) === 'T' ? ' or better' : '') + (sk ? ' · skipped' : '') + '</span>' +
            (sk ? '<button type="button" class="unskip" data-act="unskip" data-f="' + f + '">Want it again</button>' : '') + '</div>';
        } else w = '<div class="want none"><span class="wt">Any</span></div>';
        var hv;
        if (!r.m) {
          hv = '<div class="have empty"><button type="button" class="h-main" data-act="have-add" data-s="' + s + '"' + (rar === 'none' ? ' aria-disabled="true"' : '') + '><span class="h-text">' + (rar === 'none' ? 'Empty' : '+ Add what’s here') + '</span></button></div>';
        } else {
          var m = r.m, info = statusInfo(m, r.t);
          var flags = [];
          if (m.crafted) flags.push('Crafted');
          if (m.desec) flags.push('Desecrated');
          if (m.fract) flags.push('Fractured');
          var showKd = !m.pseudo && (m.status === 'junk' || m.status === 'keep' || m.status === 'low' || m.accepted);
          var keepOn = m.mark === 'keep';
          hv = '<div class="have ' + info.cls + '"><button type="button" class="h-main" data-act="have-edit" data-id="' + esc(m.id) + '">' +
            '<span class="h-text">' + (m.pseudo ? (m.pseudo === 'junk' ? 'A ' + SIDE[s] + ' you don’t want' : 'Any ' + SIDE[s] + ' (junk to sacrifice)') : esc(modText(m.mi))) + '</span>' +
            '<span class="h-st"><span>' + esc(info.text) + '</span>' + flags.map(function (f) { return '<span class="fl">' + f + '</span>'; }).join('') + '</span></button>' +
            '<div class="h-tools">' + (showKd ? '<div class="kd" role="group" aria-label="Keep or ditch"><button type="button" data-act="mark" data-id="' + esc(m.id) + '" data-v="keep" aria-pressed="' + keepOn + '">Keep</button><button type="button" data-act="mark" data-id="' + esc(m.id) + '" data-v="junk" aria-pressed="' + (!keepOn) + '">Ditch</button></div>' : '') +
            '<button type="button" class="h-x" data-act="have-del" data-id="' + esc(m.id) + '" aria-label="Not on my item">' + ico('u-x') + '</button></div></div>';
        }
        h += '<div class="srow">' + w + hv + '</div>';
      });
      h += '</div>';
    });
    var planned = !!c.planSt;
    h += '<div class="forge">';
    if (!planned) h += '<button type="button" class="btn primary pulse" data-act="forge"' + (c.st ? '' : ' disabled') + '>' + ico('u-hammer') + 'Forge ahead</button><p class="hint">' + (c.st ? 'Lists every step from where your item is now.' : 'Choose where you’re starting first.') + '</p>';
    else if (c.stale) h += '<button type="button" class="btn primary pulse" data-act="forge">' + ico('u-hammer') + 'Reforge from here</button><p class="hint">Your item changed. This re-plans from what it has now.</p>';
    else h += '<button type="button" class="btn quiet" data-act="forge">' + ico('u-hammer') + 'Reforge from here</button><p class="hint">The steps match your item.</p>';
    h += '</div></div></article>';
    h += '<div class="legend" aria-label="Colour key"><span><i style="--c:var(--tip-hit)"></i>On target</span><span><i style="--c:var(--tip-low)"></i>Lower tier</span><span><i style="--c:var(--tip-junk)"></i>Not wanted</span><span><i style="--c:var(--tip-keep)"></i>Keeping</span></div>';
    $('p-item').innerHTML = h;
  }

  /* ---------- plan: the steps ---------- */
  function matLine(m) {
    var v = E.price(m.k, app.league);
    var q = m.q || 1;
    var total = v === null ? null : v * q;
    var qty = m.q ? ' <span class="q">×' + m.q + (m.approx ? ' (price per ' + m.q + ')' : '') + '</span>' : '';
    return '<li class="' + (m.opt ? 'mopt' : '') + '"><span>' + esc(m.n) + qty + (m.opt ? ' <span class="q">optional</span>' : '') + '</span><span class="p' + (total !== null && total >= 5 ? ' hi' : '') + '">' + esc(fmt(total)) + '</span></li>';
  }
  function perTry(mats) {
    var need = mats.filter(function (m) { return !m.opt; });
    if (!need.length) return '';
    var r = E.matsCost(need, app.league);
    return '<p class="pertry"><span>Per try' + (r.known ? '' : ' (some prices unknown)') + '</span><b>' + esc(fmt(r.sum)) + '</b></p>';
  }
  function stepKey(c, step) { return c.id + ':' + c.hist.length + ':' + step.kind + ':' + (step.side === undefined ? '' : step.side); }
  function curOption(c, step) {
    if (!step.options) return null;
    var key = stepKey(c, step);
    var k = app.ui.optFor === key ? app.ui.opt : step.recommended;
    return step.options.find(function (o) { return o.key === k; }) || step.options[0];
  }
  function renderNow(c, step, n) {
    var stale = c.stale;
    var opt = curOption(c, step);
    var mats = opt ? opt.mats : step.mats;
    var outs = opt ? opt.outcomes : step.outcomes;
    var odds = opt ? (opt.mats.length ? { p: opt.swap ? opt.pAdd : opt.p, what: opt.swap ? 'to reroll it into a target' : 'to remove junk' } : null) : step.odds;
    var h = '<div class="card' + (stale ? ' dim' : '') + '">';
    h += '<div class="card-k"><span class="eyebrow">Now · step ' + n + ' · ' + esc(KIND[step.kind] || step.kind) + '</span></div>';
    h += '<h3>' + esc(step.title) + '</h3>';
    h += '<p class="how">' + esc(dash(step.how)) + '</p>';
    if (step.spec) h += '<dl class="spec">' + step.spec.map(function (r) { return '<dt>' + esc(r.k) + '</dt><dd>' + esc(r.v) + '</dd>'; }).join('') + '</dl>';
    (step.warn || []).forEach(function (w) { h += '<p class="warn2">' + esc(w) + '</p>'; });
    if (step.options) {
      h += '<p class="q">Choose how</p><div class="opts" role="radiogroup" aria-label="Ways to make room">';
      step.options.forEach(function (o) {
        var on = o === opt;
        var costTxt = o.mats.length ? fmt(o.cost) + ' a try · ~' + fmt(o.exp) + ' avg' : 'free';
        h += '<button type="button" class="opt" role="radio" aria-checked="' + on + '" data-act="opt" data-k="' + o.key + '"' + (stale ? ' disabled' : '') + '><span class="dot"></span>' +
          '<span class="ol">' + esc(o.label) + (o.key === step.recommended ? '<span class="rec">Suggested</span>' : '') + '</span><span class="oc">' + esc(costTxt) + '</span>' +
          '<span class="ot">' + esc(o.text) + '</span></button>';
      });
      h += '</div>';
    }
    if (odds) {
      h += '<div class="odds"><span class="big">' + esc(E.oddsLabel(odds.p)) + '</span><span class="what">' + esc(odds.what) + '</span>' +
        (odds.alt ? '<span class="alt">With a ' + esc(odds.alt.label) + ': ' + esc(E.oddsLabel(odds.alt.p)) + ', at a much higher price per try.</span>' : '') + '</div>';
    }
    if (mats && mats.length) h += '<div><p class="q" style="margin-bottom:.35rem">Use</p><ul class="mats">' + mats.map(matLine).join('') + '</ul>' + perTry(mats) + '</div>';
    if (step.note) h += '<p class="note">' + esc(dash(step.note)) + '</p>';
    if (step.kind === 'done') {
      h += '<div class="outs"><button type="button" class="out first" data-act="new-craft">' + ico('u-plus') + ' Start another craft</button><button type="button" class="out" data-act="go-design">Back to the design</button></div>';
    } else if (outs && outs.length) {
      h += '<p class="q">' + (step.kind === 'finish' ? 'When you’re done' : 'What happened?') + '</p><div class="outs">';
      var seen = {};
      outs.forEach(function (o, i) {
        if (seen[o.label]) return;
        seen[o.label] = true;
        var cls = 'out' + (i === 0 && !o.pick && !o.bad ? ' first' : '') + (o.pick || o.edit ? ' other' : '') + (o.bad ? ' bad' : '');
        h += '<button type="button" class="' + cls + '" data-act="out" data-i="' + i + '"' + (stale ? ' disabled' : '') + '>' + esc(o.label) + (o.pick ? '…' : '') + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }
  function renderPlanSteps() {
    var c = cur();
    var el = $('p-steps');
    $('p-grid').classList.toggle('started', !!c.planSt);
    if (!c.planSt) {
      el.innerHTML = '<div class="steps-head"><h2>Steps</h2></div><div class="empty-steps"><h3>Your steps show up here</h3><p>Choose where you’re starting, remove any mods you don’t have yet, then press <b>Forge ahead</b>.</p></div>';
      updateTabStep(null);
      return;
    }
    var design = designOf(c);
    var steps = E.plan(design, c.planSt);
    app.steps = steps;
    var doneSteps = c.hist.filter(function (x) { return !x.e; }).length;
    var n = doneSteps + 1;
    var now = steps[0];
    var left = steps.filter(function (s) { return s.kind !== 'done'; }).length;
    var h = '<div class="steps-head"><div><h2>Steps</h2><p class="meta">' + (now.kind === 'done' ? 'All done' : 'Step ' + n + ' · about ' + plural(left, 'step') + ' to go') + '</p></div><div class="steps-tools">' +
      (c.hist.length ? '<button type="button" class="btn small" data-act="undo">' + ico('u-undo') + 'Undo</button>' : '') +
      (app.ui.confirmReset ? '<span class="muted" style="font-size:.9rem">Clear progress?</span><button type="button" class="btn small danger" data-act="reset-yes">Start over</button><button type="button" class="btn small quiet" data-act="reset-no">Keep</button>'
        : '<button type="button" class="btn small quiet" data-act="reset">Start over</button>') + '</div></div>';
    if (c.stale) h += '<div class="stale"><span>Your item or targets changed since these steps were made.</span><button type="button" class="btn small primary" data-act="forge">' + ico('u-hammer') + 'Reforge from here</button></div>';
    h += '<ol class="timeline">';
    var hist = c.hist;
    var showFrom = app.ui.doneAll ? 0 : Math.max(0, hist.length - 3);
    if (showFrom > 0) h += '<li class="st"><span></span><button type="button" class="done-toggle" data-act="done-all">' + ico('u-chev') + 'Show ' + plural(showFrom, 'earlier step') + '</button></li>';
    var k = 0;
    hist.forEach(function (x, i) {
      if (!x.e) k += 1;
      if (i < showFrom) return;
      h += '<li class="st done' + (x.e ? ' edit' : '') + '"><div class="st-n" aria-hidden="true"><span>' + (x.e ? '✎' : k) + '</span></div><div class="st-b"><b>' + esc(x.t) + '</b><span>' + esc(x.o || '') + '</span></div></li>';
    });
    h += '<li class="st now"><div class="st-n" aria-hidden="true"><span>' + n + '</span></div><div class="st-b">' + renderNow(c, now, n) + '</div></li>';
    steps.slice(1).forEach(function (s, i) {
      var num = n + i + 1;
      var open = !!app.ui.open[num];
      h += '<li class="st next"><div class="st-n" aria-hidden="true"><span>' + num + '</span></div><div class="st-b"><h4>' + esc(s.title) + '</h4>' +
        (s.how ? '<p class="sm' + (open ? ' open' : '') + '">' + esc(dash(s.how)) + '</p>' : '') +
        ((s.mats && s.mats.length) ? '<p class="ml">' + esc(s.mats.map(function (m) { return m.n; }).join(' · ')) + (s.odds && s.odds.p < 0.995 ? ' · ' + esc(E.oddsLabel(s.odds.p)) : '') + '</p>' : '') +
        (s.how && s.how.length > 100 ? '<button type="button" class="more" data-act="more" data-n="' + num + '">' + (open ? 'Less' : 'More') + '</button>' : '') + '</div></li>';
    });
    h += '</ol>';
    var lastS = steps[steps.length - 1];
    if (lastS && lastS.endsHere) h += '<p class="fine">If you start over, the plan begins again from a fresh base.</p>';
    h += '<p class="fine">Later steps assume each roll lands. When one doesn’t, tell the current step what happened and the rest re-plans.</p>';
    el.innerHTML = h;
    updateTabStep(now.kind === 'done' ? '✓' : String(n));
  }
  function updateTabStep(t) {
    var b = $('tab-step');
    if (!t) { b.hidden = true; return; }
    b.hidden = false; b.textContent = t;
  }
  function renderPlan() { renderPlanItem(); renderPlanSteps(); }

  /* ---------- plan actions ---------- */
  function pushHist(c, entry) {
    entry.st = clone(c.st); entry.ps = clone(c.planSt); entry.sl = c.stale;
    c.hist.push(entry);
    if (c.hist.length > 60) c.hist.shift();
  }
  function manualEdit(c, fn) {
    if (!c.editing) { pushHist(c, { t: 'Edited the item', o: '', e: true }); c.editing = true; }
    fn();
    if (c.planSt) c.stale = true;
    touch(c);
    renderPlan();
  }
  function commit(c, stepTitle, label, newSt) {
    pushHist(c, { t: stepTitle, o: label });
    c.st = newSt; c.planSt = clone(newSt); c.stale = false; c.editing = false;
    app.ui.optFor = null; app.ui.open = {};
    touch(c);
    renderPlan();
  }
  function forge() {
    var c = cur();
    if (!c.st) c.st = { rarity: 'none', mods: [], done: {}, skip: {} };
    c.planSt = clone(c.st); c.stale = false; c.editing = false;
    touch(c);
    renderPlan();
    if (window.matchMedia('(max-width: 980px)').matches) {
      var s = $('p-steps'); if (s) s.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }
  function reduceMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function flashItem(msg) {
    var card = $('p-card');
    if (card) {
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
      card.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    if (msg) toast(msg);
  }
  function applyOutcome(i) {
    var c = cur();
    var step = app.steps && app.steps[0];
    if (!step || c.stale) return;
    var opt = curOption(c, step);
    var outs = opt ? opt.outcomes : step.outcomes;
    var o = outs[i];
    if (!o) return;
    var title = step.title + (opt && opt.key !== 'settle' && opt.key !== 'restart' ? ' · ' + opt.label : '');
    if (o.edit) {
      pushHist(c, { t: step.title, o: o.label });
      if (step.kind === 'base') c.st = { rarity: 'magic', mods: [], done: {}, skip: (c.st && c.st.skip) || {} };
      c.stale = true; c.editing = true;
      touch(c); renderPlan();
      flashItem(step.kind === 'base' ? 'Add the mods your base has, then press Reforge from here.' : 'Fix the item to match, then press Reforge from here.');
      return;
    }
    if (o.pick) {
      openPicker({
        mode: 'have', side: o.pick.s, flags: { desec: !!o.pick.desec },
        title: 'What landed?', sub: 'Pick the ' + SIDE[o.pick.s] + ' that’s on the item now.',
        onPick: function (mod) {
          var st = c.planSt;
          if (o.pick.remove) st = E.apply(st, { type: 'remove', id: o.pick.remove });
          st = E.apply(st, { type: o.pick.rare ? 'rare' : 'add', mods: [mod] });
          commit(c, title, (o.label.replace(/…$/, '')) + ': ' + (mod.pseudo ? 'junk' : E.famName(famOf(mod.mi))), st);
        }
      });
      return;
    }
    commit(c, title, o.label, E.apply(c.planSt, o.o));
  }
  function undo() {
    var c = cur();
    var x = c.hist.pop();
    if (!x) return;
    c.st = x.st; c.planSt = x.ps; c.stale = x.sl; c.editing = false;
    app.ui.optFor = null;
    touch(c); renderPlan();
    toast('Undid “' + x.t + '”.');
  }
  function startCopy() {
    var c = cur();
    var mods = [];
    [0, 1].forEach(function (s) { c.targets[s].forEach(function (t) { if (t) mods.push({ id: E.newId(), s: s, mi: t.mi, mark: 'auto' }); }); });
    var perSide = [0, 1].map(function (s) { return mods.filter(function (m) { return m.s === s; }).length; });
    var doIt = function () {
      c.st = { rarity: (perSide[0] > 1 || perSide[1] > 1) ? 'rare' : mods.length ? 'magic' : 'none', mods: mods, done: {}, skip: (c.st && c.st.skip) || {} };
    };
    if (c.st) manualEdit(c, doIt); else { doIt(); touch(c); renderPlan(); }
    toast('Copied your targets in. Press ✕ on any you don’t have, and add what else is on it.');
  }
  function startBlank() {
    var c = cur();
    var doIt = function () { c.st = { rarity: 'none', mods: [], done: {}, skip: (c.st && c.st.skip) || {} }; };
    if (c.st) manualEdit(c, doIt); else { doIt(); touch(c); renderPlan(); }
  }
  function setRarity(v) {
    var c = cur();
    manualEdit(c, function () {
      c.st.rarity = v;
      if (v === 'none') c.st.mods = [];
      if (v === 'magic') {
        [0, 1].forEach(function (s) {
          var side = c.st.mods.filter(function (m) { return m.s === s; });
          if (side.length > 1) {
            var keep = side[0];
            c.st.mods = c.st.mods.filter(function (m) { return m.s !== s || m === keep; });
          }
        });
      }
    });
  }
  function findMod(c, id) { return c.st && c.st.mods.find(function (m) { return m.id === id; }); }
  function addHave(s) {
    var c = cur();
    if (!c.st || c.st.rarity === 'none') {
      if (!c.st) c.st = { rarity: 'none', mods: [], done: {}, skip: {} };
    }
    openPicker({
      mode: 'have', side: s, flags: {}, title: 'What’s on your item?', sub: 'Pick the ' + SIDE[s] + ' your item has.',
      onPick: function (mod) {
        manualEdit(c, function () {
          c.st.mods.push(mod);
          var per = [0, 1].map(function (x) { return c.st.mods.filter(function (m) { return m.s === x; }).length; });
          if (c.st.rarity === 'none') c.st.rarity = 'magic';
          if (c.st.rarity === 'magic' && (per[0] > 1 || per[1] > 1)) { c.st.rarity = 'rare'; toast('Marked as rare: magic items hold one prefix and one suffix.'); }
        });
      }
    });
  }
  function editHave(id) {
    var c = cur();
    var m = findMod(c, id);
    if (!m) return;
    openPicker({
      mode: 'have', side: m.s, current: m.mi, flags: { desec: !!m.desec, crafted: !!m.crafted, fract: !!m.fract },
      title: 'Change this ' + SIDE[m.s], sub: 'Pick what the item really has.', editing: m.id,
      onPick: function (mod) {
        manualEdit(c, function () {
          var i = c.st.mods.findIndex(function (x) { return x.id === id; });
          if (i > -1) { mod.id = id; c.st.mods[i] = mod; }
        });
      }
    });
  }

  /* ---------- picker ---------- */
  function openPicker(p) {
    var c = cur();
    p.q = ''; p.cat = 'All'; p.open = null; p.ret = document.activeElement;
    p.flags = p.flags || {};
    app.pk = p;
    var el = $('picker');
    el.hidden = false;
    var cat = catOf(c);
    var side = p.side;
    var cats = ['All'];
    cat.sides[side].forEach(function (F) { if (cats.indexOf(F.c) < 0) cats.push(F.c); });
    var title = p.title || 'Choose a ' + SIDE[side];
    var sub = p.sub || (esc(c.base) + ' · item level ' + c.ilvl);
    el.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pk-t">' +
      '<div class="pk-head"><div><h2 id="pk-t">' + esc(title) + '</h2><p>' + sub + ' · ' + plural(cat.sides[side].length, SIDE[side], SIDE[side] + 'es') + ' on this base</p></div>' +
      '<button type="button" class="x" data-act="pk-close" aria-label="Close">' + ico('u-x') + '</button></div>' +
      '<div class="pk-tools"><input id="pk-q" type="search" placeholder="Search ' + SIDE[side] + 'es, e.g. life, cold" autocomplete="off" spellcheck="false" aria-label="Search mods">' +
      '<div class="pk-cats" role="group" aria-label="Category">' + cats.map(function (k) { return '<button type="button" class="chip" data-act="pk-cat" data-c="' + esc(k) + '" aria-pressed="' + (k === 'All') + '">' + esc(k) + '</button>'; }).join('') + '</div></div>' +
      '<div class="pk-list" id="pk-list"></div>' +
      (p.mode === 'have' ? '<div class="pk-foot"><label><input type="checkbox" id="pk-fr"' + (p.flags.fract ? ' checked' : '') + '> Fractured</label><label><input type="checkbox" id="pk-de"' + (p.flags.desec ? ' checked' : '') + '> Desecrated</label><label><input type="checkbox" id="pk-cr"' + (p.flags.crafted ? ' checked' : '') + '> Crafted (essence or alloy)</label><button type="button" class="btn small quiet sp" data-act="pk-close">Cancel</button></div>'
        : '<div class="pk-foot"><span class="fine">Picks the best tier. Lower it in the box if a lesser roll will do.</span><button type="button" class="btn small quiet sp" data-act="pk-close">Cancel</button></div>') +
      '</div>';
    renderPickList();
    var q = $('pk-q');
    q.addEventListener('input', function () { app.pk.q = q.value; renderPickList(); });
    setTimeout(function () { if (!window.matchMedia('(pointer: coarse)').matches) q.focus(); else el.querySelector('.x').focus(); }, 0);
  }
  function closePicker() {
    var p = app.pk;
    app.pk = null;
    var el = $('picker');
    el.hidden = true; el.innerHTML = '';
    if (p && p.ret && document.body.contains(p.ret)) { try { p.ret.focus(); } catch (e) { /* ignore */ } }
  }
  function pickUsed(F) {
    var c = cur(), p = app.pk;
    if (p.mode === 'design') {
      return c.targets[p.side].some(function (t, i) { return t && i !== p.i && famOf(t.mi) === F.f; });
    }
    return !!(c.st && c.st.mods.some(function (m) { return m.id !== p.editing && m.mi !== null && m.mi !== undefined && famOf(m.mi) === F.f; }));
  }
  function renderPickList() {
    var c = cur(), p = app.pk, cat = catOf(c);
    var q = p.q.trim().toLowerCase();
    var list = cat.sides[p.side].filter(function (F) {
      if (p.cat !== 'All' && F.c !== p.cat) return false;
      if (!q) return true;
      var hay = (F.name + ' ' + F.t + ' ' + E.tierOptions(cat, F.f).map(function (o) { return MODS[o.mi].x + ' ' + (o.ess || []).join(' ') + ' ' + (o.src || ''); }).join(' ')).toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
    });
    var h = '';
    if (p.mode === 'have') h += '<button type="button" class="pk-junk" data-act="pk-junk">' + ico('u-x') + '<span>Something I don’t want<small class="muted" style="display:block;font-size:.82rem">Any ' + SIDE[p.side] + ' you plan to replace. Fine to leave vague.</small></span></button>';
    if (!list.length) h += '<p class="pk-none">Nothing matches. Clear the search or pick another category.</p>';
    var lastCat = null;
    list.forEach(function (F) {
      if (p.cat === 'All' && F.c !== lastCat) { h += '<p class="pk-cat">' + esc(F.c) + '</p>'; lastCat = F.c; }
      var opts = E.tierOptions(cat, F.f);
      var top = opts[0];
      var used = pickUsed(F);
      var tags = [];
      if (F.essence.length) tags.push('<span class="tag ess">Essence</span>');
      if (F.alloy.length) tags.push('<span class="tag alloy">' + esc(F.alloy[0].name.replace(/^The /, '')) + '</span>');
      if (F.lich.length) tags.push('<span class="tag lich">Desecrated</span>');
      var meta = F.rollable ? plural(F.tiers.length, 'tier') + ' · top needs item level ' + F.tiers[0].l : (F.alloy.length ? 'Alloy only' : F.lich.length ? 'Desecration only (' + esc(F.lich[0].lich) + ')' : 'Essence only');
      var open = p.open === F.f;
      h += '<div class="fam' + (used ? ' used' : '') + (open ? ' open' : '') + '"><button type="button" class="fam-main" data-act="pk-fam" data-f="' + F.f + '"' + (used ? ' aria-disabled="true"' : '') + ' aria-expanded="' + open + '">' +
        '<span class="fam-t">' + esc(dash(MODS[top.mi].x)) + '</span><span class="fam-m">' + (used ? (p.mode === 'design' ? 'Already in another box' : 'Already on the item') : meta) + '</span>' +
        '<span class="fam-b">' + tags.join('') + '</span></button>';
      if (open) {
        h += '<div class="tiers">' + opts.map(function (o) {
          var lab = o.kind === 'roll' ? o.label : o.kind === 'essence' ? 'Essence' : o.kind === 'alloy' ? 'Alloy' : 'Desecr.';
          var subl = o.kind === 'roll' ? 'lvl ' + o.l : '';
          var src = o.kind === 'roll' ? (o.ess && o.ess.length ? 'Also from ' + o.ess.join(', ') : '') : o.kind === 'essence' ? o.ess.join(', ') : o.kind === 'alloy' ? o.src : 'From ' + o.src + ' (desecration)';
          return '<button type="button" class="tier" data-act="pk-tier" data-mi="' + o.mi + '" data-kind="' + o.kind + '" aria-pressed="' + (p.current === o.mi) + '"><span class="tl">' + esc(lab) + (subl ? '<small>' + subl + '</small>' : '') + '</span>' +
            '<span class="tt">' + esc(dash(MODS[o.mi].x)) + (src ? '<small>' + esc(src) + '</small>' : '') + '</span></button>';
        }).join('') + '</div>';
      }
      h += '</div>';
    });
    $('pk-list').innerHTML = h;
  }
  function pickFlags() {
    return { fract: !!($('pk-fr') && $('pk-fr').checked), desec: !!($('pk-de') && $('pk-de').checked), crafted: !!($('pk-cr') && $('pk-cr').checked) };
  }
  function finishPick(mi, kind) {
    var p = app.pk;
    if (!p) return;
    if (p.mode === 'design') {
      var c = cur();
      c.targets[p.side][p.i] = { mi: mi };
      if (c.planSt) c.stale = true;
      touch(c);
      closePicker();
      renderDesign();
      return;
    }
    var fl = pickFlags();
    var mod = { id: E.newId(), s: p.side, mi: mi, mark: 'auto' };
    if (mi === null) { mod.pseudo = 'junk'; mod.mark = 'junk'; }
    if (fl.fract) mod.fract = true;
    if (fl.desec || kind === 'lich') mod.desec = true;
    if (fl.crafted || kind === 'alloy' || kind === 'essence') mod.crafted = true;
    var fn = p.onPick;
    closePicker();
    fn(mod);
  }

  /* ---------- crafts drawer ---------- */
  function craftMeta(c) {
    var t = targetCount(c);
    if (!c.st) return t ? plural(t, 'target') + ' · not started' : 'Empty design';
    var A = E.analyze(catOf(c), designOf(c), clone(c.st));
    var steps = c.hist.filter(function (x) { return !x.e; }).length;
    return A.hits + '/' + t + ' on the item · ' + plural(steps, 'step') + ' done';
  }
  function renderCraftsBadge() {
    var n = Object.keys(app.crafts).filter(function (id) { return worth(app.crafts[id]); }).length;
    $('crafts-n').textContent = n ? '(' + n + ')' : '';
  }
  function storeLine() {
    if (store.mode === 'db' && !store.readOnly) return '<p class="store synced"><i></i>Saved to your account, so it follows you between devices.</p>';
    return '<p class="store"><i></i>Saved in this browser only.</p>';
  }
  function renderStore() { var el = $('dr-store'); if (el) el.innerHTML = storeLine(); }
  function openDrawer() {
    app.ui.confirmDel = null;
    $('drawer').hidden = false;
    renderDrawer();
    var x = $('drawer').querySelector('.x'); if (x) x.focus();
  }
  function closeDrawer() { $('drawer').hidden = true; $('drawer').innerHTML = ''; var b = $('crafts-open'); if (b) b.focus(); }
  function renderDrawer() {
    var list = Object.keys(app.crafts).map(function (id) { return app.crafts[id]; }).filter(function (c) { return worth(c) || c.id === app.curId; }).sort(function (a, b) { return b.at - a.at; });
    var h = '<div class="drawer-card" role="dialog" aria-modal="true" aria-labelledby="dr-t"><div class="dr-head"><h2 id="dr-t">My crafts</h2><button type="button" class="btn small quiet x" data-act="dr-close" aria-label="Close">' + ico('u-x') + '</button></div><div class="dr-list">';
    list.forEach(function (c) {
      var isCur = c.id === app.curId;
      h += '<div class="craft' + (isCur ? ' cur' : '') + '"><svg aria-hidden="true"><use href="#i-' + c.cls + '"/></svg>' +
        '<button type="button" class="cn" data-act="dr-open" data-id="' + esc(c.id) + '">' + esc(c.base) + (isCur ? ' <span class="rec">Open</span>' : '') + '</button>' +
        '<span class="cm">' + esc(craftMeta(c)) + ' · ' + esc(ago(c.at)) + '</span><span class="ca">' +
        (app.ui.confirmDel === c.id ? '<button type="button" class="btn small danger" data-act="dr-del-yes" data-id="' + esc(c.id) + '">Delete</button><button type="button" class="btn small quiet" data-act="dr-del-no">Keep</button>'
          : '<button type="button" class="btn small quiet" data-act="dr-del" data-id="' + esc(c.id) + '" aria-label="Delete ' + esc(c.base) + '">' + ico('u-trash') + '</button>') + '</span></div>';
    });
    h += '</div><div class="dr-foot"><button type="button" class="btn primary" data-act="new-craft">' + ico('u-plus') + 'New craft</button><div id="dr-store">' + storeLine() + '</div></div></div>';
    $('drawer').innerHTML = h;
  }
  function newCraft() {
    var c = blankCraft(cur() ? cur().cls : 'gloves');
    app.crafts[c.id] = c; app.curId = c.id;
    touch(c);
    if (!$('drawer').hidden) closeDrawer();
    go('design');
    renderCraftsBadge();
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4200);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    if (findOpen() && !e.target.closest('#find')) closeFind(false);
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.getAttribute('data-go')); return; }
    var lg = e.target.closest('[data-lg]');
    if (lg) { setLeague(lg.getAttribute('data-lg')); return; }
    if (e.target.closest('#crafts-open')) { openDrawer(); return; }
    if (e.target.closest('#slot-pick')) { openSlots(); return; }
    if (e.target === $('picker')) { closePicker(); return; }
    if (e.target === $('drawer')) { closeDrawer(); return; }
    if (e.target === $('slots')) { closeSlots(); return; }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    var act = a.getAttribute('data-act');
    var c = cur();
    var s = +a.getAttribute('data-s'), i = +a.getAttribute('data-i');
    switch (act) {
      case 'cls': changeClass(a.getAttribute('data-cls')); closeSlots(); break;
      case 'slots-close': closeSlots(); break;
      case 'find-pick': pickFound(i); break;
      case 'd-pick': openPicker({ mode: 'design', side: s, i: i, current: c.targets[s][i] ? c.targets[s][i].mi : null }); break;
      case 'd-clear': c.targets[s][i] = null; if (c.planSt) c.stale = true; touch(c); renderDesign(); break;
      case 'to-plan': go('plan'); break;
      case 'go-design': go('design'); break;
      case 'start-blank': startBlank(); break;
      case 'start-copy': startCopy(); break;
      case 'rarity': setRarity(a.getAttribute('data-v')); break;
      case 'have-add': if (a.getAttribute('aria-disabled') === 'true') { toast('Set the rarity to Magic or Rare first.'); break; } addHave(s); break;
      case 'have-edit': editHave(a.getAttribute('data-id')); break;
      case 'have-del': (function (id) { manualEdit(c, function () { c.st.mods = c.st.mods.filter(function (m) { return m.id !== id; }); }); })(a.getAttribute('data-id')); break;
      case 'mark': (function (id, v) { manualEdit(c, function () { var m = findMod(c, id); if (m) m.mark = v; }); })(a.getAttribute('data-id'), a.getAttribute('data-v')); break;
      case 'unskip': (function (f) { manualEdit(c, function () { if (c.st && c.st.skip) delete c.st.skip[f]; }); })(a.getAttribute('data-f')); break;
      case 'forge': forge(); break;
      case 'out': applyOutcome(i); break;
      case 'opt': app.ui.opt = a.getAttribute('data-k'); app.ui.optFor = stepKey(c, app.steps[0]); renderPlanSteps(); break;
      case 'undo': undo(); break;
      case 'reset': app.ui.confirmReset = true; renderPlanSteps(); break;
      case 'reset-no': app.ui.confirmReset = false; renderPlanSteps(); break;
      case 'reset-yes': app.ui.confirmReset = false; c.st = null; c.planSt = null; c.hist = []; c.stale = false; c.editing = false; touch(c); renderPlan(); break;
      case 'done-all': app.ui.doneAll = true; renderPlanSteps(); break;
      case 'more': (function (n) { app.ui.open[n] = !app.ui.open[n]; renderPlanSteps(); })(+a.getAttribute('data-n')); break;
      case 'new-craft': newCraft(); break;
      case 'pk-close': closePicker(); break;
      case 'pk-cat': app.pk.cat = a.getAttribute('data-c'); a.parentNode.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b === a)); }); renderPickList(); break;
      case 'pk-fam':
        if (a.getAttribute('aria-disabled') === 'true') break;
        (function (f) {
          if (app.pk.mode === 'design' && !e.target.closest('.fam-b')) {
            finishPick(E.tierOptions(catOf(c), f)[0].mi, E.tierOptions(catOf(c), f)[0].kind);
          } else { app.pk.open = app.pk.open === f ? null : f; renderPickList(); }
        })(+a.getAttribute('data-f'));
        break;
      case 'pk-tier': finishPick(+a.getAttribute('data-mi'), a.getAttribute('data-kind')); break;
      case 'pk-junk': finishPick(null, 'junk'); break;
      case 'dr-close': closeDrawer(); break;
      case 'dr-open': app.curId = a.getAttribute('data-id'); app.ui.optFor = null; app.ui.confirmReset = false; closeDrawer(); renderAll(); saveLocalSoon(); break;
      case 'dr-del': app.ui.confirmDel = a.getAttribute('data-id'); renderDrawer(); break;
      case 'dr-del-no': app.ui.confirmDel = null; renderDrawer(); break;
      case 'dr-del-yes': (function (id) {
        delete app.crafts[id]; deleteRemote(id);
        if (id === app.curId) { var n = blankCraft(); app.crafts[n.id] = n; app.curId = n.id; renderAll(); }
        app.ui.confirmDel = null; saveLocal(); renderDrawer(); renderCraftsBadge();
      })(a.getAttribute('data-id')); break;
    }
  });
  document.addEventListener('change', function (e) {
    var c = cur();
    var t = e.target;
    if (t.id === 'd-base') { c.base = t.value; revalidate(c, c.base); touch(c); renderDesign(); return; }
    if (t.id === 'd-ilvl') {
      var v = Math.max(1, Math.min(100, parseInt(t.value, 10) || 82));
      c.ilvl = v; revalidate(c, 'item level ' + v); touch(c); renderDesign(); return;
    }
    if (t.id === 'd-rf') { c.runeforge = t.checked; if (c.planSt) c.stale = true; touch(c); return; }
    if (t.getAttribute('data-act') === 'd-tier') {
      var s = +t.getAttribute('data-s'), i = +t.getAttribute('data-i');
      c.targets[s][i] = { mi: +t.value };
      if (c.planSt) c.stale = true;
      touch(c); renderDesign();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (app.pk) { closePicker(); e.preventDefault(); return; }
    if (slotsOpen()) { closeSlots(); e.preventDefault(); return; }
    if (!$('drawer').hidden) { closeDrawer(); e.preventDefault(); }
  });
  function setLeague(lg) {
    app.league = lg === 'roa' ? 'roa' : 'fr';
    E.setLeague(app.league);
    document.querySelectorAll('[data-lg]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lg') === app.league)); });
    if (app.view === 'plan') renderPlanSteps();
    if (app.view === 'design') renderDesign();
    if (window.RefLedger) window.RefLedger.render();
    saveLocalSoon();
  }

  function renderAll() {
    if (app.view === 'design') renderDesign();
    if (app.view === 'plan') renderPlan();
    refreshBadges();
  }

  /* ---------- boot ---------- */
  loadLocal();
  if (!app.curId || !app.crafts[app.curId]) {
    var c0 = blankCraft('gloves');
    app.crafts[c0.id] = c0; app.curId = c0.id;
  }
  E.setLeague(app.league);
  document.querySelectorAll('[data-lg]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lg') === app.league)); });
  var h0 = (location.hash || '').replace('#', '');
  if (h0 === 'plan' || h0 === 'design' || h0 === 'ref' || h0 === 'reference') app.view = h0 === 'reference' ? 'ref' : h0;
  window.App = { get: function () { return app; }, league: function () { return app.league; }, toast: toast, go: go };
  initFind();
  go(app.view, { keepScroll: true });
  renderAll();
  initDb();
})();
