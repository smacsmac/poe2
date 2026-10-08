/* Crafting Playbook app: Design -> Forge (the plan, internally "plan") -> Reference. Vanilla JS over the planner engine. */
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
  var KIND = { base: 'Base', aug: 'Augment', regal: 'Regal', essence: 'Essence', slam: 'Exalt', sacrifice: 'Exalt', craft: 'Crafted mod', rune: 'Rune', desec: 'Desecration', remove: 'Fix', fixMagic: 'Fix', finish: 'Finish', stop: 'Stuck', done: 'Done' };
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
  /* A rough figure: two significant figures from 100 div up ("2,600 div"), else as fmt. */
  function est(v) {
    if (!isFinite(v)) return 'very high';
    if (v <= 1e-9) return 'nothing';
    if (v * PRICES.exPerDiv[app.league] < 0.95) return 'under 1 ex';
    if (v >= 100000) return 'over 100,000 div';
    if (v >= 100) { var p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return (Math.round(v / p) * p).toLocaleString('en-US') + ' div'; }
    return fmt(v);
  }
  /* An average: "~" in front of a number. */
  function avgTxt(v) { var t = est(v); return /^\d/.test(t) ? '~' + t : t; }
  function basesTxt(n) { return !isFinite(n) ? 'more than 200 magic bases' : n < 1.5 ? 'a magic base' : 'about ' + Math.round(n) + ' magic bases'; }
  /* "about 12 div" in running text; "nothing", "under 1 ex" and "very high" stand on their own. */
  function aboutTxt(v) { var t = est(v); return /^\d/.test(t) ? 'about ' + t : t; }
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
  /* Mod text as HTML, with the attribute and element words in the game's colours: Strength red, Dexterity green,
     Intelligence blue, Fire, Cold (an icier blue), Lightning yellow, Chaos dark red. Only the word, not the line.
     "Fire an additional Projectile" is a verb, so a Fire followed by "an" or a number stays plain. */
  var KW = { Strength: 'str', Dexterity: 'dex', Intelligence: 'int', Fire: 'fire', Cold: 'cold', Lightning: 'light', Chaos: 'chaos', Str: 'str', Dex: 'dex', Int: 'int' };
  function kwWords(h) {
    return h.replace(/\b(Strength|Dexterity|Intelligence|Fire|Cold|Lightning|Chaos)\b(?! an\b| \d)/g, function (w) { return '<span class="kw kw-' + KW[w] + '">' + w + '</span>'; });
  }
  function modHTML(text) { return kwWords(esc(text)); }
  function kwAttr(a) { return '<span class="kw kw-' + KW[a] + '">' + a + '</span>'; }
  function tierLab(cat, mi) {
    var l = E.labelTier(cat, { f: famOf(mi), mi: mi });
    return l.charAt(0) === 'T' ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }
  function famOf(mi) { return MODS[mi].f; }

  /* ---------- state ---------- */
  var app = { view: 'design', league: 'fr', curId: null, crafts: {}, pk: null, ui: { opt: null, optFor: null, doneAll: false, open: {}, confirmDel: null, confirmReset: false, costTok: 0, costTimer: null, shop: false, costMore: false } };

  function defaultBase(cls) {
    var name = DEFAULT_BASE[cls];
    var list = BASES[cls] || [];
    if (name && list.some(function (b) { return b.n === name; })) return name;
    return list.slice().sort(function (a, b) { return b.lv - a.lv; })[0].n;
  }
  function blankCraft(cls, base) {
    cls = cls || 'gloves';
    var c = { id: newId(), cls: cls, base: base || defaultBase(cls), ilvl: 82, runeforge: cls === 'gloves', astrid: false, targets: [[], []], st: null, planSt: null, hist: [], stale: false, su: 0, at: Date.now(), dev: DEV };
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
      cls: c.cls, base: c.base, ilvl: c.ilvl, runeforge: !!c.runeforge, astrid: !!c.astrid, league: app.league,
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
    renderSaved();
    if (!c.planSt || !targetCount(c)) { updateTabStep(null); return; }
    var steps = E.plan(designOf(c), c.planSt);
    var outs = doneCount(c);
    updateTabStep(steps[0].kind === 'done' ? '✓' : outs ? String(SETUP + outs + 1) : null);
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
    var meta = { hdrop: c.hdrop || 0, h0: c.h0 || null, hs: c.hs ? clone(c.hs) : null, c: c };
    var hist = trimHist(c.hist.map(function (h) { return Object.assign({}, h); }), 40, meta);
    return JSON.parse(JSON.stringify({
      v: 2, id: c.id, cls: c.cls, base: c.base, ilvl: c.ilvl, rf: !!c.runeforge, as: c.astrid ? 1 : undefined,
      t: c.targets.map(function (side) { return side.map(function (t) { return t ? { k: DATA.ids[t.mi] } : null; }); }),
      st: packSt(c.st), ps: packSt(c.planSt), sl: !!c.stale,
      h: hist.map(function (h) {
        return { t: h.t, o: h.o, e: h.e ? 1 : 0, st: packSt(h.st), ps: packSt(h.ps), sl: false, a: h.as === undefined ? undefined : (h.as ? 1 : 0), u: h.su,
          sp: Array.isArray(h.sp) ? h.sp : undefined, b: h.b ? 1 : undefined };
      }),
      su: c.su | 0,
      hd: meta.hdrop || undefined, h0: meta.hdrop ? packSt(meta.h0) : undefined, hs: meta.hs || undefined,
      at: c.at, dev: c.dev
    }));
  }
  function okCount(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
  function spendOk(sp) { return Array.isArray(sp) && sp.every(function (q) { return Array.isArray(q) && typeof q[0] === 'string' && okCount(q[1]); }); }
  function foldedOk(hs) {
    return !!hs && typeof hs === 'object' && !!hs.sp && typeof hs.sp === 'object' && okCount(hs.b) && okCount(hs.x) &&
      Object.keys(hs.sp).every(function (k) { return okCount(hs.sp[k]); });
  }
  function unpackCraft(o) {
    if (!o || !o.cls || !CLS[o.cls] || !BASES[o.cls]) return null;
    var base = (BASES[o.cls].some(function (b) { return b.n === o.base; })) ? o.base : defaultBase(o.cls);
    var c = {
      id: o.id, cls: o.cls, base: base, ilvl: Math.max(1, Math.min(100, o.ilvl || 82)), runeforge: !!o.rf, astrid: !!o.as,
      targets: [0, 1].map(function (s) { return ((o.t || [])[s] || []).map(function (t) { return t && IDX[t.k] !== undefined ? { mi: IDX[t.k] } : null; }); }),
      st: unpackSt(o.st), planSt: unpackSt(o.ps), stale: !!o.sl,
      hist: (o.h || []).map(function (h) {
        var x = { t: h.t, o: h.o, e: !!h.e, st: unpackSt(h.st), ps: unpackSt(h.ps), sl: false };
        if (h.a !== undefined) x.as = !!h.a;
        if (h.u !== undefined) x.su = h.u;
        if (spendOk(h.sp)) x.sp = h.sp;
        if (h.b) x.b = 1;
        return x;
      }),
      hdrop: o.hd || 0, h0: unpackSt(o.h0), hs: foldedOk(o.hs) ? o.hs : null,
      at: o.at || 0, dev: o.dev || ''
    };
    fitTargets(c);
    // The plan always follows the item now: an old save made before that may still hold a plan from an older item
    if (c.st) c.planSt = clone(c.st);
    c.stale = false;
    // Saves from before the setup steps: a craft already under way has its setup done
    c.su = o.su !== undefined ? o.su : underWay(c) ? 3 : 0;
    return c;
  }

  /* ---------- storage: your account (db) when available, this browser otherwise ---------- */
  var store = { mode: 'local', col: null, inflight: {}, dirty: {}, timers: {}, last: {}, remoteIds: null, readOnly: false };
  /* A craft counts as under way once its item is set up or a step is recorded. The blank item the Forge creates
     just by being opened doesn't count, so looking at the Forge doesn't change what the base search or saving do. */
  function blankItem(st) { return !st || (st.rarity === 'none' && !st.mods.length); }
  function underWay(c) { return !!c && (c.hist.length > 0 || (c.hdrop || 0) > 0 || !blankItem(c.st)); }
  function worth(c) { return !!c && (targetCount(c) > 0 || underWay(c)); }
  var saveOk = null, localDirty = false;
  function saveLocal() {
    clearTimeout(localTimer); localTimer = null; localDirty = false;
    try {
      var all = {};
      Object.keys(app.crafts).forEach(function (id) { if (worth(app.crafts[id]) || id === app.curId) all[id] = packCraft(app.crafts[id]); });
      localStorage.setItem(LS, JSON.stringify({ cur: app.curId, league: app.league, view: app.view, crafts: all }));
      saveOk = true;
    } catch (e) { saveOk = false; /* storage blocked: the page still works for this visit */ }
    renderSaved();
  }
  function loadLocal() {
    var txt;
    try { txt = localStorage.getItem(LS); } catch (e) { saveOk = false; return; }
    try {
      var raw = JSON.parse(txt || 'null');
      if (!raw || typeof raw !== 'object') return;
      if (raw.league === 'fr' || raw.league === 'roa') app.league = raw.league;
      if (raw.view === 'design' || raw.view === 'plan' || raw.view === 'ref') app.view = raw.view;
      Object.keys(raw.crafts || {}).forEach(function (id) { var c = unpackCraft(raw.crafts[id]); if (c) app.crafts[id] = c; });
      if (raw.cur && app.crafts[raw.cur]) app.curId = raw.cur;
    } catch (e) { /* ignore a bad cache */ }
  }
  function queueSave(id) {
    localDirty = true;
    saveLocalSoon();
    if (store.mode === 'db' && !store.readOnly) {
      clearTimeout(store.timers[id]);
      store.timers[id] = setTimeout(function () { pushRemote(id); }, 900);
    }
    renderSaved();
  }
  var localTimer = null;
  function saveLocalSoon() { clearTimeout(localTimer); localTimer = setTimeout(saveLocal, 250); }
  function pushRemote(id) {
    clearTimeout(store.timers[id]); store.timers[id] = null;
    var c = app.crafts[id];
    if (!c || !store.col || !worth(c)) { renderSaved(); return; }
    var body = packCraft(c), json = JSON.stringify(body);
    if (store.last[id] === json) { renderSaved(); return; }
    if (store.inflight[id]) { store.dirty[id] = true; return; }
    store.inflight[id] = true;
    renderSaved();
    store.col.doc(id).set(body).then(function () { store.last[id] = json; }).catch(function (e) {
      if (e && e.code === 'unavailable') { store.timers[id] = setTimeout(function () { pushRemote(id); }, 1500 + Math.random() * 1500); return; }
      store.readOnly = true; renderStore();
    }).then(function () {
      store.inflight[id] = false;
      if (store.dirty[id]) { store.dirty[id] = false; pushRemote(id); }
      renderSaved();
    });
  }
  /* The Saved button next to the + says whether the open craft is safe, and where. */
  function toAccount() { return store.mode === 'db' && !!store.col && !store.readOnly; }
  function canSave() { return toAccount() || saveOk !== false; }
  function savedState() {
    var id = app.curId;
    if (!canSave()) return 'fail';
    if (localDirty || store.timers[id] || store.inflight[id]) return 'saving';
    return toAccount() && worth(cur()) ? 'account' : 'local';
  }
  function savedText(state) {
    var c = cur();
    var where = toAccount() ? 'to your account' : 'in this browser';
    if (state === 'saving') return 'Saving your latest change…';
    if (state === 'fail') return 'Not saved: this browser blocks storage here (a private window can do that), so your crafts only last while this page is open.';
    if (!worth(c)) return 'Crafts save automatically ' + where + '. This one is empty so far.';
    if (state === 'account') return 'The ' + c.base + ' craft is saved to your account, so it follows you to other devices. Every change saves as you go. Find it again in My crafts.';
    return 'The ' + c.base + ' craft is saved in this browser. Every change saves as you go. Find it again in My crafts.';
  }
  var savedKey = '';
  function renderSaved() {
    var b = $('saved');
    if (!b || !cur()) return;
    var st = savedState(), text = savedText(st);
    if (savedKey === st + text) return;
    savedKey = st + text;
    b.setAttribute('data-state', st);
    b.title = text;
    b.innerHTML = ico(st === 'fail' ? 'u-x' : 'u-check') + '<span class="lbl"><span class="sv-ed">' + (st === 'fail' ? 'Not saved' : 'Saved') + '</span><span class="sv-ing">Saving</span></span>';
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
    if (view === 'plan') { app.ui.nowKey = null; renderPlan(); }
    if (view === 'design') renderDesign();
    if (!opts || !opts.keepScroll) {
      window.scrollTo(0, 0);
      var h1 = document.querySelector('#v-' + view + ' h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); try { h1.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
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
    hideToast();
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
    if (b.rq[0]) rq.push('<b>' + b.rq[0] + '</b> ' + kwAttr('Str'));
    if (b.rq[1]) rq.push('<b>' + b.rq[1] + '</b> ' + kwAttr('Dex'));
    if (b.rq[2]) rq.push('<b>' + b.rq[2] + '</b> ' + kwAttr('Int'));
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
    var sock = E.socketable(cat.base), cap = c.astrid && sock ? 2 : 1;
    var craftOnly = c.targets[0].concat(c.targets[1]).filter(function (x) {
      return x && E.methods(cat, { f: famOf(x.mi), mi: x.mi, lv: MODS[x.mi].l }).craftOnly;
    }).length;
    if (m.craftOnly && craftOnly > cap) {
      r.line = 'Only from ' + esc((m.alloy[0] || m.essLate[0] || m.essEarly[0]).name) +
        (cap > 1 ? ', and both crafted slots are already taken' : ', and the one crafted slot is already taken' + (sock ? '. Astrid’s Creativity below allows a second' : ''));
    } else if (m.desecOnly) r.line = 'Only from desecration, and the one desecrated slot is already taken';
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
    if (imp.length) h += '<p class="implicit"><small>Implicit · comes with the base</small>' + imp.map(modHTML).join('<br>') + '</p>';
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
          '<span class="box-text">' + modHTML(modText(t.mi)) + '</span><span class="box-route">' + r.line + '</span></button>' + sel +
          '<button type="button" class="box-x" data-act="d-clear" data-s="' + s + '" data-i="' + i + '" aria-label="Remove ' + esc(E.famName(famOf(t.mi))) + '">' + ico('u-x') + '</button></li>';
      });
      h += '</ol>';
    });
    h += '<p class="tier-hint">T1 is the top tier. A box set to <b>T2+</b> takes T2 or T1, and lower tiers are cheaper to hit.</p>';
    if (b.rf || b.rfw) {
      h += '<label class="rf-toggle"><input type="checkbox" id="d-rf"' + (c.runeforge ? ' checked' : '') + '><span>Runeforge it at the end' +
        '<small>' + (b.rf ? 'Adds Runic Ward' + (b.rf.Ward ? ' (' + b.rf.Ward + ' base)' : '') + ' at the Verisium Anvil and trades some base defences for it. Needed for increased Runic Ward to do much.' : 'Changes the weapon’s base damage at the Verisium Anvil.') + '</small></span></label>';
    }
    if (E.socketable(b)) {
      h += '<label class="rf-toggle"><input type="checkbox" id="d-astrid"' + (c.astrid ? ' checked' : '') + '><span>Use Astrid’s Creativity' +
        '<small>A rune that lets the item hold a second crafted modifier, like two alloys or an essence and an alloy. The plan sockets it, with an Artificer’s Orb if there’s no free socket, right before the second one goes on. About ' +
        esc(fmt(E.price('Astrid\'s Creativity', app.league))) + '.</small></span></label>';
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
      var warns = [], crafted = [], desec = null;
      all.forEach(function (t) {
        var r = routeFor(c, cat, rmap, t);
        var name = E.famName(famOf(t.mi));
        var odds = r.odds === 'certain' ? 'certain' : r.odds === 'pick' ? 'your pick' : r.odds === 'base' ? 'on base' : r.odds;
        if (r.kind === 'craft' || r.kind === 'essence') crafted.push(name);
        if (r.kind === 'desec') desec = name;
        h += '<li><span class="r-n">' + modHTML(name) + '</span><span class="r-o">' + esc(odds || '—') + '</span><span class="r-h">' + r.line + '</span></li>';
        if (r.warn) warns.push(esc(name) + ': ' + r.line.replace(/<[^>]+>/g, ''));
      });
      h += '</ul>';
      var cap = c.astrid && E.socketable(cat.base) ? 2 : 1;
      var craftTxt = crafted.length ? crafted.map(modHTML).join('<br>') + (cap > crafted.length ? '<small>1 free</small>' : '') : (cap > 1 ? 'Both free' : 'Free');
      h += '<div class="slots2"><div class="slot2' + (crafted.length ? '' : ' free') + '"><span>Crafted slot' + (cap > 1 ? 's' : '') + '</span><b>' + craftTxt + '</b></div>' +
        '<div class="slot2' + (desec ? '' : ' free') + '"><span>Desecration</span><b>' + (desec ? modHTML(desec) : 'Free') + '</b></div></div>';
      if (warns.length) h += '<div class="warns">' + warns.map(function (w) { return '<p class="warnline">' + w + '</p>'; }).join('') + '</div>';
    }
    var started = c.hist.length > 0 || !!(c.st && c.st.mods.length);
    h += '<button type="button" class="btn primary cta" data-act="to-plan"' + (all.length ? '' : ' disabled') + '>' + ico('u-hammer') + (started ? 'Back to the forge' : 'Craft it') + ico('u-arrow') + '</button>';
    h += copyBtn('copy-chat');
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
    if (targetCount(c) || underWay(c)) startCraftFor(cls, base);
    else { c.cls = cls; c.base = base || defaultBase(cls); c.runeforge = cls === 'gloves'; c.astrid = false; c.targets = [[], []]; fitTargets(c); touch(c); }
    renderDesign(); refreshBadges();
  }
  /* A base picked from the search. Another slot works like clicking that slot. The same slot changes this design's
     base, unless the item is already under way, which starts a new craft so the one in progress stays as it is. */
  function useBase(name) {
    var c = cur(), b = E.BASE[name];
    if (!b || name === c.base) return;
    if (b.c !== c.cls) changeClass(b.c, name);
    else if (underWay(c)) { startCraftFor(b.c, name); renderDesign(); refreshBadges(); }
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
    replan(c);
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
    var h = '<article class="item" id="p-card" tabindex="-1" aria-label="Your item">';
    h += '<div class="item-head slim"><svg aria-hidden="true"><use href="#i-' + c.cls + '"/></svg>' +
      '<p class="nm' + nameCls + '">' + esc(c.base) + '</p><p class="sb">Item level ' + c.ilvl + ' · <a href="#design" data-go="design" style="color:inherit">edit design</a></p></div>';
    h += '<div class="item-body">';
    var canUndo = c.hist.length > 0;
    h += '<div class="rarity"><span class="vh">Rarity</span><div class="seg" role="group" aria-label="Rarity">' +
      ['none', 'magic', 'rare'].map(function (v) { return '<button type="button" data-act="rarity" data-v="' + v + '" aria-pressed="' + (rar === v) + '">' + RAR[v] + '</button>'; }).join('') +
      '</div><button type="button" class="tbtn sm" data-act="suggest"' + (rar === 'none' ? ' aria-disabled="true"' : '') + '>Suggest</button>' +
      '<button type="button" class="tbtn sm" data-act="start-copy">Copy targets in</button>' +
      '<button type="button" class="tbtn sm" data-act="start-blank">Clear item</button>' +
      '<button type="button" class="tbtn sm tb-undo" data-act="undo"' + (canUndo ? ' title="Undo: ' + esc(undoLabel(c)) + '"' : ' aria-disabled="true" title="Nothing to undo yet"') + '>' + ico('u-undo') + 'Undo</button></div>';
    h += '<div class="cols-h" aria-hidden="true"><span>Want</span><span>Have</span></div>';
    [0, 1].forEach(function (s) {
      if (!cat.caps[s]) return;
      h += '<section class="sbox ' + (s ? 'suf' : 'pre') + '" aria-label="' + (s ? 'Suffixes' : 'Prefixes') + '"><p class="grp">' + (s ? 'Suffixes' : 'Prefixes') + '</p><div class="srows">';
      rowsFor(c, s, cat).forEach(function (r) {
        var w;
        if (r.t) {
          var f = famOf(r.t.mi);
          var sk = !!skip[f];
          var tl = tierLab(cat, r.t.mi);
          w = '<div class="want' + (sk ? ' skipped' : '') + '"><span class="wn">' + modHTML(E.famName(f)) + '</span><span class="wt">' + esc(tl) + (tl.charAt(0) === 'T' ? ' or better' : '') + (sk ? ' · skipped' : '') + '</span>' +
            (sk ? '<button type="button" class="unskip" data-act="unskip" data-f="' + f + '">Want it again</button>' : '') + '</div>';
        } else w = '<div class="want none"><span class="wt">Any</span></div>';
        var hv;
        if (!r.m) {
          hv = '<div class="have empty"><button type="button" class="h-main" data-act="have-add" data-s="' + s + '"' + (r.t ? ' data-f="' + famOf(r.t.mi) + '"' : '') + (rar === 'none' ? ' aria-disabled="true"' : '') + '><span class="h-text">' + (rar === 'none' ? 'Empty' : '+ Add what’s here') + '</span></button></div>';
        } else {
          var m = r.m, info = statusInfo(m, r.t);
          var flags = [];
          if (m.crafted) flags.push('Crafted');
          if (m.desec) flags.push('Desecrated');
          if (m.fract) flags.push('Fractured');
          var showKd = !m.pseudo && (m.status === 'junk' || m.status === 'keep' || m.status === 'low' || m.accepted);
          var keepOn = m.mark === 'keep';
          hv = '<div class="have ' + info.cls + '"><button type="button" class="h-main" data-act="have-edit" data-id="' + esc(m.id) + '">' +
            '<span class="h-text">' + (m.pseudo ? (m.pseudo === 'junk' ? 'A ' + SIDE[s] + ' you don’t want' : 'Any ' + SIDE[s] + ' (junk to sacrifice)') : modHTML(modText(m.mi))) + '</span>' +
            '<span class="h-st"><span>' + esc(info.text) + '</span>' + flags.map(function (f) { return '<span class="fl">' + f + '</span>'; }).join('') + '</span></button>' +
            '<div class="h-tools">' + (showKd ? '<div class="kd" role="group" aria-label="Keep or ditch"><button type="button" data-act="mark" data-id="' + esc(m.id) + '" data-v="keep" aria-pressed="' + keepOn + '">Keep</button><button type="button" data-act="mark" data-id="' + esc(m.id) + '" data-v="junk" aria-pressed="' + (!keepOn) + '">Ditch</button></div>' : '') +
            '<button type="button" class="h-x" data-act="have-del" data-id="' + esc(m.id) + '" aria-label="Remove ' + esc(modName(m)) + ': not on my item">' + ico('u-x') + '</button></div></div>';
        }
        h += '<div class="srow">' + w + hv + '</div>';
      });
      h += '</div></section>';
    });
    h += '<p class="live-hint">The steps update as soon as you change your item.</p>';
    h += '</div></article>';
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
  function renderNow(c, step, n, K) {
    var chs = K && K.choices;
    var opt = curOption(c, step);
    var mats = opt ? opt.mats : step.mats;
    var outs = opt ? opt.outcomes : step.outcomes;
    var odds = opt ? (opt.mats.length ? { p: opt.swap ? opt.pAdd : opt.p, what: opt.swap ? 'to reroll it into a target' : 'to remove junk' } : null) : step.odds;
    var h = '<div class="card">';
    h += '<div class="card-k"><span class="eyebrow">Now · step ' + n + ' · ' + esc(KIND[step.kind] || step.kind) + '</span></div>';
    h += '<h3 tabindex="-1">' + esc(step.title) + '</h3>';
    h += '<p class="how">' + esc(dash(step.how)) + '</p>';
    if (step.spec) h += '<dl class="spec">' + step.spec.map(function (r) { return '<dt>' + esc(r.k) + '</dt><dd>' + esc(r.v) + '</dd>'; }).join('') + '</dl>';
    (step.warn || []).forEach(function (w) { h += '<p class="warn2">' + esc(w) + '</p>'; });
    if (step.options) {
      if (chs) h += choicesSpent(K);
      h += '<p class="q">Choose how</p><div class="opts" role="radiogroup" aria-label="Ways to make room">';
      step.options.forEach(function (o, i) {
        var on = o === opt, ch = chs ? chs[i] : null;
        var cell = ch ? choiceCell(ch, K.cc ? K.cc[i] : null) : esc(o.mats.length ? fmt(o.cost) + ' a try' : 'free');
        h += '<button type="button" class="opt" role="radio" aria-checked="' + on + '" data-act="opt" data-k="' + o.key + '"><span class="dot"></span>' +
          '<span class="ol">' + esc(o.label) + (o.key === step.recommended ? '<span class="rec">Suggested</span>' : '') + '</span><span class="oc"' + (ch ? ' data-ck="' + ch.key + '"' : '') + '>' + cell + '</span>' +
          '<span class="ot">' + esc(o.text) + '</span></button>';
      });
      h += '</div>';
      if (chs) h += choicesFoot(K, step);
    }
    if (odds) {
      h += '<div class="odds"><span class="big">' + esc(E.oddsLabel(odds.p)) + '</span><span class="what">' + esc(odds.what) + '</span>' +
        (odds.alt ? '<span class="alt">With a ' + esc(odds.alt.label) + ': ' + esc(E.oddsLabel(odds.alt.p)) + ', at a much higher price per try.</span>' : '') + '</div>';
    }
    // A base that missed, or a stop or rune offer: what each way on still costs
    if (chs && !step.options) {
      h += choicesSpent(K) + '<p class="q">What each choice still costs</p><ul class="cmp">' + chs.map(function (ch, i) {
        return '<li><span class="cl">' + esc(ch.label) + '</span><span class="oc" data-ck="' + ch.key + '">' + choiceCell(ch, K.cc ? K.cc[i] : null) + '</span></li>';
      }).join('') + '</ul>' + choicesFoot(K, step);
    }
    if (mats && mats.length) h += '<div><p class="q" style="margin-bottom:.35rem">Use</p><ul class="mats">' + mats.map(matLine).join('') + '</ul>' + perTry(mats) + '</div>';
    if (step.note) h += '<p class="note"' + (step.options ? ' id="p-note"' + (chs && cheaperThanSuggested(K.cc, recOf(step)) ? ' hidden' : '') : '') + '>' + esc(dash(step.note)) + '</p>';
    if (step.kind === 'done') {
      h += '<div class="outs"><button type="button" class="out first" data-act="new-craft">' + ico('u-plus') + ' Start another craft</button><button type="button" class="out" data-act="go-design">Back to the design</button></div>';
    } else if (outs && outs.length) {
      h += '<p class="q">' + (step.kind === 'finish' ? 'When you’re done' : 'What happened?') + '</p><div class="outs">';
      var seen = {};
      outs.forEach(function (o, i) {
        if (seen[o.label]) return;
        seen[o.label] = true;
        var cls = 'out' + (i === 0 && !o.pick && !o.bad ? ' first' : '') + (o.pick || o.edit ? ' other' : '') + (o.bad ? ' bad' : '');
        h += '<button type="button" class="' + cls + '" data-act="out" data-i="' + i + '">' + esc(o.label) + (o.pick ? '…' : '') + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }
  /* The Forge's steps start with two setup steps: what the item is, then what's on it. The plan follows from step 3,
     and it updates live as the item changes. */
  var SETUP = 2;
  var RAR = { none: 'Normal', magic: 'Magic', rare: 'Rare' };
  /* A rarity word in the game's colour: magic blue, rare yellow (normal stays plain). */
  function rarHTML(v) { return v === 'none' ? RAR[v] : '<span class="rar-' + v + '">' + RAR[v] + '</span>'; }
  var RAR_SUB = { none: 'Nothing yet, or a plain base', magic: 'One prefix and one suffix', rare: 'A craft in progress' };
  function firstOutcome(c) { for (var i = 0; i < c.hist.length; i++) if (!c.hist[i].e) return i; return -1; }
  /* What the item was when the first step was recorded (the end of the setup), or the item now before that. */
  function startState(c) {
    if (c.hdrop) return c.h0 || blankSt();
    var i = firstOutcome(c);
    return (i < 0 ? c.st : c.hist[i].st) || blankSt();
  }
  function modName(m) { return m.pseudo ? (m.pseudo === 'junk' ? 'a junk ' + SIDE[m.s] : 'any ' + SIDE[m.s]) : E.famName(famOf(m.mi)); }
  function modsLine(st) { return st && st.mods.length ? listAnd(st.mods.map(modName)) : 'no mods'; }
  /* The mods with their tiers ("Maximum Life T1+"), for what to look for when buying. */
  function modsTiers(st, cat) {
    if (!st || !st.mods.length) return 'no mods';
    return listAnd(st.mods.map(function (m) {
      if (m.pseudo) return modName(m);
      var tl = tierLab(cat, m.mi);
      return E.famName(famOf(m.mi)) + (tl.charAt(0) === 'T' ? ' ' + tl + (m.est ? '+' : '') : '');
    }));
  }
  function startText(c, st) {
    if (st.rarity === 'none') return 'Started from scratch, with no base yet';
    return 'Started from a ' + st.rarity + ' ' + c.base + (st.mods.length ? ' with ' + modsLine(st) : ' with no mods entered');
  }
  /* Done steps, oldest first: each recorded outcome numbered after the setup steps, and each run of hand edits as one
     line. Edits made before the first outcome are the setup itself, so they don't show here. */
  function histRows(c) {
    var rows = [], k = c.hdrop || 0, i0 = k ? 0 : firstOutcome(c);
    if (k) rows.push({ gap: k });
    if (i0 < 0) return rows;
    c.hist.slice(i0).forEach(function (x) {
      if (x.e) {
        var last = rows[rows.length - 1];
        if (last && last.e) { if (x.o) last.labels.push(x.o); return; }
        rows.push({ e: true, labels: x.o ? [x.o] : [] });
        return;
      }
      k += 1;
      rows.push({ n: SETUP + k, t: x.t, o: x.o });
    });
    return rows;
  }
  function doneCount(c) { return (c.hdrop || 0) + c.hist.filter(function (x) { return !x.e; }).length; }
  function editLabels(labels) {
    if (!labels.length) return '';
    var shown = labels.slice(-3);
    return (labels.length > 3 ? '… ' : '') + shown.join(', ');
  }
  /* After Suggest on a magic item: the item level to look for, from the plan's own base step. */
  function buyHint(c) {
    if (c.st.rarity !== 'magic' || !c.st.mods.length) return '';
    var b = E.nextStep(designOf(c), blankSt(c.st.skip));
    var lv = b.kind === 'base' && b.spec ? b.spec.filter(function (r) { return r.k === 'Item level'; })[0] : null;
    return lv ? ' Buying one? Look for item level ' + esc(lv.v) + '.' : '';
  }
  /* Which setup step is current: 1 until "What kind of item would you like to start with?" is answered, 2 until the
     item is filled in (Suggest or Done; a Normal item has nothing to fill), else 0 and the plan's step is current. */
  function setupStage(c) {
    if (doneCount(c)) return 0;
    var su = c.su | 0;
    if (!(su & 1)) return 1;
    if (c.st.rarity !== 'none' && !(su & 2)) return 2;
    return 0;
  }
  function setupLi(num, title, body, state) {
    var vt = '<span class="vh">Step ' + num + ': </span>' + title;
    if (state === 'now') {
      return '<li class="st now setup-now"><div class="st-n" aria-hidden="true"><span>' + num + '</span></div><div class="st-b"><div class="card setup-card">' +
        '<div class="card-k"><span class="eyebrow">Now · step ' + num + ' · Setup</span></div><h3 tabindex="-1">' + vt + '</h3>' + body + '</div></div></li>';
    }
    return '<li class="st setup ' + state + '"><div class="st-n" aria-hidden="true"><span>' + num + '</span></div><div class="st-b"><h4>' + vt + '</h4>' + body + '</div></li>';
  }
  function setupSteps(c, stage) {
    var h = '';
    if (doneCount(c)) {
      var s0 = startState(c);
      h += '<li class="st done setup-done"><div class="st-n" aria-hidden="true"><span>1</span></div><div class="st-b"><b><span class="vh">Step 1: </span>Started with</b><span>' + (s0.rarity === 'none' ? 'Nothing yet' : rarHTML(s0.rarity) + ' ' + esc(c.base)) + '</span></div></li>';
      h += '<li class="st done setup-done"><div class="st-n" aria-hidden="true"><span>2</span></div><div class="st-b"><b><span class="vh">Step 2: </span>What was on it</b><span>' + esc(s0.rarity === 'none' ? 'Nothing yet: step 3 got the base' : modsLine(s0)) + '</span></div></li>';
      return h;
    }
    var rar = c.st.rarity;
    var b1 = '<p class="sm">Pick the item you have, or the one you’ll buy (step 2 can suggest it). The steps below follow your choice.</p>' +
      '<div class="pick3" role="group" aria-label="Item to start with">' + ['none', 'magic', 'rare'].map(function (v) {
        return '<button type="button" data-act="rarity" data-v="' + v + '" aria-pressed="' + (!!(c.su & 1) && rar === v) + '"><b>' + rarHTML(v) + '</b><small>' + RAR_SUB[v] + '</small></button>';
      }).join('') + '</div>';
    h += setupLi(1, 'What kind of item would you like to start with?', b1, stage === 1 ? 'now' : 'ok');
    var b2, s2;
    if (stage === 1) {
      b2 = '<p class="sm">Once you’ve answered step 1: fill in what’s on your item, or let Suggest do it.</p>';
      s2 = 'todo';
    } else if (rar === 'none') {
      b2 = '<p class="sm">Nothing to fill in. Step 3 starts by getting a magic base. Already have one? Choose Magic or Rare above.</p>';
      s2 = 'ok';
    } else {
      b2 = '<p class="sm">' + (rar === 'magic' ? '<b>Suggest</b> fills in the magic base worth buying: your hardest targets.' : '<b>Suggest</b> fills in the item as the plan has it right after it turns rare.') +
        ' Or <b>Copy targets in</b>, then press ✕ on your item for any it doesn’t have. You can also add mods one at a time on your item.' +
        (stage === 2 ? ' Press <b>Done</b> when it matches your item.' : '') + '</p>' +
        '<div class="setup-row"><button type="button" class="btn small" data-act="suggest">Suggest</button><button type="button" class="btn small" data-act="start-copy">Copy targets in</button>' +
        (stage === 2 ? '<button type="button" class="btn small primary" data-act="setup-done">' + ico('u-check') + 'Done</button>' : '') +
        '<button type="button" class="btn small quiet to-item" data-act="to-item">Your item' + ico('u-chev') + '</button></div>' +
        '<p class="now-on">On it now: ' + esc(modsTiers(c.st, catOf(c))) + '.' + buyHint(c) + '</p>';
      s2 = stage === 2 ? 'now' : 'ok';
    }
    h += setupLi(2, 'What’s on it?', b2, s2);
    return h;
  }
  /* ---------- cost: the Forge's cost block, what each choice still costs, spent so far, the shopping list ----------
     "If every roll lands" prices the steps once; "on average" follows the steps after every miss (E.costPlan). Both
     are rough: every tier counts as equally likely, and magic bases are counted, never priced. The average can take a
     few frames on a new design, so the page renders at once and the figures are patched in when ready. */
  var LG_NAME = { fr: 'Forbidden Rites', roa: 'Runes of Aldur' };
  var deriveCache = new WeakMap();
  /* An entry saved before spend was recorded: priced from its step's title, cached per entry and design. */
  function derivedSpend(c, h) {
    var d = designOf(c), sig = JSON.stringify(d);
    var hit = deriveCache.get(h);
    if (hit && hit.sig === sig) return hit.v;
    var v = E.deriveSpend(d, h);
    deriveCache.set(h, { sig: sig, v: v });
    return v;
  }
  /* What the recorded steps used, priced at the league shown: { div, bases, known, unpriced, started, steps }. */
  function spentSoFar(c) {
    var list = [], unpriced = 0;
    if (c.hs) { list.push({ sp: Object.keys(c.hs.sp).map(function (k) { return [k, c.hs.sp[k]]; }), b: c.hs.b }); unpriced += c.hs.x || 0; }
    else if (c.hdrop) unpriced += c.hdrop;   // a save trimmed before spend was kept
    c.hist.forEach(function (h) {
      if (h.e) return;
      if (Array.isArray(h.sp)) { list.push(h); return; }
      var d = derivedSpend(c, h);
      if (d) list.push(d); else unpriced += 1;
    });
    var r = E.spentOn(list, app.league);
    return { div: r.div, bases: r.bases, known: r.known, unpriced: unpriced, started: startState(c).rarity !== 'none', steps: doneCount(c) };
  }
  function spentCore(sp) {
    var b = sp.bases ? (sp.bases === 1 ? '1 magic base' : sp.bases + ' magic bases') : '';
    var d = sp.div > 0 ? 'about ' + fmt(sp.div) : '';
    return d && b ? d + ' and ' + b : d || b || 'nothing yet';
  }
  function spentLine(sp) { return 'Spent so far: ' + spentCore(sp) + spentTail(sp); }
  function inTenEnd(p, first) {
    var n = Math.round(p * 10);
    if (first) return n >= 10 ? 'nearly every craft ends' : 'about ' + Math.max(1, n) + ' in 10 crafts end';
    return n >= 10 ? 'nearly every one' : Math.max(1, n) + ' in 10';
  }
  function missText(m) {
    if (!m) return '';
    if (m.type === 'fix') return 'each one is fixed with ' + m.label + ' (' + fmt(m.each) + ' a try).';
    if (m.type === 'restart') return 'each one means a new magic base.';
    if (m.type === 'skip') return 'a miss there means skipping ' + m.what + '.';
    return 'they make later steps dearer.';
  }
  /* The step whose misses add the most on the way to the end, and what a miss there leads to. */
  function riskText(risk, n0) {
    return 'The dearest misses are at step ' + (n0 + risk.i) + ', ' + risk.title + ' (' + E.oddsLabel(risk.p) + '): they add ' + aboutTxt(risk.extra) + ' on average, and ' + missText(risk.miss);
  }
  /* The average is worth a line of its own when misses make it dearer than every roll landing. */
  function avgShown(happy, cp) {
    return !!cp && !cp.capped && !!cp.avg && happy.stopsAt !== 0 && (happy.restart || cp.avg.div > Math.max(1.1 * happy.div, happy.div + 0.5));
  }
  function cappedText(cp) {
    return cp.loop ? 'after some misses the steps can’t finish this item' : 'it would take more than 200 magic bases';
  }
  function spentTail(sp, me) {
    return (sp.started ? ', plus the item ' + (me ? 'I' : 'you') + ' started with' : '') + (sp.unpriced ? ', not counting ' + plural(sp.unpriced, 'earlier step') : '') + (sp.known ? '' : ' (some prices unknown)');
  }
  /* The cost block's lines. K: { happy, cp, n0, done, spent, st }. */
  function costBody(K) {
    var h = '', happy = K.happy, cp = K.cp, sp = K.spent;
    if (K.done) {
      var cost = sp.div > 0 || sp.bases ? spentCore(sp) : 'nothing we could price';
      return '<p class="cost-line">' + (sp.steps ? 'This craft cost <b>' + esc(cost) + '</b>' + esc(spentTail(sp)) + '.' : 'No steps recorded here, so nothing to add up.') + '</p>';
    }
    if (happy.stopsAt === 0) {
      // this step is the call: the choices on it carry the figures
      h += '<p class="cost-line">This step is your call: each choice below says what it still costs to finish.</p>';
      if (sp.steps) h += '<p class="cost-spent">' + esc(spentLine(sp)) + '.</p>';
      return h;
    }
    if (!happy.restart) {
      h += '<p class="cost-line"><b>' + esc(happy.div > 1e-9 ? est(happy.div) : 'Nothing to buy') + '</b> if every roll lands' + (happy.base ? ', plus the magic base' : '') +
        (happy.stopsAt !== null ? ', up to step ' + (K.n0 + happy.stopsAt) + ', where the plan needs your call' : '') + (happy.known ? '' : ' (some prices unknown)') + '</p>';
    }
    var more = false;
    if (!cp) h += '<p class="cost-line cost-avg">Working out the average with misses…</p>';
    else if (cp.capped) { h += '<p class="cost-line cost-avg"><b>Very high</b> on average: ' + cappedText(cp) + '</p>'; more = true; }
    else if (happy.restart) {
      h += '<p class="cost-line cost-avg"><b>' + esc(avgTxt(cp.avg.div)) + '</b> on average from a new base, following the steps, plus ' + basesTxt(cp.avg.bases) + (cp.avg.unknown ? ' (some prices unknown)' : '') + '</p>';
      more = true;
    } else if (avgShown(happy, cp)) {
      var stop = Math.round(cp.avg.stop * 10);
      h += '<p class="cost-line cost-avg"><b>' + esc(avgTxt(cp.avg.div)) + '</b> on average, following the steps' + (cp.avg.bases >= 1.5 ? ', and about ' + Math.round(cp.avg.bases) + ' magic bases' : '') +
        (happy.stopsAt !== null ? ', up to there' : cp.avg.stop >= 0.05 ? '; ' + (stop >= 10 ? 'nearly every craft stops early and needs your call' : 'about ' + Math.max(1, stop) + ' in 10 crafts stop early and need your call') : '') +
        (cp.avg.unknown ? ' (some prices unknown)' : '') + '</p>';
      more = true;
    }
    if (cp && cp.avg) {
      var sk = cp.avg.skipped.filter(function (x) { return x.p >= 0.2 && !(K.st.skip && K.st.skip[x.f]); }).slice(0, 2);
      if (sk.length) {
        h += '<p class="cost-skip">Following the steps, ' + inTenEnd(sk[0].p, true) + ' without ' + modHTML(sk[0].name) +
          (sk[1] ? ', and ' + inTenEnd(sk[1].p, false) + ' without ' + modHTML(sk[1].name) : '') + ': when every fix is dear, the steps skip a target instead.</p>';
      }
    }
    if (sp.steps) h += '<p class="cost-spent">' + esc(spentLine(sp)) + '.</p>';
    if (more) {
      h += '<details class="cost-more"' + (app.ui.costMore ? ' open' : '') + '><summary>What drives the average</summary>' +
        (cp.risk ? '<p>' + esc(riskText(cp.risk, K.n0)) + '</p>' : '') +
        '<p>Every tier counts as equally likely, and the average assumes you follow the steps after a miss. Magic bases are bought on trade and aren’t priced.' +
        (cp.cut ? ' This item has so many possible outcomes that the average is rougher than usual.' : '') + '</p></details>';
    }
    return h;
  }
  /* One choice's figures: what it still costs to finish, and its price now. x is its E.choiceCosts entry, or null while
     the average is worked out. */
  function choiceCell(ch, x) {
    var fin, sub;
    if (!x) {
      fin = '… to finish';
      sub = ch.kind === 'restart' ? '+ a magic base' : ch.kind === 'skip' ? 'free' : ch.kind === 'astrid' ? 'the rune: ' + fmt(E.price('Astrid\'s Creativity', app.league))
        : fmt(E.matsCost(ch.op.mats.filter(function (m) { return !m.opt; }), app.league).sum) + ' a try';
    } else if (!isFinite(x.finish)) { fin = '<b>Very high</b>'; sub = '200+ magic bases'; }
    else {
      fin = '<b>' + esc(avgTxt(x.finish)) + '</b> ' + (x.stop >= 0.5 ? 'until it stops again' : 'to finish');
      sub = x.kind === 'restart' ? '+ ' + basesTxt(x.bases) : x.kind === 'astrid' ? 'the rune: ' + fmt(x.now)
        : x.now > 0 ? fmt(x.now) + ' a try' + (x.known ? '' : ' (some prices unknown)') : 'free';
    }
    return '<span class="ofin">' + fin + '</span><span class="otry">' + esc(sub) + '</span>';
  }
  /* At most one line under the choices: a cheaper way to keep every target than the suggested one, or what keeping
     the target costs over skipping it. */
  function cheaperThanSuggested(cc, rec) {
    if (!cc) return null;
    var keep = cc.filter(function (x) { return x.keeps && isFinite(x.finish) && x.stop < 0.5; }).sort(function (a, b) { return a.finish - b.finish; });
    var sug = rec ? cc.find(function (x) { return x.key === rec; }) : null;
    return sug && sug.keeps && keep[0] && keep[0] !== sug && keep[0].finish < 0.95 * sug.finish ? { best: keep[0], sug: sug } : null;
  }
  function costHint(cc, rec) {
    if (!cc) return '';
    var keep = cc.filter(function (x) { return x.keeps && isFinite(x.finish) && x.stop < 0.5; }).sort(function (a, b) { return a.finish - b.finish; });
    var ch = cheaperThanSuggested(cc, rec);
    if (ch) {
      return esc(ch.best.label) + ' averages less from here: ' + esc(avgTxt(ch.best.finish)) + ' to finish, against ' + esc(avgTxt(ch.sug.finish)) + ' for the suggested choice.';
    }
    var skip = cc.find(function (x) { return x.kind === 'skip'; });
    if (skip && keep[0] && keep[0].finish - skip.finish >= Math.max(5, skip.finish)) {
      return 'Keeping ' + modHTML(skip.label.replace(/^Skip /, '')) + ' costs about ' + esc(est(keep[0].finish - skip.finish)) + ' more than skipping it, on average.';
    }
    return '';
  }
  function recOf(step) { return step.kind === 'fixMagic' ? 'restart' : step.recommended || null; }
  /* The cost figures for the open craft, from the plan already drawn: cheap parts now, the average if it's ready. */
  function costState(c, design, steps, stage) {
    var now = steps[0];
    var K = { design: design, steps: steps, st: c.planSt, n0: SETUP + doneCount(c) + 1, done: now.kind === 'done', spent: spentSoFar(c), happy: E.planCost(design, steps), cp: null, cc: null, choices: null };
    if (K.done) return K;
    K.cp = E.costPlan(design, c.planSt, { steps: steps, quick: true });
    K.choices = !stage ? E.choicesOf(now) : null;
    if (K.choices) K.cc = E.choiceCosts(design, c.planSt, now, { quick: true });
    return K;
  }
  function costReady(K) { return K.done || (!!K.cp && (!K.choices || !!K.cc)); }
  /* Work the average out a slice at a time (the page stays responsive), then patch the figures in. */
  function scheduleCost(c, K) {
    var tok = app.ui.costTok, st = clone(K.st);
    function run() {
      if (tok !== app.ui.costTok || cur() !== c || app.view !== 'plan') return;
      if (!K.cp) K.cp = E.costPlan(K.design, st, { steps: K.steps, budget: 12 });
      if (K.cp && K.choices && !K.cc) K.cc = E.choiceCosts(K.design, st, K.steps[0], { budget: 12 });
      if (!costReady(K)) { app.ui.costTimer = setTimeout(run, 0); return; }
      patchCost(K);
    }
    app.ui.costTimer = setTimeout(run, 0);
  }
  /* Text only: never replaces a button, so focus, scroll and a click in progress are safe. */
  function patchCost(K) {
    var body = $('p-cost-body');
    if (body) { if (!K.drawnCp) body.innerHTML = costBody(K); body.setAttribute('aria-busy', 'false'); }
    if (K.choices && K.cc) {
      K.choices.forEach(function (ch, i) {
        var el = document.querySelector('#p-steps .oc[data-ck="' + ch.key + '"]');
        if (el) el.innerHTML = choiceCell(ch, K.cc[i]);
      });
      var hint = $('p-hint');
      if (hint) { var t = costHint(K.cc, recOf(K.steps[0])); hint.innerHTML = t; hint.hidden = !t; }
      var note = $('p-note');
      if (note && cheaperThanSuggested(K.cc, recOf(K.steps[0]))) note.hidden = true;
    }
    var sa = $('shop-avg');
    if (sa) sa.innerHTML = shopTotal(shopData(K));
  }
  function costSection(K) {
    var h = '<section class="cost" id="p-cost" aria-labelledby="p-cost-h"><div class="cost-head"><h3 id="p-cost-h" class="eyebrow">' + (K.done ? 'Cost' : 'Cost · rough') + '</h3>' +
      (K.done ? '' : '<button type="button" class="btn small quiet" data-act="shop" aria-expanded="' + !!app.ui.shop + '" aria-controls="shop">' + ico('u-list') + 'Shopping list</button>') + '</div>' +
      '<div class="cost-body" id="p-cost-body" aria-busy="' + !costReady(K) + '">' + costBody(K) + '</div>';
    K.drawnCp = !!K.cp || K.done;   // patchCost leaves a body that already has its average alone
    if (app.ui.shop && !K.done) h += shopPanel(shopData(K));
    return h + '</section>';
  }
  /* The spent line and, on a step with choices, what each one still costs. */
  function choicesSpent(K) {
    var sp = K.spent;
    return '<p class="spent">' + (sp.steps ? esc(spentLine(sp)) + '. That’s gone whichever you choose, so compare what each choice still costs.' : 'Compare what each choice still costs to finish.') + '</p>';
  }
  function choicesFoot(K, step) {
    var t = costHint(K.cc, recOf(step));
    return '<p class="cmp-note" id="p-hint"' + (t ? '' : ' hidden') + '>' + t + '</p>' +
      '<p class="fine">To finish: what’s left to spend from here on average, following the steps after this choice.</p>';
  }

  /* ---------- the shopping list ---------- */
  function shopData(K) {
    var restart = K.happy.restart;
    var st0 = restart ? blankSt() : K.st, steps0 = restart ? E.plan(K.design, st0) : K.steps;
    return { K: K, restart: restart, sl: E.shoppingList(K.design, st0, steps0), happy: restart ? E.planCost(K.design, steps0) : K.happy, n0: K.n0 + (restart ? 1 : 0) };
  }
  function specOf(base, k) { var r = (base || []).find(function (x) { return x.k === k; }); return r ? r.v : ''; }
  function shopTotal(D) {
    var cp = D.K.cp;
    if (D.happy.stopsAt === 0) return 'The next step is your call: each choice on it says what it still costs to finish.';
    return 'About <b>' + esc(est(D.happy.div)) + '</b> if every roll lands' + (D.sl.base ? ', plus the base' : '') + (D.happy.stopsAt !== null ? ', up to your call' : '') +
      (!cp ? ' · working out the average with misses…' : cp.capped ? ' · very high on average (' + cappedText(cp) + ').' : avgShown(D.K.happy, cp) ? ' · <b>' + esc(avgTxt(cp.avg.div)) + '</b> on average with misses.' : '.');
  }
  function shopRowName(r) { return r.n + (r.approx ? ' (the Anvil shows the exact amount)' : ''); }
  function shopPanel(D) {
    var sl = D.sl, h = '<div class="shop" id="shop">';
    h += '<p class="sm">' + LG_NAME[app.league] + ' prices, ' + esc(PRICES.date) + '. Counts are for one go at each step: bring spares for the chancy ones.</p>';
    if (D.restart) h += '<p class="sm">The steps start again from a new base, so this list is for a fresh start.</p>';
    if (sl.base) {
      h += '<h4>The base <span>buy it on trade</span></h4><p class="shop-base">Magic ' + esc(specOf(sl.base, 'Base')) + ', item level ' + esc(specOf(sl.base, 'Item level')) + '</p>' +
        '<p class="sm">Prefix: ' + modHTML(specOf(sl.base, 'Prefix')) + ' · Suffix: ' + modHTML(specOf(sl.base, 'Suffix')) + '. Not priced here.</p>';
    }
    if (sl.rows.length) {
      h += '<h4>For the steps <span>about ' + esc(est(D.happy.div)) + '</span></h4><ul class="shop-list">' + sl.rows.map(function (r) {
        return '<li><span class="sn">' + r.q + ' × ' + esc(shopRowName(r)) + (r.chance ? '<small>Step ' + (D.n0 + r.chance.i) + ' is ' + esc(E.oddsLabel(r.chance.p)) + ' a try: bring spares</small>' : '') + '</span>' +
          '<span class="sp">' + esc(r.total === null ? 'price unknown' : fmt(r.total)) + '</span></li>';
      }).join('') + '</ul>';
    }
    if (sl.misses.length) {
      h += '<h4>If a roll misses <span>buy these when you need them</span></h4><ul class="shop-list">' + sl.misses.map(function (m) {
        var what = m.type === 'fix' ? esc(m.label) : m.type === 'restart' ? 'a miss means a new magic base' : 'a miss means skipping ' + modHTML(m.what);
        var cost = m.type === 'fix' ? fmt(m.each) + ' each time' : m.type === 'restart' ? '—' : 'free';
        return '<li><span class="sn">Step ' + (D.n0 + m.i) + ': ' + what + '</span><span class="sp">' + esc(cost) + '</span></li>';
      }).join('') + '</ul>';
    }
    if (sl.optional.length) {
      h += '<h4>Optional</h4><p class="sm">' + sl.optional.map(function (o) { return esc(o.n) + ' (' + esc(o.each === null ? 'price unknown' : fmt(o.each)) + ')'; }).join(', ') + '</p>';
    }
    h += '<p class="shop-tot" id="shop-avg">' + shopTotal(D) + '</p>';
    h += '<div class="shop-foot"><button type="button" class="btn small" data-act="shop-copy">' + ico('u-copy') + 'Copy list</button><button type="button" class="btn small quiet" data-act="shop-close">Close</button></div>';
    return h + '</div>';
  }
  /* The shopping list as plain text, worked out in full (it runs on a click). */
  function shopText(c) {
    var design = designOf(c), steps = E.plan(design, c.planSt);
    var K = { design: design, steps: steps, st: c.planSt, n0: SETUP + doneCount(c) + 1, happy: E.planCost(design, steps), cp: E.costPlan(design, c.planSt, { steps: steps }) };
    var D = shopData(K), sl = D.sl, L = [];
    L.push('Shopping list: ' + c.base + ', item level ' + c.ilvl);
    L.push(LG_NAME[app.league] + ' prices, ' + PRICES.date + ' (poe.ninja). Rough estimates.');
    if (D.restart) L.push('The steps start again from a new base, so this list is for a fresh start.');
    if (sl.base) {
      L.push('', 'The base (buy it on trade, not priced here):');
      L.push('- Magic ' + specOf(sl.base, 'Base') + ', item level ' + specOf(sl.base, 'Item level') + ', prefix: ' + specOf(sl.base, 'Prefix') + ', suffix: ' + specOf(sl.base, 'Suffix'));
    }
    if (sl.rows.length) {
      L.push('', 'For the steps (' + aboutTxt(D.happy.div) + ' if every roll lands):');
      sl.rows.forEach(function (r) {
        L.push('- ' + r.q + ' × ' + shopRowName(r) + ': ' + (r.total === null ? 'price unknown' : fmt(r.total)) + (r.chance ? ' (step ' + (D.n0 + r.chance.i) + ' is ' + E.oddsLabel(r.chance.p) + ' a try: bring spares)' : ''));
      });
    }
    if (sl.misses.length) {
      L.push('', 'If a roll misses (buy these when you need them):');
      sl.misses.forEach(function (m) {
        L.push('- Step ' + (D.n0 + m.i) + ': ' + (m.type === 'fix' ? m.label + ', ' + fmt(m.each) + ' each time' : m.type === 'restart' ? 'a miss means a new magic base' : 'a miss means skipping ' + m.what));
      });
    }
    if (sl.optional.length) L.push('', 'Optional: ' + sl.optional.map(function (o) { return o.n + ' (' + (o.each === null ? 'price unknown' : fmt(o.each)) + ')'; }).join(', '));
    var cp = K.cp;
    if (D.happy.stopsAt === 0) L.push('', 'The next step is my call: the app prices each choice on it.');
    else if (cp.capped) L.push('', 'On average, following the steps: very high (' + cappedText(cp) + ').');
    else if (avgShown(K.happy, cp)) L.push('', 'On average, following the steps: ' + aboutTxt(cp.avg.div) + (sl.base || D.restart ? ', plus ' + basesTxt(cp.avg.bases) : '') + '.');
    return L.join('\n');
  }
  function renderPlanSteps() {
    var c = cur();
    var el = $('p-steps');
    app.ui.costTok += 1; clearTimeout(app.ui.costTimer);   // a newer render: any average still being worked out is for an old one
    if (!targetCount(c)) {
      $('p-grid').classList.remove('started');
      el.innerHTML = '<div class="steps-head"><h2>Steps</h2></div><div class="empty-steps"><h3>Choose your targets first</h3><p>Add the mods you want on the Design screen, and the steps show up here.</p>' +
        '<button type="button" class="btn small" data-act="go-design">Go to Design</button></div>';
      updateTabStep(null);
      return;
    }
    $('p-grid').classList.add('started');
    var design = designOf(c);
    var steps = E.plan(design, c.planSt);
    app.steps = steps;
    var rows = histRows(c);
    var outs = doneCount(c);
    var n = SETUP + outs + 1;
    var now = steps[0];
    var left = steps.filter(function (s) { return s.kind !== 'done'; }).length;
    var stage = setupStage(c);
    app.ui.nowKey2 = c.id + '|' + stage + '|' + n;
    var K = costState(c, design, steps, stage);
    var meta = now.kind === 'done' ? 'All done' : stage === 1 ? 'Start with step 1: choose your starting item' : stage === 2 ? 'Step 2: fill in what’s on your item' : 'Step ' + n + ' · about ' + plural(left, 'step') + ' to go';
    var h = '<div class="steps-head"><div><h2>Steps</h2><p class="meta">' + meta + '</p></div><div class="steps-tools">' + copyBtn('small') +
      // On narrow screens the steps come first: a jump to the item card (step 2 has its own until the craft starts)
      (outs ? '<button type="button" class="btn small quiet to-item" data-act="to-item">Your item' + ico('u-chev') + '</button>' : '') +
      (c.hist.length ? '<button type="button" class="btn small" data-act="undo" title="Undo: ' + esc(undoLabel(c)) + '">' + ico('u-undo') + 'Undo</button>' : '') +
      (!c.hist.length ? '' : app.ui.confirmReset ? '<span class="muted" style="font-size:.9rem">Clear progress?</span><button type="button" class="btn small danger" data-act="reset-yes">Start over</button><button type="button" class="btn small quiet" data-act="reset-no">Keep</button>'
        : '<button type="button" class="btn small quiet" data-act="reset">Start over</button>') + '</div></div>';
    h += costSection(K);
    h += '<ol class="timeline">' + setupSteps(c, stage);
    var showFrom = app.ui.doneAll ? 0 : Math.max(0, rows.length - 3);
    if (showFrom > 0) h += '<li class="st"><span></span><button type="button" class="done-toggle" data-act="done-all">' + ico('u-chev') + 'Show ' + plural(showFrom, 'earlier step') + '</button></li>';
    rows.slice(showFrom).forEach(function (r) {
      if (r.gap) h += '<li class="st done edit"><div class="st-n" aria-hidden="true"><span>…</span></div><div class="st-b"><b>Earlier steps</b><span>' + plural(r.gap, 'step') + ' no longer kept in the history</span></div></li>';
      else if (r.e) h += '<li class="st done edit"><div class="st-n" aria-hidden="true"><span>✎</span></div><div class="st-b"><b>Edited the item</b><span>' + esc(editLabels(r.labels)) + '</span></div></li>';
      else h += '<li class="st done"><div class="st-n" aria-hidden="true"><span>' + r.n + '</span></div><div class="st-b"><b><span class="vh">Step ' + r.n + ': </span>' + esc(r.t) + '</b><span>' + esc(r.o || '') + '</span></div></li>';
    });
    // While a setup step is current, the plan's first step waits its turn like the others
    if (!stage) h += '<li class="st now"><div class="st-n" aria-hidden="true"><span>' + n + '</span></div><div class="st-b">' + renderNow(c, now, n, K) + '</div></li>';
    (stage ? steps : steps.slice(1)).forEach(function (s, i) {
      var num = n + i + (stage ? 0 : 1);
      var open = !!app.ui.open[num];
      h += '<li class="st next"><div class="st-n" aria-hidden="true"><span>' + num + '</span></div><div class="st-b"><h4><span class="vh">Step ' + num + ': </span>' + esc(s.title) + '</h4>' +
        (s.how ? '<p class="sm' + (open ? ' open' : '') + '">' + esc(dash(s.how)) + '</p>' : '') +
        ((s.mats && s.mats.length) ? '<p class="ml">' + esc(s.mats.map(function (m) { return m.n; }).join(' · ')) + (s.odds && s.odds.p < 0.995 ? ' · ' + esc(E.oddsLabel(s.odds.p)) : '') + '</p>' : '') +
        (s.how && s.how.length > 100 ? '<button type="button" class="more" data-act="more" data-n="' + num + '">' + (open ? 'Less' : 'More') + '</button>' : '') + '</div></li>';
    });
    h += '</ol>';
    var lastS = steps[steps.length - 1];
    if (lastS && lastS.endsHere) h += '<p class="fine">If you start over, the plan begins again from a fresh base.</p>';
    h += '<p class="fine">Later steps assume each roll lands. When one doesn’t, tell the current step what happened and the rest re-plans.</p>';
    el.innerHTML = h;
    if (!costReady(K)) scheduleCost(c, K);
    updateTabStep(now.kind === 'done' ? '✓' : outs ? String(n) : null);
  }
  function copyBtn(cls) {
    return '<button type="button" class="btn quiet ' + cls + '" data-act="copy-craft" title="Copies this craft as text, to paste into a chat and ask about it">' + ico('u-copy') + 'Copy for a chat</button>';
  }
  function updateTabStep(t) {
    var b = $('tab-step');
    if (!t) { b.hidden = true; return; }
    b.hidden = false; b.textContent = t;
  }
  function renderPlan() {
    var k = focusKey(), c = cur();
    liveSt(c); renderPlanItem(); renderPlanSteps();
    restoreFocus(k);
    var prev = app.ui.nowKey;
    app.ui.nowKey = app.ui.nowKey2;
    if (prev && app.ui.nowKey && prev.split('|')[0] === c.id && prev !== app.ui.nowKey) revealNow();
  }
  /* Re-rendering replaces the buttons, so remember which one had focus and give it back afterwards. After a step's
     outcome, focus goes to the new current step instead, so a second Enter can't record the next one by mistake. */
  var FOCUS_ATTRS = ['data-v', 'data-s', 'data-id', 'data-k', 'data-f', 'data-n'];
  var FOCUS_ALT = { reset: 'reset-yes', 'reset-no': 'reset', 'reset-yes': null, 'done-all': null, 'shop-close': 'shop' };
  function focusKey() {
    var a = document.activeElement;
    if (!a || !a.closest || !a.getAttribute) return null;
    var cont = a.closest('#p-item, #p-steps'), act = a.getAttribute('data-act');
    if (!cont || !act) return null;
    if (act === 'out') return { now: true };
    var k = { cont: cont.id, act: act, attrs: {} };
    FOCUS_ATTRS.forEach(function (n) { if (a.hasAttribute(n)) k.attrs[n] = a.getAttribute(n); });
    return k;
  }
  function restoreFocus(k) {
    if (!k) return;
    var el = null;
    var find = function (act) {
      return document.querySelector('#' + k.cont + ' [data-act="' + act + '"]' + Object.keys(k.attrs).map(function (n) { return '[' + n + '="' + k.attrs[n] + '"]'; }).join(''));
    };
    if (!k.now) {
      el = find(k.act);
      if (!el && FOCUS_ALT[k.act]) el = document.querySelector('#' + k.cont + ' [data-act="' + FOCUS_ALT[k.act] + '"]');
    }
    if (!el) el = document.querySelector('.st.now .card h3');
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  /* After a recorded step, bring the new current step into view if it moved off screen (the setup steps fold up). */
  function revealNow() {
    var now = document.querySelector('.st.now');
    if (!now) return;
    var r = now.getBoundingClientRect();
    var bar = document.querySelector('.bar'), top = bar ? bar.getBoundingClientRect().bottom : 0;
    if (r.top < top + 4 || r.top > window.innerHeight * 0.7) now.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- plan actions ---------- */
  function blankSt(skip) { return { rarity: 'none', mods: [], done: {}, skip: skip || {} }; }
  /* The steps always follow the item: every change re-plans at once, so there's no out-of-date plan to reforge.
     planSt stays in the data (saves and undo snapshots use it) but always matches st. */
  function replan(c) {
    if (c.st) c.planSt = clone(c.st);
    c.stale = false;
  }
  function liveSt(c) {
    if (!c.st) c.st = blankSt();
    replan(c);
  }
  function entryLabel(x) { return x.e ? (x.o || 'your last change') : x.t; }
  function undoLabel(c) { var x = c.hist[c.hist.length - 1]; return x ? entryLabel(x) : ''; }
  /* Keep the history bounded: fold the oldest runs of hand edits first (a run's first entry keeps the item from
     before the run, so undo still lands on a real state), then drop the oldest entries. meta (the craft, or a copy
     of its counters when saving) counts the recorded steps dropped and keeps the item they started from, so step
     numbers and "Started from" don't change when old history goes. */
  function trimHist(h, max, meta) {
    while (h.length > max) {
      var i = -1;
      for (var k = 1; k < h.length - 10; k++) if (h[k].e && h[k - 1].e && h[k].as === undefined) { i = k; break; }
      if (i > 0) {
        if (h[i].o) h[i - 1] = Object.assign({}, h[i - 1], { o: (h[i - 1].o ? h[i - 1].o + ', ' : '') + h[i].o });
        h.splice(i, 1);
      } else {
        var x = h.shift();
        if (!x.e && meta) {
          // what the dropped step used stays counted in spent so far (hs), or as a step that can't be priced (x)
          if (!meta.hs) meta.hs = { sp: {}, b: 0, x: meta.hdrop || 0 };
          var src = meta.hist ? meta : meta.c, d = Array.isArray(x.sp) ? x : src ? derivedSpend(src, x) : null;   // an older entry: priced from its title
          if (d) { (d.sp || []).forEach(function (q) { meta.hs.sp[q[0]] = (meta.hs.sp[q[0]] || 0) + q[1]; }); meta.hs.b += d.b ? 1 : 0; } else meta.hs.x += 1;
          if (!meta.hdrop) meta.h0 = x.st || blankSt();
          meta.hdrop = (meta.hdrop || 0) + 1;
        }
      }
    }
    return h;
  }
  function pushHist(c, entry) {
    entry.st = clone(c.st); entry.ps = clone(c.planSt); entry.sl = false; entry.su = c.su | 0;
    c.hist.push(entry);
    trimHist(c.hist, 60, c);
  }
  /* A change made by hand on the item: its own undo step, labelled for the Undo button and the timeline. */
  /* What an item change is judged by: the mods themselves, not their ids or the analysis fields renders add. */
  function stSig(st) {
    if (!st) return '';
    return JSON.stringify([st.rarity, st.mods.map(function (m) {
      return [m.s, m.mi === undefined ? null : m.mi, m.pseudo || '', m.mark || 'auto', !!m.crafted, !!m.desec, !!m.fract].join('|');
    }).sort(), Object.keys(st.skip || {}).filter(function (k) { return st.skip[k]; }).sort(), st.done || {}]);
  }
  function manualEdit(c, fn, label) {
    if (!c.st) c.st = blankSt();
    var before = { st: clone(c.st), ps: clone(c.planSt), su: c.su | 0 }, sig = stSig(c.st) + '#' + before.su;
    hideToast();
    fn();
    c.su = (c.su | 0) | 1;   // any change to the item answers step 1
    if (stSig(c.st) + '#' + c.su === sig) { c.st = before.st; replan(c); renderPlan(); return false; }
    c.hist.push({ t: 'Edited the item', o: label || '', e: true, st: before.st, ps: before.ps, sl: false, su: before.su });
    trimHist(c.hist, 60, c);
    app.ui.confirmReset = false;
    replan(c);
    touch(c);
    renderPlan();
    return true;
  }
  /* A recorded outcome keeps what it used (price keys and counts, so it reprices with the league) and whether it was a
     magic base. [] means nothing was used; entries saved before this have no sp and are priced from their title. */
  function withSpend(e, sp) { e.sp = sp ? sp.sp : []; if (sp && sp.b) e.b = 1; return e; }
  function commit(c, stepTitle, label, newSt, sp) {
    pushHist(c, withSpend({ t: stepTitle, o: label }, sp));
    c.st = newSt; c.planSt = clone(newSt); c.stale = false; c.su = 3;
    app.ui.optFor = null; app.ui.open = {}; app.ui.confirmReset = false;
    touch(c);
    renderPlan();
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
    if (!step) return;
    var opt = curOption(c, step);
    var outs = opt ? opt.outcomes : step.outcomes;
    var o = outs[i];
    if (!o) return;
    var title = step.title + (opt && opt.key !== 'settle' && opt.key !== 'restart' ? ' · ' + opt.label : '');
    var sp = E.spendOf(step, opt, o);
    if (o.astrid) {
      pushHist(c, { t: 'Edited the item', o: 'Turned on Astrid’s Creativity', e: true, as: !!c.astrid });
      c.astrid = true; app.ui.confirmReset = false;
      replan(c); touch(c); renderPlan();
      toast('Astrid’s Creativity is on for this craft, so it can take a second crafted modifier. The steps now show how.', 6000);
      return;
    }
    if (o.edit) {
      pushHist(c, withSpend({ t: step.title, o: o.label }, sp));
      if (step.kind === 'base') c.st = { rarity: 'magic', mods: [], done: {}, skip: (c.st && c.st.skip) || {} };
      c.su = 3;
      replan(c);
      touch(c); renderPlan();
      flashItem(step.kind === 'base' ? 'Add the mods your base has. The steps update as you go.' : 'Fix your item to match. The steps update as you go.');
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
          commit(c, title, (o.label.replace(/…$/, '')) + ': ' + (mod.pseudo ? 'junk' : E.famName(famOf(mod.mi))), st, sp);
        }
      });
      return;
    }
    commit(c, title, o.label, E.apply(c.planSt, o.o), sp);
  }
  function undo() {
    var c = cur();
    var x = c.hist.pop();
    if (!x) return;
    c.st = x.st; c.planSt = x.ps;
    if (x.as !== undefined) c.astrid = x.as;
    if (x.su !== undefined) c.su = x.su;
    replan(c);
    app.ui.optFor = null; app.ui.confirmReset = false;
    touch(c); renderPlan();
    toast('Undid “' + entryLabel(x) + '”.');
  }
  function startCopy() {
    var c = cur(), cat = catOf(c);
    var mods = [];
    [0, 1].forEach(function (s) {
      c.targets[s].forEach(function (t) {
        if (!t) return;
        var m = { id: E.newId(), s: s, mi: t.mi, mark: 'auto' };
        // An alloy or essence-only target is a crafted mod, a desecration-only one is desecrated, as when picked by hand
        var o = E.tierOptions(cat, famOf(t.mi)).filter(function (x) { return x.mi === t.mi; })[0];
        if (o && (o.kind === 'alloy' || o.kind === 'essence')) m.crafted = true;
        if (o && o.kind === 'lich') m.desec = true;
        mods.push(m);
      });
    });
    var perSide = [0, 1].map(function (s) { return mods.filter(function (m) { return m.s === s; }).length; });
    var doIt = function () {
      c.st = { rarity: (perSide[0] > 1 || perSide[1] > 1) ? 'rare' : mods.length ? 'magic' : 'none', mods: mods, done: {}, skip: (c.st && c.st.skip) || {} };
    };
    manualEdit(c, doIt, 'Copy targets in');
    toast('Copied your targets in. Press ✕ on any you don’t have, and add what else is on it.');
  }
  function startBlank() {
    var c = cur();
    if (manualEdit(c, function () { c.st = { rarity: 'none', mods: [], done: {}, skip: (c.st && c.st.skip) || {} }; }, 'Clear item')) toast('Cleared the item. Undo brings it back.');
  }
  function listAnd(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  /* Fill the item with what's worth having on a bought base of the chosen rarity, as the plan sees it. */
  function suggestItem() {
    var c = cur();
    var rar = c.st && c.st.rarity;
    if (rar !== 'magic' && rar !== 'rare') { toast('Choose Magic or Rare first, then Suggest fills in what to look for.'); return; }
    var design = designOf(c);
    var mods = E.suggest(design, rar, c.st.skip);
    if (!mods) { toast('Nothing to suggest yet. Add your targets on the Design screen first.'); return; }
    manualEdit(c, function () { c.st.mods = mods; c.su = (c.su | 0) | 3; }, 'Suggest');
    var parts = mods.map(function (m) {
      return m.pseudo ? 'any ' + SIDE[m.s] + ' (junk for the crafted mod to delete)' : E.famName(famOf(m.mi)) + (m.crafted ? ' (from an essence)' : '');
    });
    var msg = rar === 'magic' ? 'Suggested a magic base with ' + (parts.length ? listAnd(parts) : 'no mods') + '.'
      : 'Suggested the item as the plan has it right after it turns rare: ' + listAnd(parts) + '.';
    if (rar === 'magic') {
      var next = E.nextStep(design, { rarity: 'magic', mods: clone(mods), done: {}, skip: c.st.skip || {} });
      [0, 1].forEach(function (s) {
        if (!catOf(c).caps[s] || mods.some(function (m) { return m.s === s; })) return;
        if (next.kind === 'essence' && next.project.mods[0].s === s) {
          var en = next.mats[0].n;
          msg += ' No ' + SIDE[s] + ' needed: ' + (/^[aeiou]/i.test(en) ? 'an ' : 'a ') + en + ' adds ' + E.famName(famOf(next.project.mods[0].mi)) + ' when it turns rare.';
        }
      });
      if (mods.some(function (m) { return !m.pseudo; })) msg += ' The rarest targets go on the base, since they’re the hardest to add later.';
    }
    toast(msg, 8000);
  }
  function setRarity(v) {
    var c = cur();
    if (!RAR[v]) return;
    var had = c.st ? c.st.mods.slice() : [];
    var changed = manualEdit(c, function () {
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
    }, RAR[v]);
    var gone = changed ? had.filter(function (m) { return c.st.mods.indexOf(m) < 0 && !c.st.mods.some(function (x) { return x.id === m.id; }); }) : [];
    if (gone.length) toast((v === 'none' ? 'A normal item has no mods, so ' : 'A magic item holds one prefix and one suffix, so ') + listAnd(gone.map(modName)) +
      (gone.length > 1 ? ' were' : ' was') + ' taken off. Undo puts ' + (gone.length > 1 ? 'them' : 'it') + ' back.', 6000);
  }
  function findMod(c, id) { return c.st && c.st.mods.find(function (m) { return m.id === id; }); }
  function addHave(s, f) {
    var c = cur();
    if (!c.st) c.st = blankSt();
    openPicker({
      mode: 'have', side: s, prefer: f, flags: {}, title: 'What’s on your item?', sub: 'Pick the ' + SIDE[s] + ' your item has.',
      onPick: function (mod) {
        manualEdit(c, function () {
          c.st.mods.push(mod);
          var per = [0, 1].map(function (x) { return c.st.mods.filter(function (m) { return m.s === x; }).length; });
          if (c.st.rarity === 'none') c.st.rarity = 'magic';
          if (c.st.rarity === 'magic' && (per[0] > 1 || per[1] > 1)) { c.st.rarity = 'rare'; toast('Marked as rare: magic items hold one prefix and one suffix.'); }
        }, 'Added ' + modName(mod));
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
        }, 'Changed ' + modName(m) + ' to ' + modName(mod));
      }
    });
  }

  /* ---------- picker ---------- */
  function openPicker(p) {
    var c = cur();
    hideToast();
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
  function tiersHTML(cat, f, current) {
    return '<div class="tiers">' + E.tierOptions(cat, f).map(function (o) {
      var lab = o.kind === 'roll' ? o.label : o.kind === 'essence' ? 'Essence' : o.kind === 'alloy' ? 'Alloy' : 'Desecr.';
      var subl = o.kind === 'roll' ? 'lvl ' + o.l : '';
      var src = o.kind === 'roll' ? (o.ess && o.ess.length ? 'Also from ' + o.ess.join(', ') : '') : o.kind === 'essence' ? o.ess.join(', ') : o.kind === 'alloy' ? o.src : 'From ' + o.src + ' (desecration)';
      return '<button type="button" class="tier" data-act="pk-tier" data-mi="' + o.mi + '" data-kind="' + o.kind + '" aria-pressed="' + (current === o.mi) + '"><span class="tl">' + esc(lab) + (subl ? '<small>' + subl + '</small>' : '') + '</span>' +
        '<span class="tt">' + modHTML(modText(o.mi)) + (src ? '<small>' + esc(src) + '</small>' : '') + '</span></button>';
    }).join('') + '</div>';
  }
  /* When telling the planner what's on the item, your design's targets for that side come first, one tap each
     (the one for the row you came from on top), since that's usually what landed. */
  function pickPins(c, p) {
    if (p.mode !== 'have') return [];
    var onItem = new Set();
    (c.st ? c.st.mods : []).forEach(function (m) { if (m.id !== p.editing && m.mi !== null && m.mi !== undefined) onItem.add(famOf(m.mi)); });
    var pins = c.targets[p.side].filter(function (t) { return t && !onItem.has(famOf(t.mi)); });
    if (p.prefer !== null && p.prefer !== undefined) pins.sort(function (a, b) { return (famOf(b.mi) === p.prefer) - (famOf(a.mi) === p.prefer); });
    return pins;
  }
  function renderPickList() {
    var c = cur(), p = app.pk, cat = catOf(c);
    var q = p.q.trim().toLowerCase();
    function shown(F) {
      if (p.cat !== 'All' && F.c !== p.cat) return false;
      if (!q) return true;
      var hay = (F.name + ' ' + F.t + ' ' + E.tierOptions(cat, F.f).map(function (o) { return MODS[o.mi].x + ' ' + (o.ess || []).join(' ') + ' ' + (o.src || ''); }).join(' ')).toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
    }
    var pins = pickPins(c, p).filter(function (t) { var F = cat.byFam.get(famOf(t.mi)); return F && shown(F); });
    var pinned = new Set(pins.map(function (t) { return famOf(t.mi); }));
    var list = cat.sides[p.side].filter(function (F) { return !pinned.has(F.f) && shown(F); });
    var h = '';
    if (pins.length) {
      h += '<p class="pk-cat">From your design</p>';
      pins.forEach(function (t) {
        var f = famOf(t.mi), open = p.open === f, tl = tierLab(cat, t.mi);
        var o = E.tierOptions(cat, f).find(function (x) { return x.mi === t.mi; }) || { kind: 'roll' };
        h += '<div class="fam pin' + (open ? ' open' : '') + '"><div class="pin-row"><button type="button" class="fam-main" data-act="pk-tier" data-mi="' + t.mi + '" data-kind="' + o.kind + '">' +
          '<span class="fam-t">' + modHTML(modText(t.mi)) + '</span><span class="fam-m">Your target · ' + esc(tl) + (tl.charAt(0) === 'T' ? ' or better' : '') + '</span></button>' +
          '<button type="button" class="pin-more" data-act="pk-fam" data-f="' + f + '" aria-expanded="' + open + '">Other tier</button></div>' +
          (open ? tiersHTML(cat, f, p.current) : '') + '</div>';
      });
    }
    if (p.mode === 'have') h += '<button type="button" class="pk-junk" data-act="pk-junk">' + ico('u-x') + '<span>Something I don’t want<small class="muted" style="display:block;font-size:.82rem">Any ' + SIDE[p.side] + ' you plan to replace. Fine to leave vague.</small></span></button>';
    if (!list.length && !pins.length) h += '<p class="pk-none">Nothing matches. Clear the search or pick another category.</p>';
    var lastCat = null;
    list.forEach(function (F) {
      if (p.cat === 'All' && F.c !== lastCat) { h += '<p class="pk-cat">' + esc(F.c) + '</p>'; lastCat = F.c; }
      var opts = E.tierOptions(cat, F.f);
      var top = opts[0];
      var used = pickUsed(F);
      // Tags only for mods that can't be rolled, so each one means "only this way": Life also comes from an essence,
      // but an Essence tag on it read as if that were the only route (the tiers still say "Also from ...")
      var tags = [];
      if (!F.rollable) {
        if (F.essence.length) tags.push('<span class="tag ess">Essence</span>');
        if (F.alloy.length) tags.push('<span class="tag alloy">' + esc(F.alloy[0].name.replace(/^The /, '')) + '</span>');
        if (F.lich.length) tags.push('<span class="tag lich">Desecrated</span>');
      }
      var meta = F.rollable ? plural(F.tiers.length, 'tier') + ' · top needs item level ' + F.tiers[0].l : (F.alloy.length ? 'Alloy only' : F.lich.length ? 'Desecration only (' + esc(F.lich[0].lich) + ')' : 'Essence only');
      var open = p.open === F.f;
      h += '<div class="fam' + (used ? ' used' : '') + (open ? ' open' : '') + '"><button type="button" class="fam-main" data-act="pk-fam" data-f="' + F.f + '"' + (used ? ' aria-disabled="true"' : '') + ' aria-expanded="' + open + '">' +
        '<span class="fam-t">' + modHTML(modText(top.mi)) + '</span><span class="fam-m">' + (used ? (p.mode === 'design' ? 'Already in another box' : 'Already on the item') : meta) + '</span>' +
        '<span class="fam-b">' + tags.join('') + '</span></button>';
      if (open) h += tiersHTML(cat, F.f, p.current);
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
      replan(c);
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

  /* ---------- the craft as text, to paste into a chat (Claude, ChatGPT, a friend) ---------- */
  function untag(h) {
    return String(h).replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, function (x, k) { return { amp: '&', lt: '<', gt: '>', quot: '"', '#39': '\'' }[k]; });
  }
  function chanceLine(odds) {
    var what = odds.what && odds.what !== 'guaranteed' ? ' ' + odds.what : '';
    return 'Chance' + what + ': ' + E.oddsLabel(odds.p) + (odds.alt ? '. With a ' + odds.alt.label + ': ' + E.oddsLabel(odds.alt.p) + ', at a much higher price per try' : '');
  }
  function pricedMat(m) {
    var v = E.price(m.k, app.league);
    var bits = [v === null ? '' : fmt(v * (m.q || 1)), m.opt ? 'optional' : ''].filter(Boolean);
    return m.n + (m.q ? ' ×' + m.q : '') + (bits.length ? ' (' + bits.join(', ') + ')' : '');
  }
  function stepOutline(s) {
    var bits = [];
    if (s.mats && s.mats.length) bits.push(s.mats.map(function (m) { return m.n; }).join(', '));
    if (s.odds && s.odds.p < 0.995) bits.push(E.oddsLabel(s.odds.p));
    return s.title + (bits.length ? ': ' + bits.join(' · ') : '');
  }
  function finishText(x) {
    if (!isFinite(x.finish)) return 'very high to finish (it would take more than 200 magic bases)';
    return aboutTxt(x.finish) + (x.stop >= 0.5 ? ' until it stops again' : ' to finish');
  }
  function stepDetail(c, step, cc) {
    var L = [step.title];
    if (step.how) L.push(dash(step.how));
    (step.spec || []).forEach(function (r) { L.push(r.k + ': ' + r.v); });
    (step.warn || []).forEach(function (w) { L.push('Warning: ' + dash(w)); });
    var opt = curOption(c, step);
    if (step.options) {
      L.push('Ways to do it:');
      step.options.forEach(function (o, i) {
        var x = cc && cc[i];
        var cost = !x ? (o.mats.length ? ' About ' + fmt(o.cost) + ' a try.' : ' Free.')
          : x.kind === 'fix' ? ' About ' + fmt(x.now) + ' a try; ' + finishText(x) + '.'
            : x.kind === 'skip' ? ' Free now; ' + finishText(x) + ' without ' + o.label.replace(/^Skip /, '') + '.'
              : ' Free now; ' + finishText(x) + (isFinite(x.finish) ? ' from a new base, plus ' + basesTxt(x.bases) : '') + '.';
        L.push('- ' + o.label + (o.key === step.recommended ? ' (suggested)' : o === opt ? ' (my choice)' : '') + ': ' + dash(o.text) + cost);
      });
    }
    var odds = opt ? (opt.mats.length ? { p: opt.swap ? opt.pAdd : opt.p, what: opt.swap ? 'to reroll it into a target' : 'to remove junk' } : null) : step.odds;
    if (odds) L.push(chanceLine(odds));
    var mats = opt ? opt.mats : step.mats;
    if (mats && mats.length) {
      var need = mats.filter(function (m) { return !m.opt; });
      L.push('Uses: ' + mats.map(pricedMat).join(', ') + (need.length > 1 ? '. Per try: ' + fmt(E.matsCost(need, app.league).sum) : ''));
    }
    if (step.note) L.push(dash(step.note));
    var outs = (opt ? opt.outcomes : step.outcomes) || [];
    var labels = outs.map(function (o) { return o.label.replace(/…$/, ''); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (labels.length && step.kind !== 'done') L.push('The app then asks what happened: ' + labels.join(' / '));
    if (cc && !step.options) {
      L.push('What each choice still costs: ' + cc.map(function (x) {
        return x.label + ', ' + finishText(x) + (x.kind === 'restart' && isFinite(x.finish) ? ' plus ' + basesTxt(x.bases) : x.kind === 'astrid' ? ' (the rune: ' + fmt(x.now) + ')' : '');
      }).join('; ') + '.');
    }
    return L;
  }
  function haveText(m, t, cat) {
    if (m.pseudo) return m.pseudo === 'junk' ? 'a ' + SIDE[m.s] + ' I don’t want' : 'any ' + SIDE[m.s] + ', there as junk to sacrifice';
    var tl = tierLab(cat, m.mi), roll = tl.charAt(0) === 'T';
    var tier = roll ? (m.est ? tl + ' or better' : tl) : '';
    var st = m.status === 'hit' ? (m.accepted ? 'kept at ' + tl + ' (lower than wanted)' : 'on target')
      : m.status === 'low' ? 'lower tier than wanted' + (t ? ' (want ' + tierLab(cat, t.mi) + ')' : '')
        : m.status === 'keep' ? 'not a target, keeping it' : 'not wanted';
    var bits = [st];
    if (tier && !(m.status === 'hit' && m.accepted)) bits.push(tier);
    if (m.crafted) bits.push(roll ? 'crafted' : 'crafted (' + tl.toLowerCase() + ')');
    if (m.desec) bits.push('desecrated');
    if (m.fract) bits.push('fractured');
    return modText(m.mi) + ': ' + bits.join(', ');
  }
  /* The COST section of the chat text: spent so far, if every roll lands, on average, and what drives it. */
  function costText(c, design, st, steps, n0) {
    var L = ['', 'COST (rough: the app counts every eligible tier as equally likely; ' + LG_NAME[app.league] + ' prices from poe.ninja, ' + PRICES.date + ')'];
    var sp = spentSoFar(c), now = steps[0];
    if (sp.steps) {
      L.push((now.kind === 'done' ? 'This craft cost me ' : 'Spent so far: ') + (sp.div > 0 || sp.bases ? spentCore(sp) : 'nothing the app could price') +
        ' (the steps I recorded in the app, at these prices; hand edits not counted)' + spentTail(sp, true) + '.');
    }
    if (now.kind === 'done') return L;
    var happy = E.planCost(design, steps), cp = E.costPlan(design, st, { steps: steps });
    if (happy.stopsAt === 0) { L.push('The next step is my call: the app prices each choice on it (below).'); return L; }
    if (!happy.restart) {
      L.push('To finish if every roll lands: ' + aboutTxt(happy.div) + (happy.base ? ', plus a magic base' : '') +
        (happy.stopsAt !== null ? ', up to step ' + (n0 + happy.stopsAt) + ', where the app needs my call' : '') + (happy.known ? '' : ' (some prices unknown)') + '.');
    }
    if (cp.capped) L.push('To finish on average: very high (' + cappedText(cp) + ').');
    else if (avgShown(happy, cp)) {
      L.push('To finish on average, following the app’s steps after each miss: ' + aboutTxt(cp.avg.div) + (happy.restart ? ' from a new base' : '') +
        (happy.restart || cp.avg.bases >= 1.5 ? ', plus ' + basesTxt(cp.avg.bases) : '') + (cp.avg.unknown ? ' (some prices unknown)' : '') + '.' +
        (cp.risk ? ' ' + riskText(cp.risk, n0) : ''));
      var sk = cp.avg.skipped.filter(function (x) { return x.p >= 0.2 && !(st.skip && st.skip[x.f]); }).slice(0, 2);
      if (sk.length) {
        L.push('Following the steps, ' + inTenEnd(sk[0].p, true) + ' without ' + sk[0].name + (sk[1] ? ', and ' + inTenEnd(sk[1].p, false) + ' without ' + sk[1].name : '') +
          ' (the app skips a target when every fix averages over about 50 div by its own rough estimate).');
      }
    }
    return L;
  }
  /* One craft (never the others) as plain text: the base, what's wanted and how, the item now, the steps so far and next. */
  function craftText(c) {
    var cat = catOf(c), b = cat.base, design = designOf(c);
    var skip = (c.st && c.st.skip) || {};
    var L = [];
    L.push('Path of Exile 2 crafting, patch 0.5.5. This is a craft I’m working on, copied from the crafting planner app I use (PoE2 Crafting Playbook). Prices are from the ' + (app.league === 'roa' ? 'Runes of Aldur' : 'Forbidden Rites') + ' league, in divines (div) and exalts (ex).');
    L.push('How to read it: T1 is a mod’s best tier. Crafted mods come from an essence or an alloy, one per item (two with the rune Astrid’s Creativity socketed). Desecrated mods come from a desecration at the Well of Souls, one per item. The app’s odds count every eligible tier as equally likely, so they’re rough.');
    L.push('', 'THE ITEM');
    L.push(c.base + ' (' + CLS[c.cls].n + (b.sub ? ', ' + b.sub : '') + '), item level ' + c.ilvl + '.');
    var imp = implicitLines(b);
    if (imp.length) L.push('Implicit: ' + imp.join('; ') + '.');
    if (cat.caps[0] !== 3 || cat.caps[1] !== 3) L.push('As a rare it can have ' + plural(cat.caps[0], 'prefix', 'prefixes') + ' and ' + plural(cat.caps[1], 'suffix', 'suffixes') + '.');
    if ((b.rf || b.rfw) && c.runeforge) L.push('I plan to runeforge it at the Verisium Anvil at the end.');
    if (c.astrid && E.socketable(b)) L.push('I plan to use Astrid’s Creativity so it can hold two crafted mods.');

    L.push('', 'WHAT I WANT');
    if (!targetCount(c)) L.push('No target mods chosen yet.');
    var rmap = routeMap(c);
    [0, 1].forEach(function (s) {
      var ts = c.targets[s].filter(Boolean);
      if (!ts.length) return;
      L.push((s ? 'Suffixes' : 'Prefixes') + ':');
      ts.forEach(function (t) {
        var f = famOf(t.mi), tl = tierLab(cat, t.mi);
        var how = untag(routeFor(c, cat, rmap, t).line).replace(' below allows', ' allows');
        L.push('- ' + E.famName(f) + (tl.charAt(0) === 'T' ? ' (' + tl + ' or better)' : '') + ': ' + modText(t.mi) + '. How: ' + how + '.' + (skip[f] ? ' Skipped for now.' : ''));
      });
    });

    L.push('', 'WHERE I AM NOW');
    if (!underWay(c)) L.push('Not started: no base yet, or I haven’t entered my item.');
    else {
      E.analyze(cat, design, c.st);
      var rar = c.st.rarity, missing = [];
      L.push(rar === 'rare' ? 'Rare item.' : rar === 'magic' ? 'Magic item.' : 'Normal item, no mods yet.');
      [0, 1].forEach(function (s) {
        if (!cat.caps[s]) return;
        var rows = rowsFor(c, s, cat);
        rows.forEach(function (r) { if (r.t && !r.m && !skip[famOf(r.t.mi)]) missing.push(E.famName(famOf(r.t.mi))); });
        if (rar === 'none') return;
        var have = rows.filter(function (r) { return r.m; });
        L.push((s ? 'Suffixes' : 'Prefixes') + ' (' + have.length + ' of ' + (rar === 'magic' ? 1 : cat.caps[s]) + '):');
        if (!have.length) L.push('- none');
        have.forEach(function (r) { L.push('- ' + haveText(r.m, r.t, cat)); });
      });
      if (missing.length) L.push('Still missing: ' + listAnd(missing) + '.');
      var skipped = Object.keys(skip).filter(function (f) { return skip[f]; }).map(function (f) { return E.famName(+f); });
      if (skipped.length) L.push('Skipped for now: ' + listAnd(skipped) + '.');
    }

    var rows = histRows(c), outs = doneCount(c);
    if (outs) {
      L.push('', 'STEPS DONE');
      L.push('1–2. ' + startText(c, startState(c)) + '.');
      rows.forEach(function (r) {
        L.push(r.gap ? '- (' + plural(r.gap, 'earlier step') + ' not kept in the history)' : r.e ? '- I edited the item by hand' + (r.labels.length ? ' (' + r.labels.join(', ') + ')' : '') : r.n + '. ' + r.t + (r.o ? ': ' + r.o : ''));
      });
    }
    if (targetCount(c)) {
      var st0 = clone(c.st || blankSt());
      var steps = E.plan(design, st0);
      var n = SETUP + outs + 1;
      var now = steps[0];
      L = L.concat(costText(c, design, st0, steps, n));
      var cc = now.kind !== 'done' && E.choicesOf(now) ? E.choiceCosts(design, st0, now) : null;
      L.push('', now.kind === 'done' ? 'DONE' : 'NEXT STEP (step ' + n + ')');
      L = L.concat(stepDetail(c, now, cc));
      if (steps.length > 1) {
        L.push('', 'AFTER THAT (the plan assumes each roll lands)');
        steps.slice(1).forEach(function (st, i) { L.push((n + i + 1) + '. ' + stepOutline(st)); });
      }
    }
    return L.join('\n');
  }
  var copyRet = null;
  function copyByCommand(text) {
    var ret = document.activeElement, ok = false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* older browsers */ }
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (ret && ret.focus) { try { ret.focus(); } catch (e) { /* ignore */ } }
    return ok;
  }
  /* Copy text: the Clipboard API, then execCommand, then a box to copy it from by hand. */
  function copyText(text, okMsg, box) {
    var done = function () { toast(okMsg, 5500); };
    var fallback = function () { if (copyByCommand(text)) done(); else openCopyBox(text, box); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    } catch (e) { /* the clipboard API threw: try the other ways */ }
    fallback();
  }
  function copyCraft() { copyText(craftText(cur()), 'Copied this craft as text. Paste it into a chat (Claude, ChatGPT…) and ask your question.'); }
  /* When the browser won't let the app copy (some embedded pages do that), show the text to copy by hand. */
  function openCopyBox(text, box) {
    box = box || {};
    hideToast();
    copyRet = document.activeElement;
    var el = $('copybox');
    el.hidden = false;
    el.innerHTML = '<div class="modal-card copy-card" role="dialog" aria-modal="true" aria-labelledby="cb-t">' +
      '<div class="pk-head"><div><h2 id="cb-t">' + esc(box.title || 'Copy this craft') + '</h2><p>Your browser didn’t let the app copy it. Select the text and copy it, then ' + esc(box.then || 'paste it into your chat') + '.</p></div>' +
      '<button type="button" class="x" data-act="cb-close" aria-label="Close">' + ico('u-x') + '</button></div>' +
      '<div class="cb-body"><textarea id="cb-text" readonly spellcheck="false" aria-label="' + esc(box.label || 'This craft as text') + '">' + esc(text) + '</textarea></div>' +
      '<div class="pk-foot"><button type="button" class="btn small" data-act="cb-select">Select all</button><button type="button" class="btn small quiet sp" data-act="cb-close">Close</button></div></div>';
    setTimeout(selectCopyText, 0);
  }
  function selectCopyText() {
    var ta = $('cb-text');
    if (!ta) return;
    ta.focus(); ta.select();
    try { ta.setSelectionRange(0, ta.value.length); } catch (e) { /* older browsers */ }
  }
  function closeCopyBox() {
    var el = $('copybox');
    el.hidden = true; el.innerHTML = '';
    if (copyRet && document.body.contains(copyRet)) { try { copyRet.focus(); } catch (e) { /* ignore */ } }
    copyRet = null;
  }
  function copyBoxOpen() { return !$('copybox').hidden; }

  /* ---------- crafts drawer ---------- */
  function craftMeta(c) {
    var t = targetCount(c);
    if (!underWay(c)) return t ? plural(t, 'target') + ' · not started' : 'Empty design';
    var A = E.analyze(catOf(c), designOf(c), clone(c.st || blankSt()));
    var outs = doneCount(c);
    return A.hits + '/' + t + ' on the item · ' + (outs ? 'at step ' + (SETUP + outs + 1) : 'item set up');
  }
  function renderCraftsBadge() {
    var n = Object.keys(app.crafts).filter(function (id) { return worth(app.crafts[id]); }).length;
    $('crafts-n').textContent = n ? String(n) : '';
  }
  function storeLine() {
    if (store.mode === 'db' && !store.readOnly) return '<p class="store synced"><i></i>Saved to your account, so it follows you between devices.</p>';
    return '<p class="store"><i></i>Saved in this browser only.</p>';
  }
  function renderStore() { var el = $('dr-store'); if (el) el.innerHTML = storeLine(); renderSaved(); }
  function openDrawer() {
    hideToast();
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
    var prev = cur();
    var c = blankCraft(prev ? prev.cls : 'gloves');
    app.crafts[c.id] = c; app.curId = c.id;
    touch(c);
    if (!$('drawer').hidden) closeDrawer();
    go('design');
    renderCraftsBadge();
    toast(!worth(prev) ? 'New craft started.' : 'New craft started. The ' + prev.base + ' craft is ' + (canSave() ? 'saved in My crafts.' : 'still in My crafts until you close this page.'));
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('toast');
    // The visible toast comes and goes; screen readers hear it from a live region that's always there
    var sr = $('sr-live');
    if (sr) { sr.textContent = ''; setTimeout(function () { sr.textContent = msg; }, 60); }
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 4200);
  }
  function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    if (findOpen() && !e.target.closest('#find')) closeFind(false);
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.getAttribute('data-go')); return; }
    var lg = e.target.closest('[data-lg]');
    if (lg) { setLeague(lg.getAttribute('data-lg')); return; }
    if (e.target.closest('#crafts-open')) { openDrawer(); return; }
    if (e.target.closest('#saved')) { savedKey = ''; renderSaved(); toast(savedText(savedState()), 6500); return; }
    if (e.target.closest('#slot-pick')) { openSlots(); return; }
    if (e.target === $('picker')) { closePicker(); return; }
    if (e.target === $('drawer')) { closeDrawer(); return; }
    if (e.target === $('copybox')) { closeCopyBox(); return; }
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
      case 'd-clear': c.targets[s][i] = null; replan(c); touch(c); renderDesign(); break;
      case 'to-plan': go('plan'); break;
      case 'go-design': go('design'); break;
      case 'start-blank': startBlank(); break;
      case 'start-copy': startCopy(); break;
      case 'suggest': suggestItem(); break;
      case 'rarity': setRarity(a.getAttribute('data-v')); break;
      case 'have-add': if (a.getAttribute('aria-disabled') === 'true') { toast('Set the rarity to Magic or Rare first.'); break; } addHave(s, a.hasAttribute('data-f') ? +a.getAttribute('data-f') : null); break;
      case 'have-edit': editHave(a.getAttribute('data-id')); break;
      case 'have-del': (function (id) { var m = findMod(c, id); if (m) manualEdit(c, function () { c.st.mods = c.st.mods.filter(function (x) { return x.id !== id; }); }, 'Removed ' + modName(m)); })(a.getAttribute('data-id')); break;
      case 'mark': if (a.getAttribute('aria-pressed') === 'true') break; (function (id, v) { var m = findMod(c, id); if (m) manualEdit(c, function () { m.mark = v; }, (v === 'keep' ? 'Kept ' : 'Ditched ') + modName(m)); })(a.getAttribute('data-id'), a.getAttribute('data-v')); break;
      case 'unskip': (function (f) { manualEdit(c, function () { if (c.st && c.st.skip) delete c.st.skip[f]; }, 'Wanted ' + E.famName(+f) + ' again'); })(a.getAttribute('data-f')); break;
      case 'setup-done': manualEdit(c, function () { c.su = (c.su | 0) | 3; }, 'Step 2 done'); break;
      case 'to-item': (function () { var card = $('p-card'); if (card) { card.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); try { card.focus({ preventScroll: true }); } catch (err) { /* ignore */ } } })(); break;
      case 'out': applyOutcome(i); break;
      case 'opt': app.ui.opt = a.getAttribute('data-k'); app.ui.optFor = stepKey(c, app.steps[0]); renderPlan(); break;
      case 'undo': undo(); break;
      case 'reset': app.ui.confirmReset = true; renderPlan(); break;
      case 'reset-no': app.ui.confirmReset = false; renderPlan(); break;
      case 'reset-yes': app.ui.confirmReset = false; c.st = blankSt(); c.planSt = clone(c.st); c.hist = []; c.hdrop = 0; c.h0 = null; c.hs = null; c.su = 0; c.stale = false; app.ui.doneAll = false; touch(c); renderPlan(); break;
      case 'done-all': app.ui.doneAll = true; renderPlan(); break;
      case 'more': (function (n) { app.ui.open[n] = !app.ui.open[n]; renderPlan(); })(+a.getAttribute('data-n')); break;
      case 'new-craft': newCraft(); break;
      case 'copy-craft': copyCraft(); break;
      case 'shop': app.ui.shop = !app.ui.shop; renderPlan(); break;
      case 'shop-close': app.ui.shop = false; renderPlan(); break;
      case 'shop-copy': copyText(shopText(c), 'Copied the shopping list.', { title: 'Copy the shopping list', label: 'The shopping list as text', then: 'paste it where you need it' }); break;
      case 'cb-close': closeCopyBox(); break;
      case 'cb-select': selectCopyText(); break;
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
  // "What drives the average" keeps its open state across re-renders
  document.addEventListener('toggle', function (e) { if (e.target && e.target.classList && e.target.classList.contains('cost-more')) app.ui.costMore = e.target.open; }, true);
  document.addEventListener('change', function (e) {
    var c = cur();
    var t = e.target;
    if (t.id === 'd-base') { c.base = t.value; revalidate(c, c.base); touch(c); renderDesign(); return; }
    if (t.id === 'd-ilvl') {
      var v = Math.max(1, Math.min(100, parseInt(t.value, 10) || 82));
      c.ilvl = v; revalidate(c, 'item level ' + v); touch(c); renderDesign(); return;
    }
    if (t.id === 'd-rf') { c.runeforge = t.checked; replan(c); touch(c); return; }
    if (t.id === 'd-astrid') {
      c.astrid = t.checked; replan(c); touch(c); renderDesign();
      var cb = $('d-astrid'); if (cb) cb.focus({ preventScroll: true });
      return;
    }
    if (t.getAttribute('data-act') === 'd-tier') {
      var s = +t.getAttribute('data-s'), i = +t.getAttribute('data-i');
      c.targets[s][i] = { mi: +t.value };
      replan(c);
      touch(c); renderDesign();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (copyBoxOpen()) { closeCopyBox(); e.preventDefault(); return; }
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
  if (h0 === 'forge') h0 = 'plan';
  if (h0 === 'plan' || h0 === 'design' || h0 === 'ref' || h0 === 'reference') app.view = h0 === 'reference' ? 'ref' : h0;
  window.App = { get: function () { return app; }, league: function () { return app.league; }, toast: toast, go: go, craftText: function () { return craftText(cur()); } };
  initFind();
  go(app.view, { keepScroll: true });
  renderAll();
  initDb();
})();
