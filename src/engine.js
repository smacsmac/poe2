/* Crafting planner engine. Pure functions over the game data; no DOM. */
(function (root) {
  'use strict';

  var SIDE = ['prefix', 'suffix'];
  var SIDE_CAP = ['Prefix', 'Suffix'];
  var HAND = ['Sinistral', 'Dextral'];
  var ESS_EARLY = { lesser: 1, normal: 1, greater: 1 };
  var ESS_LATE = { perfect: 1, corrupted: 1 };

  function createEngine(DATA, PRICES) {
    var MODS = DATA.mods.map(function (r, i) {
      return { i: i, s: r[0], f: r[1], l: r[2], x: DATA.texts[r[3]], src: r[4], lich: r[5] || null };
    });
    var FAMS = DATA.fams.map(function (f, i) { return { i: i, s: f.s, g: f.g, t: f.t, c: f.c }; });
    var CLASS = {};
    DATA.classes.forEach(function (c) { CLASS[c.id] = c; });
    var BASE = {};
    DATA.bases.forEach(function (b) { BASE[b.n] = b; });
    var LEAGUE = 'fr';
    function setLeague(lg) { LEAGUE = lg === 'roa' ? 'roa' : 'fr'; }
    /* Cheapest first (unknown prices last), then the higher mod level. */
    function byPrice(list) {
      return list.slice().sort(function (a, b) {
        var pa = price(a.name, LEAGUE), pb = price(b.name, LEAGUE);
        if (pa === null && pb !== null) return 1;
        if (pb === null && pa !== null) return -1;
        if (pa !== null && pb !== null && pa !== pb) return pa - pb;
        return b.l - a.l;
      });
    }

    /* ---------- naming ---------- */
    function cleanLine(t) {
      return t.replace(/^\+?#%? ?/, '').replace(/^(to |increased |reduced |of )/i, '')
        .replace(/#%?/g, '').replace(/\s+/g, ' ').replace(/^\s*(to |increased )/i, '').trim();
    }
    function famName(f) {
      var fam = FAMS[f];
      var parts = fam.t.split(' / ').map(cleanLine);
      var s = parts.join(' + ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function modText(mi) { return MODS[mi].x; }

    /* ---------- catalog: what can roll on a base at an item level ---------- */
    var catCache = {};
    function catalog(baseName, ilvl) {
      var key = baseName + '|' + ilvl;
      if (catCache[key]) return catCache[key];
      var b = BASE[baseName];
      if (!b) return null;
      var cls = b.c;
      var byFam = new Map();
      function fam(f) {
        if (!byFam.has(f)) {
          byFam.set(f, { f: f, s: FAMS[f].s, t: FAMS[f].t, c: FAMS[f].c, name: famName(f), tiers: [], essence: [], alloy: [], lich: [] });
        }
        return byFam.get(f);
      }
      DATA.pools[b.p].forEach(function (mi) {
        var m = MODS[mi];
        if (m.l > ilvl) return;
        fam(m.f).tiers.push({ mi: mi, l: m.l });
      });
      DATA.ess.forEach(function (e) {
        var mi = e.m[cls];
        if (mi === undefined) return;
        if (mi === 'DEF3') mi = DATA.def68[String(b.p)];
        if (mi === undefined || mi === null) return;
        fam(MODS[mi].f).essence.push({ name: e.n, tier: e.tier, mi: mi, l: MODS[mi].l });
      });
      DATA.alloys.forEach(function (a) {
        var list = a.m[cls];
        if (!list || !list.length) return;
        var pick = null;
        list.forEach(function (mi) { if (MODS[mi].l <= ilvl && (!pick || MODS[mi].l > MODS[pick].l)) pick = mi; });
        if (pick === null) pick = list[0];
        fam(MODS[pick].f).alloy.push({ name: a.n, mi: pick, l: MODS[pick].l });
      });
      DATA.desec[b.p].forEach(function (mi) {
        var m = MODS[mi];
        if (!m.lich || m.l > Math.max(ilvl, 65)) return;
        fam(m.f).lich.push({ mi: mi, l: m.l, lich: m.lich });
      });
      var sides = [[], []];
      byFam.forEach(function (F) {
        F.tiers.sort(function (a, b) { return b.l - a.l; });
        F.tiers.forEach(function (t, i) { t.tier = i + 1; });
        F.rollable = F.tiers.length > 0;
        F.top = F.rollable ? F.tiers[0].mi : (F.alloy[0] || F.lich[0] || F.essence[0] || {}).mi;
        sides[F.s].push(F);
      });
      var order = ['Life', 'Mana & spirit', 'Defences', 'Resistances', 'Attributes', 'Damage', 'Critical', 'Speed', 'Spells', 'Skill levels', 'Minions & allies', 'Other'];
      sides.forEach(function (list) {
        list.sort(function (a, b) {
          var oa = order.indexOf(a.c), ob = order.indexOf(b.c);
          if (oa !== ob) return oa - ob;
          var ha = a.t.indexOf(' / ') > -1 ? 1 : 0, hb = b.t.indexOf(' / ') > -1 ? 1 : 0;
          return (b.rollable - a.rollable) || (ha - hb) || a.name.localeCompare(b.name);
        });
      });
      var caps = [3, 3];
      String(b.im || '').split('\n').forEach(function (line) {
        var mm = /^([+-]\d+) (Prefix|Suffix) Modifiers? allowed/.exec(line);
        if (mm) caps[mm[2] === 'Prefix' ? 0 : 1] += parseInt(mm[1], 10);
      });
      caps = caps.map(function (c) { return Math.max(0, c); });
      var cat = { base: b, cls: cls, ilvl: ilvl, sides: sides, byFam: byFam, caps: caps };
      catCache[key] = cat;
      return cat;
    }

    /* Options a target picker can offer for one family: rollable tiers plus special sources. */
    function tierOptions(cat, f) {
      var F = cat.byFam.get(f);
      if (!F) return [];
      var out = [];
      F.tiers.forEach(function (t) {
        var ess = F.essence.filter(function (e) { return e.mi === t.mi; }).map(function (e) { return e.name; });
        out.push({ mi: t.mi, l: t.l, label: 'T' + t.tier, kind: 'roll', ess: ess });
      });
      F.essence.forEach(function (e) {
        if (F.tiers.some(function (t) { return t.mi === e.mi; })) return;
        if (out.some(function (o) { return o.mi === e.mi; })) return;
        out.push({ mi: e.mi, l: e.l, label: 'Essence', kind: 'essence', ess: [e.name] });
      });
      F.alloy.forEach(function (a) { out.push({ mi: a.mi, l: a.l, label: 'Alloy', kind: 'alloy', src: a.name }); });
      F.lich.forEach(function (d) { out.push({ mi: d.mi, l: d.l, label: 'Desecrated', kind: 'lich', src: d.lich }); });
      return out;
    }

    /* How a target can be obtained on this base. */
    function methods(cat, t) {
      var F = cat.byFam.get(t.f);
      var m = { slam: false, essEarly: [], essLate: [], alloy: [], lich: [] };
      if (!F) return m;
      m.slam = F.tiers.some(function (x) { return x.l >= t.lv; });
      F.essence.forEach(function (e) {
        if (e.l < t.lv) return;
        if (ESS_EARLY[e.tier]) m.essEarly.push(e); else if (ESS_LATE[e.tier]) m.essLate.push(e);
      });
      F.alloy.forEach(function (a) { if (a.l >= t.lv) m.alloy.push(a); });
      F.lich.forEach(function (d) { if (d.l >= t.lv) m.lich.push(d); });
      m.essEarly = byPrice(m.essEarly); m.essLate = byPrice(m.essLate); m.alloy = byPrice(m.alloy);
      m.desec = m.slam || m.lich.length > 0;
      m.craftOnly = !m.slam && !m.lich.length && (m.essEarly.length + m.essLate.length + m.alloy.length) > 0;
      m.desecOnly = !m.slam && m.lich.length > 0 && !m.craftOnly;
      m.impossible = !m.slam && !m.lich.length && !m.essEarly.length && !m.essLate.length && !m.alloy.length;
      return m;
    }

    /* ---------- odds (every tier weighted equally: real spawn weights are not in the game data) ---------- */
    function weights(cat, sides, floor, exclude, withLich) {
      var total = 0, per = new Map();
      sides.forEach(function (s) {
        cat.sides[s].forEach(function (F) {
          if (exclude.has(F.f)) return;
          var elig = [];
          if (F.tiers.length) {
            elig = F.tiers.filter(function (t) { return t.l >= floor; });
            if (!elig.length) elig = [F.tiers[0]];
          }
          if (withLich) elig = elig.concat(F.lich);
          if (!elig.length) return;
          per.set(F.f, elig);
          total += elig.length;
        });
      });
      return { total: total, per: per };
    }
    function hitShare(W, targets) {
      if (!W.total) return 0;
      var h = 0;
      targets.forEach(function (t) {
        var e = W.per.get(t.f) || [];
        h += e.filter(function (x) { return x.l >= t.lv; }).length;
      });
      return h / W.total;
    }
    function oddsLabel(p) {
      if (p <= 0) return 'not possible here';
      if (p >= 0.995) return 'certain';
      if (p >= 0.5) return Math.round(p * 100) + '%';
      return '≈1 in ' + Math.max(2, Math.round(1 / p));
    }

    /* ---------- prices ---------- */
    function price(key, league) {
      var row = PRICES.p[key];
      if (!row) return null;
      var v = row[league === 'roa' ? 1 : 0];
      return v === null || v === undefined ? null : v;
    }
    function matsCost(mats, league) {
      var sum = 0, known = true;
      mats.forEach(function (m) {
        var v = price(m.k, league);
        if (v === null) known = false; else sum += v * (m.q || 1);
      });
      return { sum: sum, known: known };
    }

    /* Augment sockets: armour, weapons and off-hands except quivers, plus the few jewellery bases made for socketed items. */
    var SOCKET_CLS = /^(helmet|body|gloves|boots|shield|buckler|focus|wand|staff|sceptre|bow|crossbow|spear|mace1|mace2|qstaff|talisman)$/;
    function socketable(b) { return !!b && (SOCKET_CLS.test(b.c) || /Socketed Items/.test(b.im || '')); }

    /* ---------- state analysis ---------- */
    function targetsOf(design, st) {
      var skip = (st && st.skip) || {};
      return [0, 1].map(function (s) { return (design.targets[s] || []).filter(function (t) { return t && !skip[t.f]; }); });
    }
    function analyze(cat, design, st) {
      var T = targetsOf(design, st);
      var sides = [0, 1].map(function (s) {
        return { s: s, mods: [], hits: [], keeps: [], junk: [], low: [], unfilled: [], open: 0, removable: [], junkRem: [] };
      });
      st.mods.forEach(function (m) { sides[m.s].mods.push(m); });
      var present = new Set();
      st.mods.forEach(function (m) { if (m.mi !== null && m.mi !== undefined) present.add(MODS[m.mi].f); });
      sides.forEach(function (S) {
        var filled = new Set();
        S.mods.forEach(function (m) {
          var mod = (m.mi !== null && m.mi !== undefined) ? MODS[m.mi] : null;
          var t = mod ? T[S.s].find(function (x) { return x.f === mod.f; }) : null;
          var status;
          m.accepted = false;
          if (m.mark === 'junk') status = 'junk';
          else if (t && mod.l >= t.lv) { status = 'hit'; filled.add(t); }
          else if (t && m.mark === 'keep') { status = 'hit'; filled.add(t); m.accepted = true; }
          else if (m.mark === 'keep') status = 'keep';
          else if (t) status = 'low';
          else status = 'junk';
          m.status = status;
          if (status === 'hit') S.hits.push(m);
          else if (status === 'keep') S.keeps.push(m);
          else { S.junk.push(m); if (status === 'low') S.low.push(m); }
        });
        S.unfilled = T[S.s].filter(function (t) { return !filled.has(t); });
        var cap = st.rarity === 'magic' ? Math.min(1, cat.caps[S.s]) : cat.caps[S.s];
        S.open = Math.max(0, cap - S.mods.length);
        S.removable = S.mods.filter(function (m) { return !m.fract; });
        S.junkRem = S.junk.filter(function (m) { return !m.fract; });
      });
      /* One crafted modifier per item; Astrid's Creativity in a socket allows a second. */
      var crafted = st.mods.filter(function (m) { return m.crafted; }).length;
      var craftCap = design.astrid && socketable(cat.base) ? 2 : 1;
      return {
        T: T, sides: sides, present: present,
        craftedCount: crafted, craftCap: craftCap, craftedUsed: crafted >= craftCap,
        desecUsed: st.mods.some(function (m) { return m.desec; }),
        hits: sides[0].hits.length + sides[1].hits.length
      };
    }

    /* ---------- step builders ---------- */
    var uid = 0;
    function newId() { uid += 1; return 'm' + Date.now().toString(36) + uid; }
    function targetMod(t) { return { id: newId(), s: FAMS[t.f].s, mi: t.mi, mark: 'auto', est: true }; }

    function omenEx(s) { return { k: s ? 'o_dex_ex' : 'o_sin_ex', n: 'Omen of ' + HAND[s] + ' Exaltation' }; }
    function omenCr(s) { return { k: s ? 'o_dex_cr' : 'o_sin_cr', n: 'Omen of ' + HAND[s] + ' Crystallisation' }; }
    function omenNec(s) { return { k: s ? 'o_dex_nec' : 'o_sin_nec', n: 'Omen of ' + HAND[s] + ' Necromancy' }; }
    function omenAn(s) { return { k: s ? 'o_dex_an' : 'o_sin_an', n: 'Omen of ' + HAND[s] + ' Annulment' }; }
    function omenEr(s) { return { k: s ? 'o_dex_er' : 'o_sin_er', n: 'Omen of ' + HAND[s] + ' Erasure' }; }
    function an(w) { return (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w; }
    function list(names) {
      if (names.length <= 1) return names.join('');
      return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
    }
    function tName(t) { return famName(t.f); }

    function hardness(cat, A, t) {
      var W = weights(cat, [FAMS[t.f].s], 35, A.present, false);
      return hitShare(W, [t]);
    }

    function craftRoute(cat, t, st) {
      var m = methods(cat, t);
      if (st.rarity !== 'rare' && m.essEarly.length) return { t: t, via: 'essEarly', src: m.essEarly[0] };
      if (m.alloy.length) return { t: t, via: 'alloy', src: m.alloy[0] };
      if (m.essLate.length) return { t: t, via: 'essLate', src: m.essLate[0] };
      if (m.essEarly.length) return { t: t, via: 'essEarlyLost', src: m.essEarly[0] };
      return null;
    }
    /* The crafted-slot plan: the unfilled craft-only target to work on now, `next` for the one after it when the item
       has room for two crafted modifiers, and `extra` for the ones that can't fit. */
    function craftedPlan(cat, A, st) {
      if (A.craftedUsed) return null;
      var unfilled = A.sides[0].unfilled.concat(A.sides[1].unfilled);
      var only = unfilled.filter(function (t) { return methods(cat, t).craftOnly; });
      if (!only.length) return null;
      var room = A.craftCap - A.craftedCount;
      /* With room for two, an early essence goes first: it needs the item still magic. */
      if (room > 1 && st.rarity !== 'rare') {
        var early = only.filter(function (t) { return methods(cat, t).essEarly.length; })[0];
        if (early) only = [early].concat(only.filter(function (t) { return t !== early; }));
      }
      var cp = craftRoute(cat, only[0], st);
      if (!cp) return null;
      cp.next = only.slice(1, room).map(function (t) { return craftRoute(cat, t, { rarity: 'rare' }); });
      cp.extra = only.slice(room);
      return cp;
    }
    /* A target worth taking from a Greater (or lower) essence at the magic-to-rare step. Craft-only targets come
       first, so it only gets a crafted slot that's still free after them. */
    function essenceBonus(cat, A, st, cp) {
      if (A.craftedUsed || st.rarity !== 'magic') return null;
      var queued = cp ? [cp.t].concat(cp.next.map(function (r) { return r.t; })) : [];
      if (A.craftCap - A.craftedCount - queued.length < 1) return null;
      var best = null;
      [0, 1].forEach(function (s) {
        A.sides[s].unfilled.forEach(function (t) {
          if (queued.indexOf(t) > -1) return;
          var m = methods(cat, t);
          if (!m.essEarly.length) return;
          var h = hardness(cat, A, t);
          if (!best || h < best.h) best = { t: t, src: m.essEarly[0], h: h };
        });
      });
      return best;
    }
    function desecPlan(cat, A, cp) {
      if (A.desecUsed) return null;
      var cand = [];
      [0, 1].forEach(function (s) {
        A.sides[s].unfilled.forEach(function (t) {
          if (cp && cp.t === t) return;
          var m = methods(cat, t);
          if (m.desecOnly) cand.push({ t: t, only: true, h: 0 });
          else if (m.desec) cand.push({ t: t, only: false, h: hardness(cat, A, t) });
        });
      });
      if (!cand.length) return null;
      cand.sort(function (a, b) { return (b.only - a.only) || (a.h - b.h); });
      return cand[0];
    }

    function boneFor(cls) { return CLASS[cls].bone; }

    function makeOutcomesAdd(s, aims, others, removeId) {
      var all = aims.concat((others || []).filter(function (t) { return aims.indexOf(t) < 0; }));
      var outs = all.map(function (t) {
        var o = removeId ? { type: 'craft', remove: removeId, mods: [targetMod(t)] } : { type: 'add', mods: [targetMod(t)] };
        return { label: 'Got ' + tName(t), o: o, aim: aims.indexOf(t) >= 0 };
      });
      outs.push({ label: 'Something else', pick: { s: s, mark: 'auto', remove: removeId || null } });
      return outs;
    }

    /* ---------- the policy ---------- */
    function nextStep(design, st) {
      var cat = catalog(design.base, design.ilvl);
      var A = analyze(cat, design, st);
      var allUnfilled = A.sides[0].unfilled.concat(A.sides[1].unfilled);
      if (st.corrupted) {
        return { kind: 'stop', title: 'This item is corrupted', how: 'Corrupted items can’t be changed by crafting currency. Start a new base to keep crafting.', mats: [], outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }] };
      }
      if (!allUnfilled.length) return finishStep(design, st, A, cat);
      if (st.rarity === 'none') return baseStep(design, st, A, cat);
      var step = st.rarity === 'magic' ? magicStep(design, st, A, cat) : rareStep(design, st, A, cat);
      /* A second crafted modifier needs Astrid's Creativity socketed first, so it goes in right before that step. */
      if ((step.kind === 'craft' || step.kind === 'essence') && A.craftCap > 1 && A.craftedCount >= 1 && !(st.done && st.done.astrid)) return runeStep(step);
      return step;
    }

    function runeStep(then) {
      return {
        kind: 'rune', key: 'astrid', title: 'Socket Astrid’s Creativity',
        how: 'The next step adds a second crafted modifier, and the item only takes one unless Astrid’s Creativity is socketed. If it has no empty augment socket, add one with an Artificer’s Orb, then socket the rune. It can’t be taken out again, which is why it waits until now.',
        mats: [{ k: 'artificer', n: 'Artificer’s Orb', opt: true }, { k: 'Astrid\'s Creativity', n: 'Astrid’s Creativity' }],
        note: 'Next: ' + then.title.charAt(0).toLowerCase() + then.title.slice(1) + '.',
        outcomes: [{ label: 'Done', o: { type: 'finish', key: 'astrid' } }],
        project: { type: 'finish', key: 'astrid' }
      };
    }

    function needIlvl(design, cat) {
      var lv = cat.base.lv;
      targetsOf(design, null).forEach(function (side) {
        side.forEach(function (t) { if (methods(cat, t).slam) lv = Math.max(lv, t.lv); });
      });
      return lv;
    }

    function baseStep(design, st, A, cat) {
      var cp = craftedPlan(cat, A, st);
      var picks = [null, null], sacrifice = null;
      var needsSacrifice = cp && (cp.via === 'alloy' || cp.via === 'essLate');
      var xSide = needsSacrifice ? 1 - FAMS[cp.t.f].s : -1;
      /* The target an essence will add at the magic-to-rare step stays off the base. */
      var essB = cp && cp.via === 'essEarly' ? null : essenceBonus(cat, A, { rarity: 'magic' }, cp);
      [0, 1].forEach(function (s) {
        if (s === xSide) { sacrifice = s; return; }
        var cands = A.sides[s].unfilled.filter(function (t) {
          if (cp && cp.t === t) return false;
          if (essB && essB.t === t) return false;
          return methods(cat, t).slam;
        });
        cands.sort(function (a, b) { return hardness(cat, A, a) - hardness(cat, A, b); });
        if (cands.length) picks[s] = cands[0];
      });
      var ilvl = needIlvl(design, cat);
      var parts = [];
      if (picks[0]) parts.push(tName(picks[0]) + ' (' + labelTier(cat, picks[0]) + '+)');
      if (picks[1]) parts.push(tName(picks[1]) + ' (' + labelTier(cat, picks[1]) + '+)');
      var sacText = sacrifice !== null ? ' Any ' + SIDE[sacrifice] + ' is fine on the other side: it becomes the junk the ' + cp.src.name + ' deletes later.' : '';
      var mods = [];
      if (picks[0]) mods.push(targetMod(picks[0]));
      if (picks[1]) mods.push(targetMod(picks[1]));
      if (sacrifice !== null) mods.push({ id: newId(), s: sacrifice, mi: null, pseudo: 'any', mark: 'junk' });
      var rollW = weights(cat, [0, 1], 70, new Set(), false);
      var pRoll = 0;
      var aimList = picks.filter(Boolean);
      if (aimList.length) pRoll = hitShare(rollW, [aimList[0]]);
      var how = 'Buy a magic ' + cat.base.n + ' at item level ' + ilvl + ' or higher' + (parts.length ? ' with ' + parts.join(' and ') : '') + '.' + sacText +
        ' Magic bases are cheap on trade. To roll one yourself, use a Perfect Orb of Transmutation (it only rolls top tiers) and a Greater Orb of Augmentation on normal bases until one hits.';
      var spec = [{ k: 'Base', v: cat.base.n }, { k: 'Item level', v: ilvl + '+' },
        { k: 'Prefix', v: picks[0] ? tName(picks[0]) + ' ' + labelTier(cat, picks[0]) + '+' : (sacrifice === 0 ? 'anything (sacrifice)' : 'empty or anything') },
        { k: 'Suffix', v: picks[1] ? tName(picks[1]) + ' ' + labelTier(cat, picks[1]) + '+' : (sacrifice === 1 ? 'anything (sacrifice)' : 'empty or anything') }];
      return {
        kind: 'base', title: 'Get a magic base', how: how, spec: spec,
        mats: [{ k: 'ptrans', n: 'Perfect Orb of Transmutation', opt: true }, { k: 'gaug', n: 'Greater Orb of Augmentation', opt: true }],
        odds: aimList.length ? { p: pRoll, what: 'per Perfect Transmute, for ' + tName(aimList[0]) } : null,
        note: ilvl > cat.base.lv ? 'Item level ' + ilvl + ' is what your highest target tier needs.' : null,
        outcomes: [{ label: 'Got the base', o: { type: 'setBase', mods: mods } }, { label: 'My base has other mods', edit: true }],
        project: { type: 'setBase', mods: mods }
      };
    }

    function labelTier(cat, t) {
      var F = cat.byFam.get(t.f);
      if (!F) return '';
      var tt = F.tiers.find(function (x) { return x.mi === t.mi; });
      if (tt) return 'T' + tt.tier;
      if (F.alloy.some(function (a) { return a.mi === t.mi; })) return 'alloy';
      if (F.lich.some(function (a) { return a.mi === t.mi; })) return 'desecrated';
      return 'essence';
    }

    function magicStep(design, st, A, cat) {
      var cp = craftedPlan(cat, A, st);
      var needsSacrifice = cp && (cp.via === 'alloy' || cp.via === 'essLate');
      var xSide = needsSacrifice ? 1 - FAMS[cp.t.f].s : -1;
      /* The essence that will make it rare, if any: its target is guaranteed, so augments don't aim at it. */
      var eb = cp && cp.via === 'essEarly' ? { t: cp.t, src: cp.src } : essenceBonus(cat, A, st, cp);
      // junk on a side that should hold a target: the base missed
      for (var s = 0; s < 2; s++) {
        var S = A.sides[s];
        if (S.junk.length && s !== xSide && S.unfilled.some(function (t) { return t !== (cp && cp.t); })) {
          var bad = S.junk[0];
          return {
            kind: 'fixMagic', title: 'This base missed on the ' + SIDE[s],
            how: 'A magic item holds one prefix and one suffix, so this ' + SIDE[s] + ' blocks a target. A new base is usually the cheapest fix. An Orb of Annulment removes one of the two mods at random (50%).',
            mats: [{ k: 'annul', n: 'Orb of Annulment', opt: true }],
            odds: { p: 1 / Math.max(1, A.sides[0].mods.length + A.sides[1].mods.length), what: 'for the Annulment to hit it' },
            outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }, { label: 'Annul removed it', o: { type: 'remove', id: bad.id } }, { label: 'Annul removed the other mod', edit: true }],
            project: { type: 'restart' }
          };
        }
      }
      // empty side on a magic item: augment
      for (var s2 = 0; s2 < 2; s2++) {
        var S2 = A.sides[s2];
        if (S2.mods.length === 0) {
          if (s2 === xSide) {
            var mod = { id: newId(), s: s2, mi: null, pseudo: 'any', mark: 'junk' };
            return {
              kind: 'aug', side: s2, title: 'Add a ' + SIDE[s2] + ' to sacrifice',
              how: 'Use an Orb of Augmentation. Any ' + SIDE[s2] + ' works: the ' + cp.src.name + ' will delete it later.',
              mats: [{ k: 'aug', n: 'Orb of Augmentation' }],
              outcomes: [{ label: 'Done', o: { type: 'add', mods: [mod] } }],
              project: { type: 'add', mods: [mod] }
            };
          }
          var aims = S2.unfilled.filter(function (t) { return methods(cat, t).slam && !(cp && cp.t === t) && !(eb && eb.t === t); });
          if (aims.length) {
            var Wg = weights(cat, [s2], 44, A.present, false), Wp = weights(cat, [s2], 70, A.present, false);
            var pg = hitShare(Wg, aims), pp = hitShare(Wp, aims);
            var best = aims.slice().sort(function (a, b) { return hitShare(Wg, [b]) - hitShare(Wg, [a]); })[0];
            return {
              kind: 'aug', side: s2, title: 'Add the ' + SIDE[s2],
              how: 'Use a Greater Orb of Augmentation' + (pp > pg * 1.4 ? ' (a Perfect one only rolls top tiers: ' + oddsLabel(pp) + ')' : '') + '. Aim: ' + list(aims.map(tName)) + '.',
              mats: [{ k: 'gaug', n: 'Greater Orb of Augmentation' }],
              odds: { p: pg, what: 'to hit ' + (aims.length > 1 ? 'one of them' : tName(aims[0])) },
              note: 'If it misses, a new base is cheaper than fixing this one.',
              outcomes: makeOutcomesAdd(s2, aims, S2.unfilled),
              project: { type: 'add', mods: [targetMod(best)] }
            };
          }
        }
      }
      // upgrade to rare
      if (eb) {
        var em = { id: newId(), s: FAMS[eb.t.f].s, mi: eb.src.mi, mark: 'auto', crafted: true };
        return {
          kind: 'essence', title: 'Make it rare with an essence',
          how: 'Use ' + an(eb.src.name) + ' on the magic item. It turns rare and adds ' + MODS[eb.src.mi].x + ' for certain. ' +
            (A.craftCap > 1 ? 'This is the first of your two crafted modifiers.' : 'This uses your one crafted modifier.'),
          mats: [{ k: eb.src.name, n: eb.src.name }],
          odds: { p: 1, what: 'guaranteed' },
          outcomes: [{ label: 'Done', o: { type: 'rare', mods: [em] } }],
          project: { type: 'rare', mods: [em] }
        };
      }
      var aimsR = [];
      [0, 1].forEach(function (s) { A.sides[s].unfilled.forEach(function (t) { if (methods(cat, t).slam && !(cp && cp.t === t)) aimsR.push(t); }); });
      var Wr = weights(cat, [0, 1], 50, A.present, false);
      var pr = hitShare(Wr, aimsR);
      var outs = aimsR.map(function (t) { return { label: 'Got ' + tName(t), o: { type: 'rare', mods: [targetMod(t)] } }; });
      outs.push({ label: 'Something else (prefix)', pick: { s: 0, mark: 'auto', rare: true } });
      outs.push({ label: 'Something else (suffix)', pick: { s: 1, mark: 'auto', rare: true } });
      /* Happy path: the Regal lands the likeliest target, kept off the side that holds the sacrifice. */
      var projAims = needsSacrifice ? aimsR.filter(function (t) { return FAMS[t.f].s !== xSide; }) : aimsR;
      var bestR = projAims.slice().sort(function (a, b) { return hitShare(Wr, [b]) - hitShare(Wr, [a]); })[0];
      var proj = { type: 'rare', mods: bestR ? [targetMod(bestR)] : [] };
      return {
        kind: 'regal', title: 'Make it rare',
        how: 'Use a Perfect Regal Orb. It makes the item rare and adds one random mod at mod level 50 or higher.' + (aimsR.length ? ' Hoping for ' + list(aimsR.map(tName)) + '.' : ''),
        mats: [{ k: 'pregal', n: 'Perfect Regal Orb' }],
        odds: aimsR.length ? { p: pr, what: 'to add a target' } : null,
        note: needsSacrifice ? 'Whatever it adds is fine. Junk on the ' + SIDE[xSide] + ' side is the sacrifice for the ' + cp.src.name + '.' : 'A miss isn’t fatal: tell the planner what landed and it will route around it.',
        outcomes: outs,
        project: proj
      };
    }

    function rareStep(design, st, A, cat) {
      var cp = craftedPlan(cat, A, st);
      var dp = desecPlan(cat, A, cp);
      var warn = [];
      if (cp && cp.extra && cp.extra.length) {
        warn.push((A.craftCap > 1 ? 'Two crafted modifiers fit with Astrid’s Creativity' : 'Only one crafted modifier fits on an item') + ', so ' + list(cp.extra.map(tName)) + ' can’t also be added.' +
          (A.craftCap < 2 && socketable(cat.base) ? ' Astrid’s Creativity, a rune, allows a second one.' : ''));
      }
      if (cp && cp.via === 'essEarlyLost') warn.push(tName(cp.t) + ' at this tier only comes from a ' + cp.src.name + ', which needs a magic item. Start a new base to get it.');

      // 0) a removal will be needed later anyway: if starting over is the cheaper fix, say so before spending more
      {
        var deficit = [0, 1].map(function (x) { return A.sides[x].unfilled.length - A.sides[x].open; });
        if (cp && (cp.via === 'alloy' || cp.via === 'essLate')) {
          var Xd = [0, 1].filter(function (x) { return A.sides[x].junkRem.length; }).sort(function (a, b) { return deficit[b] - deficit[a]; })[0];
          if (Xd !== undefined) deficit[Xd] -= 1;
        }
        var doomed = [0, 1].find(function (x) { return deficit[x] > 0 && A.sides[x].junkRem.length; });
        if (doomed !== undefined) {
          var early = removalStep(design, st, A, cat, doomed, warn);
          if (early.recommended === 'restart') return early;
        }
      }

      // 1) crafted step that deletes a mod
      if (cp && (cp.via === 'alloy' || cp.via === 'essLate')) {
        var yc = FAMS[cp.t.f].s;
        var cands = [];
        [0, 1].forEach(function (X) {
          var S = A.sides[X];
          if (!S.junkRem.length) return;
          var roomAfter = A.sides[yc].open + (X === yc ? 1 : 0);
          if (roomAfter < 1) return;
          cands.push({ X: X, p: S.junkRem.length / S.removable.length });
        });
        cands.sort(function (a, b) { return b.p - a.p || (a.X === yc) - (b.X === yc); });
        if (cands.length) {
          var c = cands[0];
          var S = A.sides[c.X];
          var newMod = { id: newId(), s: yc, mi: cp.src.mi, mark: 'auto', crafted: true };
          var outs = S.removable.map(function (m) {
            return { label: 'It deleted ' + modLabel(m), o: { type: 'craft', remove: m.id, mods: [newMod] }, bad: m.status === 'hit' || m.status === 'keep' };
          });
          outs.sort(function (a, b) { return a.bad - b.bad; });
          var how = 'Activate ' + omenCr(c.X).n + ', then use the ' + cp.src.name + '. It deletes a random ' + SIDE[c.X] + ' and adds ' + MODS[cp.src.mi].x + ' as a ' + SIDE[yc] + '.';
          var note = c.p >= 0.995 ? 'Every ' + SIDE[c.X] + ' on the item is junk, so the deletion can only hit junk.' :
            'The ' + SIDE[c.X] + ' side also holds ' + list(S.removable.filter(function (m) { return m.status !== 'junk' && m.status !== 'low'; }).map(modLabel)) + ', so this can delete a good mod. If it does, tell the planner and it will re-route.';
          return {
            kind: 'craft', side: c.X, title: 'Add ' + tName(cp.t) + ' with the ' + cp.src.name, how: how,
            mats: [omenCr(c.X), { k: cp.src.name, n: cp.src.name }],
            odds: { p: c.p, what: 'that the deletion hits junk' }, note: note, warn: warn,
            outcomes: outs,
            project: { type: 'craft', remove: S.junkRem[0].id, mods: [newMod] }
          };
        }
        // no junk yet: make a sacrifice for it to delete, on a side that holds nothing worth keeping when there is one
        var X2 = 1 - yc;
        var clean = function (x) { return !A.sides[x].mods.some(function (m) { return m.status === 'hit' || m.status === 'keep'; }); };
        var bothOpen = A.sides[X2].open > 0 && A.sides[yc].open > 0;
        var sx = bothOpen && clean(X2) ? X2 : (A.sides[yc].open > 0 && clean(yc)) ? yc : bothOpen ? X2 : null;
        if (sx !== null) {
          var same = sx === yc;
          var aims2 = A.sides[sx].unfilled.filter(function (t) { return methods(cat, t).slam && !(dp && dp.t === t); });
          var W2 = weights(cat, [sx], 0, A.present, false);
          var pHit = hitShare(W2, aims2);
          var junkMod = { id: newId(), s: sx, mi: null, pseudo: 'any', mark: 'junk' };
          var o2 = aims2.map(function (t) { return { label: 'Got ' + tName(t) + ' (keep it)', o: { type: 'add', mods: [targetMod(t)] } }; });
          o2.unshift({ label: 'Got junk (good)', o: { type: 'add', mods: [junkMod] } });
          o2.push({ label: 'Pick what landed', pick: { s: sx, mark: 'auto' } });
          return {
            kind: 'sacrifice', side: sx, title: 'Add a ' + SIDE[sx] + ' to sacrifice',
            how: 'The ' + cp.src.name + ' always deletes a random mod, so give it junk to delete first' +
              (same ? ': a junk ' + SIDE[yc] + ', because the ' + SIDE[X2] + ' side ' + (A.sides[X2].open > 0 ? 'holds mods you want to keep' : 'is full') + '. The ' + cp.src.name + ' then takes its place' : '') +
              '. Activate ' + omenEx(sx).n + ' and use a plain Exalted Orb. Junk is the result you want here.',
            mats: [omenEx(sx), { k: 'exalt', n: 'Exalted Orb' }],
            odds: { p: 1 - pHit, what: 'to land junk' },
            note: aims2.length ? 'If it lands ' + list(aims2.map(tName)) + (same ? ' instead, keep it and tell the planner: it will find another way to fit the ' + cp.src.name + '.' : ', keep it and add another sacrifice.') : null,
            warn: warn, outcomes: o2,
            project: { type: 'add', mods: [junkMod] }
          };
        }
        if (A.sides[yc].open < 1) {
          // crafted side full: the in-place craft must delete something on that side
          var Sy = A.sides[yc];
          var newMod2 = { id: newId(), s: yc, mi: cp.src.mi, mark: 'auto', crafted: true };
          return {
            kind: 'craft', side: yc, title: 'Add ' + tName(cp.t) + ' with the ' + cp.src.name,
            how: 'The ' + SIDE[yc] + ' side is full and holds no junk, so the ' + cp.src.name + ' (with ' + omenCr(yc).n + ') will delete one of your ' + SIDE[yc] + 'es to make room.',
            mats: [omenCr(yc), { k: cp.src.name, n: cp.src.name }],
            odds: { p: 0, what: 'to keep every ' + SIDE[yc] }, warn: warn,
            note: 'You’ll re-slam whichever mod it deletes.',
            outcomes: Sy.removable.map(function (m) { return { label: 'It deleted ' + modLabel(m), o: { type: 'craft', remove: m.id, mods: [newMod2] } }; }),
            project: Sy.removable.length ? { type: 'craft', remove: Sy.removable[Sy.removable.length - 1].id, mods: [newMod2] } : null
          };
        }
      }

      // 2) blocked: more targets than open slots on a side
      var blocked = null;
      [0, 1].forEach(function (s) {
        var S = A.sides[s];
        var need = S.unfilled.filter(function (t) { return !(cp && cp.t === t && FAMS[t.f].s === s && cp.inPlace); }).length;
        var lowBlock = S.low.length > 0 && S.unfilled.some(function (t) { return S.low.some(function (m) { return MODS[m.mi].f === t.f; }); });
        if ((need > S.open || lowBlock) && S.junkRem.length && !blocked) blocked = { s: s, need: need };
      });
      if (blocked) return removalStep(design, st, A, cat, blocked.s, warn);

      // 3) slams
      var slamSides = [0, 1].map(function (s) {
        var S = A.sides[s];
        var reserve = 0;
        if (dp && FAMS[dp.t.f].s === s) reserve += 1;
        if (cp) [cp].concat(cp.next).forEach(function (r) { if (r && FAMS[r.t.f].s === s && (r.via === 'alloy' || r.via === 'essLate')) reserve += 1; });
        var aims = S.unfilled.filter(function (t) { return methods(cat, t).slam && !(cp && cp.t === t) && !(dp && dp.t === t); });
        var slots = S.open - reserve;
        var W = weights(cat, [s], 35, A.present, false);
        return { s: s, aims: aims, slots: slots, p: hitShare(W, aims), W: W };
      }).filter(function (x) { return x.aims.length && x.slots > 0; });
      if (slamSides.length) {
        slamSides.sort(function (a, b) { return a.p - b.p; });
        var Z = slamSides[0];
        var Wp = weights(cat, [Z.s], 50, A.present, false);
        var pp = hitShare(Wp, Z.aims);
        var usePerfect = false;
        var best = Z.aims.slice().sort(function (a, b) { return hitShare(Z.W, [b]) - hitShare(Z.W, [a]); })[0];
        var two = Z.slots >= 2 && Z.aims.length >= 2;
        var how = 'Activate ' + omenEx(Z.s).n + ', then use a Greater Exalted Orb. Aim: ' + list(Z.aims.map(tName)) + '.';
        if (two) how += ' Add an Omen of Greater Exaltation to put two ' + SIDE[Z.s] + 'es on at once.';
        var missNote;
        var cleanup = A.desecUsed ? null : 'the desecration';
        if (A.hits <= 2) missNote = 'A miss this early is cheap to walk away from: a new base costs less than fixing junk.';
        else missNote = 'If it misses, tell the planner what landed. It will weigh fixing it against carrying on.';
        return {
          kind: 'slam', side: Z.s, title: 'Add a ' + SIDE[Z.s], how: how,
          mats: [omenEx(Z.s), { k: usePerfect ? 'pexalt' : 'gexalt', n: (usePerfect ? 'Perfect' : 'Greater') + ' Exalted Orb' }].concat(two ? [{ k: 'o_gr_ex', n: 'Omen of Greater Exaltation', opt: true }] : []),
          odds: { p: usePerfect ? pp : Z.p, what: 'to hit ' + (Z.aims.length > 1 ? 'one of them' : tName(Z.aims[0])), alt: usePerfect ? null : (pp > Z.p * 1.15 ? { label: 'Perfect Exalted Orb', p: pp } : null) },
          note: missNote, warn: warn,
          outcomes: makeOutcomesAdd(Z.s, Z.aims, A.sides[Z.s].unfilled),
          project: { type: 'add', mods: [targetMod(best)] }
        };
      }

      // 4) desecration for the last open target
      if (dp && A.sides[FAMS[dp.t.f].s].open > 0) {
        return desecStep(design, st, A, cat, dp, warn);
      }

      // 5) still unfilled but no open route: removal or acceptance
      var sideWithJunk = [0, 1].find(function (s) { return A.sides[s].unfilled.length && A.sides[s].junkRem.length; });
      if (sideWithJunk !== undefined) return removalStep(design, st, A, cat, sideWithJunk, warn);
      var left = A.sides[0].unfilled.concat(A.sides[1].unfilled);
      return {
        kind: 'stop', title: 'No route left for ' + list(left.map(tName)),
        how: 'The slots are taken by mods you want to keep, and the crafted and desecrated slots are used. Change a target, mark a mod as junk, or start a new base.',
        mats: [], warn: warn,
        outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }].concat(left.map(function (t) { return { label: 'Skip ' + tName(t), o: { type: 'skip', f: t.f } }; }))
      };
    }

    function modLabel(m) {
      if (m.pseudo) return 'the junk ' + SIDE[m.s];
      return famName(MODS[m.mi].f);
    }

    function desecStep(design, st, A, cat, dp, warn) {
      var ds = FAMS[dp.t.f].s;
      var bone = boneFor(cat.cls);
      var lg = design.league || LEAGUE;
      var F = cat.byFam.get(dp.t.f);
      var lm = F && F.lich.find(function (d) { return d.mi === dp.t.mi; });
      var lichName = lm ? lm.lich : null;
      var lichOmen = lichName && /^(ring|amulet|belt|wand|staff|sceptre|bow|crossbow|spear|mace1|mace2|qstaff|talisman|quiver)$/.test(cat.cls)
        ? { k: lichName === 'Ulaman' ? 'o_sov' : lichName === 'Amanamu' ? 'o_liege' : 'o_black', n: 'Omen of the ' + (lichName === 'Ulaman' ? 'Sovereign' : lichName === 'Amanamu' ? 'Liege' : 'Blackblooded') } : null;
      var retry = (price('o_light', lg) || 7) + (price('annul', lg) || 0.5);
      function option(kind) {
        var boneName = kind + ' ' + bone;
        var floor = kind === 'Ancient' ? 40 : 0;
        var W = lichOmen ? { total: 0, per: new Map() } : weights(cat, [ds], floor, A.present, true);
        if (lichOmen) {
          // a lich omen limits the reveal to that lich's mods
          var n = 0, per = new Map();
          cat.sides[ds].forEach(function (Fm) {
            var l = Fm.lich.filter(function (d) { return d.lich === lichName; });
            if (l.length && !A.present.has(Fm.f)) { per.set(Fm.f, l); n += l.length; }
          });
          W = { total: n, per: per };
        }
        var q = hitShare(W, [dp.t]);
        var p3 = 1 - Math.pow(1 - q, 3), p6 = 1 - Math.pow(1 - q, 6);
        var mats = [omenNec(ds), { k: boneName, n: boneName }, { k: 'o_echo', n: 'Omen of Abyssal Echoes' }];
        if (lichOmen) mats.splice(1, 0, lichOmen);
        var a = matsCost(mats, lg).sum;
        var exp = p6 > 0 ? a + (1 / p6 - 1) * (a + retry) : Infinity;
        return { kind: kind, boneName: boneName, mats: mats, p3: p3, p6: p6, cost: a, exp: exp };
      }
      var pres = option('Preserved'), anc = option('Ancient');
      var pick = anc.exp < pres.exp * 0.9 ? anc : pres;
      var other = pick === anc ? pres : anc;
      var dm = { id: newId(), s: ds, mi: dp.t.mi, mark: 'auto', desec: true };
      var how = 'Activate ' + omenNec(ds).n + (lichOmen ? ', ' + lichOmen.n : '') + ' and Omen of Abyssal Echoes, then use ' + an(pick.boneName) + '. At the Well of Souls, choose ' + tName(dp.t) + ' if it’s offered. Echoes lets you reroll the three options once.';
      var note = (pick === anc ? 'An Ancient bone only offers mod level 40+, so the right tier shows up more often (' + oddsLabel(anc.p6) + ' vs ' + oddsLabel(pres.p6) + ' with a Preserved one).'
        : 'A Preserved bone is the better deal here' + (anc.p6 > pres.p6 ? ' (an Ancient one: ' + oddsLabel(anc.p6) + ', but it costs far more)' : '') + '.') +
        ' If nothing fits, pick the least bad option. Omen of Light with an Orb of Annulment removes only the desecrated mod so you can try again.';
      var others = A.sides[ds].unfilled.filter(function (t) { return t !== dp.t; });
      var outs = [{ label: 'Picked ' + tName(dp.t), o: { type: 'add', mods: [dm] }, aim: true }];
      others.forEach(function (t) { outs.push({ label: 'Picked ' + tName(t), o: { type: 'add', mods: [{ id: newId(), s: ds, mi: t.mi, mark: 'auto', desec: true }] } }); });
      outs.push({ label: 'Picked something else', pick: { s: ds, mark: 'auto', desec: true } });
      return {
        kind: 'desec', side: ds, title: 'Pick the last ' + SIDE[ds] + ' at the Well of Souls', how: how,
        mats: pick.mats, odds: { p: pick.p6, what: 'to be offered ' + tName(dp.t) + ' (' + oddsLabel(pick.p3) + ' without the reroll)' },
        note: note, warn: warn, outcomes: outs, project: { type: 'add', mods: [dm] }
      };
    }

    function removalStep(design, st, A, cat, s, warn) {
      var S = A.sides[s];
      var lg = design.league || LEAGUE;
      var options = [];
      function lvl(m) { return m.pseudo ? 999 : MODS[m.mi].l; }
      function isJunk(m) { return (m.status === 'junk' || m.status === 'low') && !m.fract; }
      var aims = S.unfilled.filter(function (t) { return methods(cat, t).slam; });
      var best = aims.slice().sort(function (a, b) { return hardness(cat, A, b) - hardness(cat, A, a); })[0];
      var dj = S.junkRem.find(function (m) { return m.desec; });
      if (dj) {
        options.push({ key: 'light', label: 'Omen of Light + Orb of Annulment', mats: [{ k: 'o_light', n: 'Omen of Light' }, { k: 'annul', n: 'Orb of Annulment' }], p: 1,
          text: 'Removes only the desecrated mod (' + modLabel(dj) + '), and you can desecrate again.',
          outcomes: [{ label: 'Removed it', o: { type: 'remove', id: dj.id } }], project: { type: 'remove', id: dj.id } });
      }
      if (S.junkRem.length) {
        var pa = S.junkRem.length / S.removable.length;
        options.push({ key: 'annul', label: omenAn(s).n + ' + Orb of Annulment', mats: [omenAn(s), { k: 'annul', n: 'Orb of Annulment' }], p: pa,
          text: pa >= 0.995 ? 'Every ' + SIDE[s] + ' you could lose is junk, so this can only remove junk and frees the slot.' : 'Removes a random ' + SIDE[s] + ' and frees the slot: ' + oddsLabel(pa) + ' that it’s junk.',
          outcomes: S.removable.map(function (m) { return { label: 'Removed ' + modLabel(m), o: { type: 'remove', id: m.id }, bad: !isJunk(m) }; }).sort(function (a, b) { return a.bad - b.bad; }),
          project: { type: 'remove', id: S.junkRem[0].id } });
      }
      var real = st.mods.filter(function (m) { return !m.pseudo; });
      if (real.length) {
        var lowAll = real.slice().sort(function (a, b) { return lvl(a) - lvl(b); })[0];
        var lowSide = real.filter(function (m) { return m.s === s; }).sort(function (a, b) { return lvl(a) - lvl(b); })[0];
        var other = A.sides[1 - s];
        var addSides = other.open > 0 ? [0, 1] : [s];
        var Wc = weights(cat, addSides, 0, A.present, false);
        var pc = hitShare(Wc, aims);
        var where = addSides.length > 1 ? 'a random mod (prefix or suffix)' : 'a random ' + SIDE[s];
        var proj = function (id) { return best ? { type: 'craft', remove: id, mods: [targetMod(best)] } : { type: 'remove', id: id }; };
        var tie = function (m) { return real.filter(function (x) { return x !== m && lvl(x) === lvl(m); }).length > 0; };
        if (lowAll && lowAll.s === s && isJunk(lowAll) && !tie(lowAll)) {
          options.push({ key: 'whittle', label: 'Omen of Whittling + Chaos Orb', mats: [{ k: 'o_whit', n: 'Omen of Whittling' }, { k: 'chaos', n: 'Chaos Orb' }], p: 1, swap: true, pAdd: pc,
            text: modLabel(lowAll) + ' has the lowest item level on the item, so Whittling removes it for certain. The Chaos Orb then adds ' + where + ' in its place (' + oddsLabel(pc) + ' to hit a target), so the slot is rerolled rather than freed.',
            outcomes: makeOutcomesAdd(s, aims, S.unfilled, lowAll.id), project: proj(lowAll.id) });
        } else if (lowSide && isJunk(lowSide) && !tie(lowSide)) {
          options.push({ key: 'whittleE', label: 'Whittling + ' + omenEr(s).n + ' + Chaos Orb', mats: [{ k: 'o_whit', n: 'Omen of Whittling' }, omenEr(s), { k: 'chaos', n: 'Chaos Orb' }], p: 1, swap: true, pAdd: pc,
            text: modLabel(lowSide) + ' is the lowest-level ' + SIDE[s] + '. Erasure keeps the Chaos Orb on the ' + SIDE[s] + ' side and Whittling takes the lowest level there, so it goes for certain. The Chaos Orb adds ' + where + ' in its place (' + oddsLabel(pc) + ' to hit a target).',
            outcomes: makeOutcomesAdd(s, aims, S.unfilled, lowSide.id), project: proj(lowSide.id) });
        }
      }
      var hardest = S.unfilled.slice().sort(function (a, b) { return hardness(cat, A, a) - hardness(cat, A, b); })[0];
      if (hardest) {
        options.push({ key: 'settle', label: 'Skip ' + tName(hardest), mats: [], p: 1,
          text: 'Keep the junk and finish without ' + tName(hardest) + '. Costs nothing, and you can bring it back later.',
          outcomes: [{ label: 'Skip ' + tName(hardest), o: { type: 'skip', f: hardest.f } }], project: { type: 'skip', f: hardest.f } });
      }
      options.push({ key: 'restart', label: 'Start a new base', mats: [], p: 1, text: 'Throws this item away. Often the cheapest fix while only one or two of your mods are on it.',
        outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }], project: { type: 'restart' } });
      /* Rough average spend to make progress: certain fixes cost their price; a random removal pays again on misses
         plus about 20 div to re-add a good mod it takes; a Chaos reroll pays until it lands a target. */
      options.forEach(function (op) {
        op.cost = matsCost(op.mats, lg).sum;
        if (!op.mats.length) op.exp = 0;
        else if (op.swap) op.exp = op.cost / Math.max(op.pAdd, 0.001);
        else op.exp = op.cost / Math.max(op.p, 0.01) + (1 - op.p) / Math.max(op.p, 0.01) * 20;
      });
      function find(k) { return options.find(function (op) { return op.key === k; }); }
      var paid = options.filter(function (op) { return op.mats.length; }).sort(function (a, b) { return a.exp - b.exp; });
      var best0 = paid[0];
      var rec, why;
      /* One mod on the item: a new base is cheaper than any removal. Two or more: fix it unless every fix is very dear. */
      if (best0 && (A.hits >= 2 || best0.exp <= 2) && best0.exp <= 50) { rec = best0; why = 'fix'; }
      else if (A.hits <= 1) { rec = find('restart'); why = 'restart'; }
      else { rec = find('settle') || find('restart'); why = 'settle'; }
      options.sort(function (a, b) {
        if (a === rec) return -1;
        if (b === rec) return 1;
        return (a.mats.length ? a.exp : 1e9) - (b.mats.length ? b.exp : 1e9);
      });
      var named = [], seenN = {}, anon = 0;
      S.junkRem.forEach(function (m) { if (m.pseudo) anon += 1; else { var n = modLabel(m); if (!seenN[n]) { seenN[n] = 1; named.push(n); } } });
      if (anon) named.push(anon === 1 ? (named.length ? 'a junk ' + SIDE[s] : 'a junk ' + SIDE[s]) : anon + ' junk ' + SIDE[s] + 'es');
      var junkNames = named;
      return {
        kind: 'remove', side: s, title: 'Make room on the ' + SIDE[s] + ' side',
        how: list(S.unfilled.map(tName)) + (S.unfilled.length > 1 ? ' still need' : ' still needs') + ' a slot, but the ' + SIDE[s] + ' slots are taken' + (junkNames.length ? ' by junk: ' + list(junkNames) + '.' : '.'),
        mats: rec.mats, odds: rec.mats.length ? { p: rec.swap ? rec.pAdd : rec.p, what: rec.swap ? 'to reroll it into a target' : 'to remove junk' } : null,
        options: options, recommended: rec.key, warn: warn,
        note: why === 'restart' ? 'With ' + (A.hits ? 'only one' : 'none') + ' of your mods on the item, a new base costs less than any fix here' + (best0 ? ' (the cheapest averages ' + approx(best0.exp) + ')' : '') + '. Every option is still open.'
          : why === 'settle' ? 'Every fix here averages more than 50 div' + (best0 ? ' (the cheapest: ' + approx(best0.exp) + ')' : '') + ', so skipping one target is the practical call. The other options are still listed.'
          : 'The cheapest fix averages ' + approx(best0.exp) + '. Starting over would mean rolling the ' + A.hits + ' mods you have again, with the same chance of junk, so fixing it is usually the better bet.',
        outcomes: rec.outcomes, project: rec.project
      };
    }

    function approx(v) { return v >= 10 ? 'about ' + Math.round(v) + ' div' : v >= 1 ? 'about ' + (Math.round(v * 10) / 10) + ' div' : 'under 1 div'; }

    function finishStep(design, st, A, cat) {
      var done = st.done || {};
      var cls = cat.cls;
      var armour = /^(helmet|body|gloves|boots|shield|buckler|focus)$/.test(cls);
      var martial = /^(bow|crossbow|spear|mace1|mace2|qstaff|talisman)$/.test(cls);
      var caster = /^(wand|staff|sceptre)$/.test(cls);
      if (!done.quality && (armour || martial || caster)) {
        var q = armour ? { k: 'scrap', n: 'Armourer’s Scrap' } : martial ? { k: 'whetstone', n: 'Blacksmith’s Whetstone' } : { k: 'etcher', n: 'Arcanist’s Etcher' };
        return { kind: 'finish', key: 'quality', title: 'Raise quality to 20%', how: 'Use ' + q.n + ' (Greater ones add more per use) until it reaches 20%.' + (armour ? ' On armour, quality also raises Runic Ward.' : ''),
          mats: [{ k: q.k, n: q.n, q: 4 }], outcomes: [{ label: 'Done', o: { type: 'finish', key: 'quality' } }, { label: 'Skip', o: { type: 'finish', key: 'quality' } }], project: { type: 'finish', key: 'quality' } };
      }
      if (!done.runeforge && design.runeforge && (cat.base.rf || cat.base.rfw)) {
        var rfText = cat.base.rf
          ? 'It trades some base defences for Runic Ward' + (cat.base.rf.Ward ? ' (' + cat.base.rf.Ward + ' base Runic Ward)' : '') + '.'
          : 'It changes the weapon’s base damage, so compare the preview with what you have.';
        var vq = cat.base.n === 'Blacksteel Gauntlets' ? 355 : null;
        return { kind: 'finish', key: 'runeforge', title: 'Runeforge it', how: 'At the Verisium Anvil, turn it into Runeforged ' + cat.base.n + '. Check the preview first. ' + rfText + ' Your mods stay.',
          mats: [{ k: 'verisium', n: 'Verisium', q: vq || 100, approx: !vq }],
          note: vq ? null : 'The Anvil shows how much Verisium this base needs. Blacksteel Gauntlets take 355; the price shown is per 100.',
          outcomes: [{ label: 'Done', o: { type: 'finish', key: 'runeforge' } }, { label: 'Skip', o: { type: 'finish', key: 'runeforge' } }], project: { type: 'finish', key: 'runeforge' } };
      }
      if (!done.divine) {
        return { kind: 'finish', key: 'divine', title: 'Divine low rolls (optional)', how: 'A Divine Orb rerolls every value within its tier. Only worth it if several rolls are near the bottom of their range. Omen of Sanctification turns it into a one-time 78–122% gamble that locks the item.',
          mats: [{ k: 'divine', n: 'Divine Orb', opt: true }], outcomes: [{ label: 'Done', o: { type: 'finish', key: 'divine' } }, { label: 'Skip', o: { type: 'finish', key: 'divine' } }], project: { type: 'finish', key: 'divine' } };
      }
      if (!done.sockets && socketable(cat.base)) {
        return { kind: 'finish', key: 'sockets', title: 'Sockets and runes', how: (done.astrid ? 'Astrid’s Creativity already fills one socket, so leave that one alone. ' : '') + 'Add sockets with Artificer’s Orbs and fill them with runes or soul cores. Socketing is permanent; a new rune destroys the old one.',
          mats: [{ k: 'artificer', n: 'Artificer’s Orb', opt: true }], outcomes: [{ label: 'Done', o: { type: 'finish', key: 'sockets' } }, { label: 'Skip', o: { type: 'finish', key: 'sockets' } }], project: { type: 'finish', key: 'sockets' } };
      }
      return { kind: 'done', title: 'Finished', how: 'Every target is on the item. A Vaal Orb is the only thing left, and it can brick the item, so only use one on a copy you can afford to lose.', mats: [], outcomes: [] };
    }

    /* ---------- applying outcomes ---------- */
    function clone(st) { return JSON.parse(JSON.stringify(st)); }
    function apply(st, o) {
      var n = clone(st);
      n.done = n.done || {};
      switch (o.type) {
        case 'setBase': n.rarity = 'magic'; n.mods = clone(o.mods); n.done = {}; break;
        case 'add': n.mods = n.mods.concat(clone(o.mods)); break;
        case 'rare': n.rarity = 'rare'; n.mods = n.mods.concat(clone(o.mods || [])); break;
        case 'remove':
          n.mods = n.mods.filter(function (m) { return m.id !== o.id; });
          break;
        case 'craft':
          n.mods = n.mods.filter(function (m) { return m.id !== o.remove; }).concat(clone(o.mods));
          break;
        case 'restart': n.rarity = 'none'; n.mods = []; n.done = {}; n.corrupted = false; n.skip = {}; break;
        case 'skip': n.skip = n.skip || {}; n.skip[o.f] = true; break;
        case 'finish': n.done[o.key] = true; break;
      }
      return n;
    }

    /* ---------- plan: current step plus the projected happy path ---------- */
    function plan(design, st) {
      var steps = [];
      var s = clone(st);
      for (var i = 0; i < 16; i++) {
        var step = nextStep(design, s);
        steps.push(step);
        if (!step.project || step.kind === 'done' || step.kind === 'stop') break;
        if (step.project.type === 'restart') { step.endsHere = true; break; }
        s = apply(s, step.project);
      }
      return steps;
    }

    /* What to look for on a bought item of this rarity: the first state the plan reaches at that rarity from a fresh
       base. For magic that's the base it starts from (the rarest targets, or any mod on the side an alloy will clear);
       for rare, the item right after it turns rare. */
    function suggest(design, rarity, skip) {
      var s = { rarity: 'none', mods: [], done: {}, skip: clone(skip || {}) };
      for (var i = 0; i < 8; i++) {
        var step = nextStep(design, s);
        if (!step.project || step.kind === 'done' || step.kind === 'stop' || step.project.type === 'restart') return null;
        s = apply(s, step.project);
        if (s.rarity === rarity) return s.mods;
      }
      return null;
    }

    function summary(design, st) {
      var cat = catalog(design.base, design.ilvl);
      var A = analyze(cat, design, st);
      return { A: A, cat: cat, cp: craftedPlan(cat, A, st), dp: desecPlan(cat, A, craftedPlan(cat, A, st)) };
    }

    function slamOddsFor(design, t) {
      var cat = catalog(design.base, design.ilvl);
      var W = weights(cat, [FAMS[t.f].s], 35, new Set(), false);
      var Wp = weights(cat, [FAMS[t.f].s], 50, new Set(), false);
      return { greater: hitShare(W, [t]), perfect: hitShare(Wp, [t]), m: methods(cat, t) };
    }

    /* ---------- finding a base: by name, slot, defence type or implicit ---------- */
    var SLOT_ALIAS = { body: 'chest', mace1: '1h', mace2: '2h', staff: 'staves', qstaff: 'quarterstaves', sceptre: 'scepter', focus: 'foci' };
    function norm(s) { return String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
    function atWordStart(hay, w) {
      for (var i = hay.indexOf(w); i > -1; i = hay.indexOf(w, i + 1)) if (i === 0 || hay.charAt(i - 1) === ' ') return true;
      return false;
    }
    var findIdx = null;
    function findIndex() {
      if (findIdx) return findIdx;
      findIdx = DATA.bases.map(function (b) {
        var slot = CLASS[b.c].n, sub = b.sub || '', rq = b.rq || [];
        var im = (b.im || '').split('\n').filter(function (l) { return l && l.indexOf('{variant') !== 0; });
        return {
          b: b, n: norm(b.n), im: im, imn: im.map(norm),
          k: norm(slot + ' ' + slot + 's ' + (SLOT_ALIAS[b.c] || '')),
          t: norm([sub, /Armour/.test(sub) ? 'armor' : '', /Energy Shield/.test(sub) ? 'es' : '', rq[0] ? 'str' : '', rq[1] ? 'dex' : '', rq[2] ? 'int' : ''].join(' '))
        };
      });
      return findIdx;
    }
    /* Every word has to match somewhere. Best is the start of a word in the name, then the slot, defence type or
       attribute, then anywhere in the name, then an implicit. Ties go to opts.cls, then the higher level base.
       Each hit says where each word matched (on[i]: n name, k slot, t defence/attribute, m mid-name, i implicit). */
    function findBases(q, opts) {
      opts = opts || {};
      var words = norm(q).split(' ').filter(Boolean);
      var out = { words: words, total: 0, list: [] };
      if (!words.length) return out;
      var phrase = words.join(' ');
      var hits = [];
      findIndex().forEach(function (x) {
        var score = 0, imp = null, on = [];
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          if (atWordStart(x.n, w)) { on.push('n'); continue; }
          if (atWordStart(x.k, w)) { score += 1; on.push('k'); continue; }
          if (atWordStart(x.t, w)) { score += 1; on.push('t'); continue; }
          if (x.n.indexOf(w) > -1) { score += 2; on.push('m'); continue; }
          var j = x.imn.findIndex(function (l) { return atWordStart(l, w); });
          if (j < 0) return;
          score += 3; on.push('i');
          if (imp === null) imp = x.im[j];
        }
        if (x.n === phrase) score -= 2; else if (x.n.indexOf(phrase) === 0) score -= 1;
        hits.push({ b: x.b, score: score, imp: imp, on: on });
      });
      hits.sort(function (a, b) {
        return a.score - b.score || (b.b.c === opts.cls) - (a.b.c === opts.cls) || b.b.lv - a.b.lv || a.b.n.localeCompare(b.b.n);
      });
      out.total = hits.length;
      out.list = hits.slice(0, opts.limit || 50);
      return out;
    }

    return {
      MODS: MODS, FAMS: FAMS, CLASS: CLASS, BASE: BASE,
      catalog: catalog, tierOptions: tierOptions, methods: methods, famName: famName, modText: modText,
      analyze: analyze, plan: plan, apply: apply, nextStep: nextStep, summary: summary, slamOddsFor: slamOddsFor,
      oddsLabel: oddsLabel, price: price, matsCost: matsCost, labelTier: labelTier, newId: newId, SIDE: SIDE, SIDE_CAP: SIDE_CAP, findBases: findBases, socketable: socketable, suggest: suggest,
      setLeague: setLeague, hardness: function (design, st, t) { var c = catalog(design.base, design.ilvl); return hardness(c, analyze(c, design, st), t); }
    };
  }

  root.createEngine = createEngine;
  if (typeof module !== 'undefined') module.exports = { createEngine: createEngine };
})(typeof window !== 'undefined' ? window : globalThis);
