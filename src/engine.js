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
      // Grasping Mail and its Verisium Anvil versions roll ring mods too: mark the ones that come from the ring pool
      if (b.rp !== undefined) {
        var plain = new Set(DATA.pools[b.rp].map(function (mi) { return MODS[mi].f; }));
        byFam.forEach(function (F) { if (F.rollable && !plain.has(F.f)) F.ring = true; });
      }
      // On a base whose only defence is Runic Ward (Runefather's Grasping Mail), increased Armour, Evasion or
      // Energy Shield has nothing to increase
      if (wardOnly(b)) byFam.forEach(function (F) { if (LOCAL_DEF.test(F.t.split(' / ')[0])) F.dead = F.t.indexOf(' / ') > -1 ? 'part' : true; });
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

    /* ---------- special bases: Grasping Mail and the Runefather's ---------- */
    var FATHER = "Runefather's Grasping Mail";
    var LOCAL_DEF = /^#% increased (Armour|Evasion Rating|Evasion|Energy Shield)((, | and )(Armour|Evasion Rating|Evasion|Energy Shield))*$/;
    function rollsRing(b) { return !!b && b.rp !== undefined; }
    function wardOnly(b) { return !!(b && b.ar && b.ar.Ward && !b.ar.Armour && !b.ar.Evasion && !b.ar.EnergyShield); }
    function isFather(b) { return !!b && b.n === FATHER; }
    /* What to buy or start from: the Runefather's is made from a Grasping Mail at the Verisium Anvil. */
    function buyName(baseName) { return baseName === FATHER ? 'Grasping Mail' : baseName; }
    function special(baseName) {
      var b = BASE[baseName];
      return { ring: rollsRing(b), father: isFather(b), wardOnly: wardOnly(b), from: isFather(b) ? 'Grasping Mail' : null };
    }
    /* The Runefather's Grasping Mail is a Grasping Mail changed three times at the Verisium Anvil; the mods stay. */
    var ANVIL = [
      { key: 'runeforge', title: 'Runeforge it', from: 'Grasping Mail', to: 'Runeforged Grasping Mail', mats: [{ k: 'xverisium', n: 'Exceptional Verisium', q: 5 }],
        how: 'The first of three changes at the Anvil that make a Runefather’s Grasping Mail. The Anvil offers four versions: take the Str/Dex/Int one (215 base Runic Ward), the one with all three attributes, like the Runefather’s.' },
      { key: 'runemaster', title: 'Runemaster it', from: 'Runeforged Grasping Mail', to: 'Runemastered Grasping Mail', mats: [],
        how: 'The second change. Again take the Str/Dex/Int version (322 base Runic Ward).' },
      { key: 'runefather', title: 'Make it the Runefather’s', from: 'Runemastered Grasping Mail', to: FATHER, mats: [],
        how: 'The last change: 550 base Runic Ward, and no Armour, Evasion or Energy Shield left.' }
    ];
    function anvilStep(done) {
      var i = ANVIL.findIndex(function (a) { return !done[a.key]; });
      if (i < 0) return null;
      var a = ANVIL[i], rest = ANVIL.slice(i).map(function (x) { return x.key; });
      return { kind: 'finish', key: a.key, title: a.title,
        how: 'At the Verisium Anvil, turn your ' + a.from + ' into ' + an(a.to) + '. ' + a.how + ' Check the preview before you commit. Your mods stay.',
        mats: a.mats.slice(),
        note: a.mats.length ? null : 'The app doesn’t know what this change takes yet, so the costs leave it out: the Anvil shows it.',
        outcomes: [{ label: 'Done', o: { type: 'finish', key: a.key } },
          { label: 'It’s already a Runefather’s', free: true, o: { type: 'finish', keys: rest } },
          { label: 'Skip', o: { type: 'finish', keys: rest } }],
        project: { type: 'finish', key: a.key } };
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
    /* Hardest target first. Ties go to the higher mod level, then the family, so the order of the design's boxes
       never decides what the plan does. */
    function byHardness(cat, A) {
      return function (a, b) { return (hardness(cat, A, a) - hardness(cat, A, b)) || (b.lv - a.lv) || (a.f - b.f); };
    }
    /* Likeliest target first (what a slam is projected to land), with the same box-free tie-break. */
    function byLikely(W) {
      return function (a, b) { return (hitShare(W, [b]) - hitShare(W, [a])) || (a.f - b.f); };
    }
    /* A deleting crafted mod (an alloy, or a Perfect or corrupted essence) needs junk to delete. The magic base only
       spends a side on that junk when the side has no target worth buying, already holds junk, or will face two
       deletions (two deleting crafts with Astrid's Creativity: a bought target would survive only one time in
       four). Otherwise the base carries its hardest targets, which cost far less to buy than to slam or desecrate
       later, and the junk is added once the item is rare (the sacrifice in rareStep), where the deletion is a coin
       flip with the bought target. -1 when the base keeps no side as junk. */
    function deletes(r) { return !!r && (r.via === 'alloy' || r.via === 'essLate'); }
    function junkSide(cat, A, cp, eb) {
      if (!deletes(cp)) return -1;
      var x = 1 - FAMS[cp.t.f].s;
      if (!cat.caps[x]) return -1;
      var S = A.sides[x];
      if (S.junk.length) return x;
      if (S.hits.length) return -1;
      if ([cp].concat(cp.next || []).filter(deletes).length > 1) return x;
      var buy = S.unfilled.some(function (t) { return t !== cp.t && !(eb && eb.t === t) && methods(cat, t).slam; });
      return buy ? -1 : x;
    }

    /* What a deleting crafted mod is, for the steps that use one: Perfect and corrupted essences are less familiar than alloys. */
    function craftIntro(cp) {
      if (cp.via !== 'essLate') return '';
      return cp.src.tier === 'corrupted'
        ? 'The ' + cp.src.name + ' is a corrupted essence. On a rare it removes a random mod and adds its own, which counts as a crafted modifier. Buy it on the Currency Exchange, or make one by using a Remnant of Corruption on an essence monolith. '
        : 'A Perfect Essence on a rare removes a random mod and adds its own, which counts as a crafted modifier. ';
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
          if (!best || h < best.h || (h === best.h && (t.lv > best.t.lv || (t.lv === best.t.lv && t.f < best.t.f)))) best = { t: t, src: m.essEarly[0], h: h };
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
      cand.sort(function (a, b) { return (b.only - a.only) || (a.h - b.h) || (a.only ? 0 : (b.t.lv - a.t.lv) || (a.t.f - b.t.f)); });
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
      var picks = [null, null], alts = [null, null], sacrifice = null;
      var needsSacrifice = cp && (cp.via === 'alloy' || cp.via === 'essLate');
      /* The target an essence will add at the magic-to-rare step stays off the base. */
      var essB = cp && cp.via === 'essEarly' ? null : essenceBonus(cat, A, { rarity: 'magic' }, cp);
      var xSide = junkSide(cat, A, cp, essB);
      [0, 1].forEach(function (s) {
        if (s === xSide) { sacrifice = s; return; }
        var cands = A.sides[s].unfilled.filter(function (t) {
          if (cp && cp.t === t) return false;
          if (essB && essB.t === t) return false;
          return methods(cat, t).slam;
        });
        cands.sort(byHardness(cat, A));
        if (cands.length) picks[s] = cands[0];
        if (cands.length > 1 && hardness(cat, A, cands[1]) === hardness(cat, A, cands[0])) alts[s] = cands[1];
      });
      var ilvl = needIlvl(design, cat);
      var parts = [];
      if (picks[0]) parts.push(tName(picks[0]) + ' (' + labelTier(cat, picks[0]) + '+)');
      if (picks[1]) parts.push(tName(picks[1]) + ' (' + labelTier(cat, picks[1]) + '+)');
      var sacText = sacrifice !== null ? ' Any ' + SIDE[sacrifice] + ' is fine on the other side: it becomes the junk the ' + cp.src.name + ' deletes later.'
        : needsSacrifice && parts.length ? ' Buying ' + (parts.length > 1 ? 'them' : 'it') + ' costs far less than adding ' + (parts.length > 1 ? 'them' : 'it') + ' later. The ' + cp.src.name + ' still needs a mod to delete: the plan adds junk for it once the item is rare.' : '';
      var swaps = [0, 1].filter(function (s) { return alts[s]; }).map(function (s) { return tName(alts[s]) + ' (' + labelTier(cat, alts[s]) + '+) instead of ' + tName(picks[s]); });
      if (swaps.length) sacText += ' ' + (swaps.length > 1 ? swaps.join(', or ') + ', works just as well: each pair is' : swaps[0] + ' works just as well: they’re') + ' equally hard to add later.';
      var mods = [];
      if (picks[0]) mods.push(targetMod(picks[0]));
      if (picks[1]) mods.push(targetMod(picks[1]));
      if (sacrifice !== null) mods.push({ id: newId(), s: sacrifice, mi: null, pseudo: 'any', mark: 'junk' });
      var rollW = weights(cat, [0, 1], 70, new Set(), false);
      var pRoll = 0;
      var aimList = picks.filter(Boolean);
      if (aimList.length) pRoll = hitShare(rollW, [aimList[0]]);
      var grasp = rollsRing(cat.base), buyN = buyName(cat.base.n);
      var how = 'Buy a magic ' + buyN + ' at item level ' + ilvl + ' or higher' + (parts.length ? ' with ' + parts.join(' and ') : '') + '.' + sacText +
        (grasp ? ' Grasping Mails don’t drop: the Grasping Orchid on the Genesis Tree (Breach) turns 60 Breach Rings into one, and guides say it comes out rare and unidentified, so a magic one can be hard to find. If yours is rare, choose Rare in step 1 and fill in its mods.' +
            (isFather(cat.base) ? ' A Runefather’s Grasping Mail works too: its mods roll the same, and the Anvil steps at the end are then already done.' : '')
          : ' Magic bases are cheap on trade. To roll one yourself, use a Perfect Orb of Transmutation (it only rolls top tiers) and a Greater Orb of Augmentation on normal bases until one hits.');
      var spec = [{ k: 'Base', v: buyN }, { k: 'Item level', v: ilvl + '+' },
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
      /* The essence that will make it rare, if any: its target is guaranteed, so augments don't aim at it. */
      var eb = cp && cp.via === 'essEarly' ? { t: cp.t, src: cp.src } : essenceBonus(cat, A, st, cp);
      var xSide = junkSide(cat, A, cp, eb);
      var needsSacrifice = xSide >= 0;
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
            outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }, { label: 'Annul removed it', o: { type: 'remove', id: bad.id }, uses: [{ k: 'annul', n: 'Orb of Annulment' }] },
              { label: 'Annul removed the other mod', edit: true, uses: [{ k: 'annul', n: 'Orb of Annulment' }] }],
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
            var best = aims.slice().sort(byLikely(Wg))[0];
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
      var bestR = projAims.slice().sort(byLikely(Wr))[0];
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

      /* Craft-only targets with no crafted slot left can't be helped by making room; craftCapStep explains them. */
      var stuck = A.craftedUsed ? A.sides[0].unfilled.concat(A.sides[1].unfilled).filter(function (t) { return methods(cat, t).craftOnly; }) : [];
      var live = function (S) { return S.unfilled.filter(function (t) { return stuck.indexOf(t) < 0; }); };

      // 0) a removal will be needed later anyway: if starting over is the cheaper fix, say so before spending more
      {
        var deficit = [0, 1].map(function (x) { return live(A.sides[x]).length - A.sides[x].open; });
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
          var how = craftIntro(cp) + 'Activate ' + omenCr(c.X).n + ', then use the ' + cp.src.name + '. It deletes a random ' + SIDE[c.X] + ' and adds ' + MODS[cp.src.mi].x + ' as a ' + SIDE[yc] + '.';
          var note = c.p >= 0.995 ? 'Every ' + SIDE[c.X] + ' on the item is junk, so the deletion can only hit junk.' :
            'The ' + SIDE[c.X] + ' side also holds ' + listAnd(S.removable.filter(function (m) { return m.status !== 'junk' && m.status !== 'low'; }).map(modLabel)) + ', so this can delete a good mod. If it does, tell the planner and it will re-route.';
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
        var sx = bothOpen && clean(X2) ? X2 : (A.sides[yc].open > 0 && clean(yc)) ? yc : null;
        if (sx === null) {
          /* Every side holds mods worth keeping: put the junk where the deletion is likeliest to take it. */
          var pX2 = bothOpen ? 1 / (A.sides[X2].removable.length + 1) : -1;
          var pY = A.sides[yc].open > 0 ? 1 / (A.sides[yc].removable.length + 1) : -1;
          if (pX2 > 0 || pY > 0) sx = pX2 >= pY ? X2 : yc;
        }
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
            how: craftIntro(cp) + 'The ' + SIDE[yc] + ' side is full and holds no junk, so the ' + cp.src.name + ' (with ' + omenCr(yc).n + ') will delete one of your ' + SIDE[yc] + 'es to make room.',
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
        var need = live(S).filter(function (t) { return !(cp && cp.t === t && FAMS[t.f].s === s && cp.inPlace); }).length;
        var lowBlock = S.low.length > 0 && live(S).some(function (t) { return S.low.some(function (m) { return MODS[m.mi].f === t.f; }); });
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
        var best = Z.aims.slice().sort(byLikely(Z.W))[0];
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

      // 5) still unfilled but no open route: removal, a crafted slot that's full, or acceptance
      var sideWithJunk = [0, 1].find(function (s) { return live(A.sides[s]).length && A.sides[s].junkRem.length; });
      if (sideWithJunk !== undefined) return removalStep(design, st, A, cat, sideWithJunk, warn);
      if (stuck.length) return craftCapStep(design, st, A, cat, stuck, warn);
      var left = A.sides[0].unfilled.concat(A.sides[1].unfilled);
      return {
        kind: 'stop', title: 'No route left for ' + list(left.map(tName)),
        how: 'The slots are taken by mods you want to keep, and the crafted and desecrated slots are used. Change a target, mark a mod as junk, or start a new base.',
        mats: [], warn: warn,
        outcomes: [{ label: 'Start a new base', o: { type: 'restart' } }].concat(left.map(function (t) { return { label: 'Skip ' + tName(t), o: { type: 'skip', f: t.f } }; }))
      };
    }

    function listAnd(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]; }
    /* A craft-only target is left, but the item already has all the crafted modifiers it can hold. Say why, and offer
       Astrid's Creativity when the base can take it. */
    function craftCapStep(design, st, A, cat, stuck, warn) {
      // Alloys and Perfect or corrupted essences work on a rare; the other essences only on a magic item
      var onRare = function (x) { var mx = methods(cat, x); return mx.alloy.length > 0 || mx.essLate.length > 0; };
      var t = stuck.filter(onRare)[0] || stuck[0], m = methods(cat, t), late = onRare(t);
      var src = (m.alloy[0] || m.essLate[0] || m.essEarly[0]).name;
      var have = listAnd(st.mods.filter(function (x) { return x.crafted; }).map(modLabel));
      var canRune = late && A.craftCap < 2 && socketable(cat.base);
      var outs = [];
      if (canRune) outs.push({ label: 'Plan it with Astrid’s Creativity', astrid: true });
      stuck.forEach(function (x) { outs.push({ label: 'Skip ' + tName(x), o: { type: 'skip', f: x.f } }); });
      outs.push({ label: 'Start a new base', o: { type: 'restart' } });
      return {
        kind: canRune ? 'rune' : 'stop',
        title: canRune ? 'Use Astrid’s Creativity for ' + tName(t) : late ? 'No crafted slot left for ' + listAnd(stuck.map(tName)) : 'No route left for ' + listAnd(stuck.map(tName)),
        how: !late ? tName(t) + ' at this tier only comes from ' + an(src) + ', which needs a magic item, and this one is rare. Start a new base to get it, or skip it.' :
          tName(t) + ' only comes from ' + an(src) + ', and that adds a crafted modifier. ' +
          (A.craftCap > 1 ? 'Both crafted slots are already used (' + have + ').' : 'Your item already has its one crafted modifier: ' + have + '.') +
          (canRune ? ' Astrid’s Creativity, a rune, lets it hold a second. Plan it with the rune and the next steps show the way: socket the rune (with an Artificer’s Orb if there’s no free socket), then use the ' + src + ' with a Crystallisation omen.'
            : socketable(cat.base) ? ' Two is the most an item can hold, even with Astrid’s Creativity.' : ' This base can’t take augment sockets, so Astrid’s Creativity isn’t an option.'),
        mats: canRune ? [{ k: 'Astrid\'s Creativity', n: 'Astrid’s Creativity' }, { k: src, n: src }] : [],
        note: canRune ? 'The prices are for the rune and the ' + src + '. The omens and any sacrifice show up in the next steps.' : null,
        warn: warn, outcomes: outs
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
      var S0 = A.sides[s];
      var S = Object.assign({}, S0, { unfilled: S0.unfilled.filter(function (t) { return !(A.craftedUsed && methods(cat, t).craftOnly); }) });
      var lg = design.league || LEAGUE;
      var options = [];
      function lvl(m) { return m.pseudo ? 999 : MODS[m.mi].l; }
      function isJunk(m) { return (m.status === 'junk' || m.status === 'low') && !m.fract; }
      var aims = S.unfilled.filter(function (t) { return methods(cat, t).slam; });
      var best = aims.slice().sort(function (a, b) { return (hardness(cat, A, b) - hardness(cat, A, a)) || (a.f - b.f); })[0];
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
      var hardest = S.unfilled.slice().sort(byHardness(cat, A))[0];
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
        note: why === 'restart' ? 'With ' + (A.hits ? 'only one' : 'none') + ' of your mods on the item, a new base costs less than any fix here. Every option is still open.'
          : why === 'settle' ? 'Every fix here is dear, so skipping one target is the practical call. The other options are still listed.'
          : 'Starting over would mean rolling the ' + A.hits + ' mods you have again, with the same chance of junk, so fixing it is usually the better bet.',
        outcomes: rec.outcomes, project: rec.project
      };
    }

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
      if (isFather(cat.base)) {
        var anvil = anvilStep(done);
        if (anvil) return anvil;
      } else if (!done.runeforge && design.runeforge && (cat.base.rf || cat.base.rfw)) {
        var rfText = cat.base.rf
          ? 'It trades some base defences for Runic Ward' + (cat.base.rf.Ward ? ' (' + cat.base.rf.Ward + ' base Runic Ward)' : '') + '.'
          : 'It changes the weapon’s base damage, so compare the preview with what you have.';
        // Grasping Mail takes Exceptional Verisium, and the Anvil offers four versions of it
        var grasp = rollsRing(cat.base);
        var vq = cat.base.n === 'Blacksteel Gauntlets' ? 355 : null;
        return { kind: 'finish', key: 'runeforge', title: 'Runeforge it', how: 'At the Verisium Anvil, turn it into Runeforged ' + cat.base.n + '. Check the preview first. ' + rfText +
            (grasp ? ' The Anvil offers four versions (Str/Dex, Dex/Int, Str/Int and Str/Dex/Int, which has the most Runic Ward).' : '') + ' Your mods stay.',
          mats: grasp ? [{ k: 'xverisium', n: 'Exceptional Verisium', q: 5 }] : [{ k: 'verisium', n: 'Verisium', q: vq || 100, approx: !vq }],
          note: vq || grasp ? null : 'The Anvil shows how much Verisium this base needs. Blacksteel Gauntlets take 355; the price shown is per 100.',
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
        case 'finish': (o.keys || [o.key]).forEach(function (k) { n.done[k] = true; }); break;
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

    /* ---------- cost estimates ----------
       "If every roll lands" is the plan's required mats, priced once (planCost). "On average" is what the steps cost
       from an item to the end if you follow the planner's own advice after every miss, solved exactly as a Markov
       chain over item states (costPlan):
       - a node is an item state (mods sorted, ids renumbered); its step is nextStep(design, state)
       - rolls (aimed augment, Regal, slam, sacrifice, the Chaos Orb after Whittling) draw from the same pool the step's
         odds come from, every tier counting equally. A drawn tier of a wanted family at or above the target tier is
         that target (progress, even when the step aimed at another one); anything else is junk on its side
       - an alloy or a Perfect/corrupted essence deletes each of the side's removable mods equally often
       - a desecration lands the target with the step's own odds (six reveals with Echoes), else desecrated junk
       - a removal does the suggested option: Annulment removes each removable mod equally often, Omen of Light is
         certain, Whittling removes the lowest mod and its Chaos Orb draws from the pool, Skip skips, a new base restarts
       - a base that missed restarts; base, essence, rune and finish steps are certain
       Each visit pays the required (not optional) mats of the step or of its suggested option. Magic bases are counted,
       never priced. Restarts stay out of the solve: every value is a + r·X, with X the value of a fresh base. */
    var COST_MAXN = 400;   // states per chain; past it a chain is rebuilt, or (within one query) cut and flagged
    var ROLL_FLOOR = { aug: 44, regal: 50, slam: 35, sacrifice: 0 };
    var FRESH = { rarity: 'none', mods: [], done: {}, skip: {} };
    var chains = new Map();
    function nowMs() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
    /* The cost functions price at design.league and plan with it too (byPrice reads LEAGUE). */
    function inLeague(design, fn) {
      var saved = LEAGUE;
      LEAGUE = design.league === 'roa' ? 'roa' : 'fr';
      try { return fn(); } finally { LEAGUE = saved; }
    }
    function mkey(m) {
      return [m.s, m.mi === null || m.mi === undefined ? -1 : m.mi, m.pseudo ? 1 : 0, m.mark || 'auto', m.crafted ? 1 : 0, m.desec ? 1 : 0, m.fract ? 1 : 0].join('|');
    }
    /* Same item, same node: mods sorted by what they are, ids renumbered, analysis fields dropped. */
    function canon(st) {
      var mods = st.mods.map(function (m) { return { k: mkey(m), m: m }; }).sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; }).map(function (x, i) {
        var m = x.m, o = { id: 'k' + i, s: m.s, mi: m.mi === undefined ? null : m.mi, mark: m.mark || 'auto' };
        if (m.pseudo) o.pseudo = m.pseudo;
        if (m.crafted) o.crafted = true;
        if (m.desec) o.desec = true;
        if (m.fract) o.fract = true;
        return o;
      });
      var out = { rarity: st.rarity, mods: mods, done: {}, skip: {} };
      Object.keys(st.done || {}).forEach(function (k) { if (st.done[k]) out.done[k] = true; });
      Object.keys(st.skip || {}).forEach(function (f) { if (st.skip[f]) out.skip[f] = true; });
      if (st.corrupted) out.corrupted = true;
      return out;
    }
    function skey(c) {
      return c.rarity + '#' + c.mods.map(mkey).join(',') + '#' + Object.keys(c.skip).sort().join('.') + '#' + Object.keys(c.done).sort().join('.') + (c.corrupted ? '#x' : '');
    }
    function dsig(d) {
      return JSON.stringify([d.base, d.ilvl, d.league === 'roa' ? 'roa' : 'fr', !!d.runeforge, !!d.astrid, d.targets.map(function (side) { return side.map(function (t) { return t ? t.mi : null; }); })]);
    }
    function junkOf(s, desec) { var m = { id: 'j', s: s, mi: null, pseudo: 'junk', mark: 'junk' }; if (desec) m.desec = true; return m; }
    function suggestedOpt(step) { return step.options ? step.options.find(function (o) { return o.key === step.recommended; }) || step.options[0] : null; }
    function required(mats) { return (mats || []).filter(function (m) { return !m.opt; }); }

    /* One chain per design (and league), grown as states are asked for. */
    function buildChain(design) {
      var lg = design.league === 'roa' ? 'roa' : 'fr';
      var cat = catalog(design.base, design.ilvl);
      var tfam = [];
      design.targets.forEach(function (side) { side.forEach(function (t) { if (t && tfam.indexOf(t.f) < 0) tfam.push(t.f); }); });
      var C = { design: design, lg: lg, cat: cat, tfam: tfam, nodes: [], index: new Map(), queue: [], cut: false, solved: null, memo: new Map() };
      C.node = function (st) {
        var c = canon(st), k = skey(c);
        var id = C.index.get(k);
        if (id !== undefined) return id;
        id = C.nodes.length;
        C.index.set(k, id);
        C.nodes.push({ st: c, out: null, cost: 0, unknown: 0, base: 0, restart: 0, end: null });
        C.queue.push(id);
        return id;
      };
      C.priced = function (mats) { return matsCost(required(mats), lg); };
      function rolled(st, f, s, l) {
        var t = (design.targets[s] || []).find(function (y) { return y && y.f === f && !(st.skip && st.skip[y.f]); });
        return t && l >= t.lv ? { id: 'r', s: s, mi: t.mi, mark: 'auto' } : junkOf(s, false);
      }
      function openSides(st) {
        var n = [0, 0];
        st.mods.forEach(function (m) { n[m.s] += 1; });
        return [0, 1].filter(function (s) { return (st.rarity === 'magic' ? Math.min(1, cat.caps[s]) : cat.caps[s]) - n[s] > 0; });
      }
      /* Every outcome of doing `step` (or its option `op`) from st, with its chance: [[p, state | 'restart']]. */
      C.outcomes = function (st, step, op) {
        var res = [];
        function draw(from, sides, floor, type) {
          var present = new Set();
          from.mods.forEach(function (m) { if (m.mi !== null && m.mi !== undefined) present.add(MODS[m.mi].f); });
          var W = weights(cat, sides, floor, present, false);
          if (!W.total) return false;
          var g = new Map();
          W.per.forEach(function (tiers, f) {
            tiers.forEach(function (t) {
              var m = rolled(from, f, FAMS[f].s, t.l), k = mkey(m);
              if (!g.has(k)) g.set(k, { m: m, n: 0 });
              g.get(k).n += 1;
            });
          });
          g.forEach(function (v) { res.push([v.n / W.total, apply(from, { type: type, mods: [v.m] })]); });
          return true;
        }
        function uniform(list) { list.forEach(function (o) { res.push([1 / list.length, apply(st, o)]); }); }
        if (op) {
          if (op.key === 'restart') return [[1, 'restart']];
          if (op.key === 'annul') { uniform(op.outcomes.filter(function (o) { return o.o; }).map(function (o) { return o.o; })); return res; }
          if (op.key === 'annul1') { uniform(st.mods.map(function (m) { return { type: 'remove', id: m.id }; })); return res; }
          if (op.key === 'whittle' || op.key === 'whittleE') {
            var after = apply(st, { type: 'remove', id: op.project.type === 'craft' ? op.project.remove : op.project.id });
            var open = openSides(after);
            if (!draw(after, open.indexOf(1 - step.side) > -1 ? open : [step.side], 0, 'add')) res.push([1, after]);
            return res;
          }
          return [[1, apply(st, op.project)]];   // Omen of Light, Skip
        }
        switch (step.kind) {
          case 'fixMagic': return [[1, 'restart']];
          case 'aug': if (step.odds && draw(st, [step.side], ROLL_FLOOR.aug, 'add')) return res; break;
          case 'slam': case 'sacrifice': if (draw(st, [step.side], ROLL_FLOOR[step.kind], 'add')) return res; break;
          case 'regal': if (draw(st, openSides(Object.assign({}, st, { rarity: 'rare' })), ROLL_FLOOR.regal, 'rare')) return res; break;
          case 'craft':
            var list = (step.outcomes || []).filter(function (o) { return o.o && o.o.type === 'craft'; }).map(function (o) { return o.o; });
            if (list.length) { uniform(list); return res; }
            break;
          case 'desec':
            var p = step.odds ? step.odds.p : 1;
            if (p > 0) res.push([p, apply(st, step.project)]);
            if (p < 1) res.push([1 - p, apply(st, { type: 'add', mods: [junkOf(step.side, true)] })]);
            return res;
          default: break;
        }
        return [[1, apply(st, step.project)]];
      };
      function expand(id) {
        var N = C.nodes[id];
        if (N.out) return;
        N.out = [];
        if (C.nodes.length > COST_MAXN) { N.end = 'cut'; C.cut = true; return; }
        var step = nextStep(design, clone(N.st));
        if (step.kind === 'done') { N.end = 'done'; return; }
        var op = suggestedOpt(step);
        if (step.kind === 'fixMagic' || (op && op.key === 'restart')) { N.restart = 1; return; }
        if (!op && !step.project) { N.end = 'stop'; return; }   // a stop, or the rune offer that waits for your call
        if (step.kind === 'base') N.base = 1;
        var pr = C.priced(op ? op.mats : step.mats);
        N.cost = pr.sum; N.unknown = pr.known ? 0 : 1;
        var agg = new Map();
        C.outcomes(N.st, step, op).forEach(function (x) {
          if (x[0] <= 1e-12) return;
          var to = C.node(x[1]);
          agg.set(to, (agg.get(to) || 0) + x[0]);
        });
        agg.forEach(function (p, to) { if (!(to === id && p >= 0.999)) N.out.push([p, to]); });
        if (!N.out.length) { N.end = 'stop'; N.cost = 0; }   // nothing it does changes the item: stuck here
      }
      /* Expand queued nodes until none are left (true) or the deadline passes (false). Resumable. */
      C.pump = function (deadline) {
        while (C.queue.length) {
          if (deadline && nowMs() > deadline) return false;
          expand(C.queue.pop());
        }
        return true;
      };
      /* Columns: 0 spend, 1 chance of ending in a restart, 2 magic bases, 3 visits to a step with an unknown price,
         4 chance of ending at a stop, 5 chance of ending in a loop the steps never leave, 6.. chance of ending with each
         target family skipped. One dense solve. */
      C.solve = function () {
        if (C.solved && C.solved.n === C.nodes.length) return C.solved;
        var n = C.nodes.length, K = 6 + tfam.length, W = n + K;
        // States that can't reach an end (done, stop, restart, cut) are stuck in a loop: they end there, in column 5
        var rev = C.nodes.map(function () { return []; }), reach = new Uint8Array(n), todo = [];
        C.nodes.forEach(function (N, i) {
          (N.out || []).forEach(function (x) { rev[x[1]].push(i); });
          if (N.end || N.restart || !N.out) { reach[i] = 1; todo.push(i); }
        });
        while (todo.length) rev[todo.pop()].forEach(function (j) { if (!reach[j]) { reach[j] = 1; todo.push(j); } });
        var M = new Array(n);
        for (var i = 0; i < n; i++) {
          var N = C.nodes[i], row = new Float64Array(W);
          row[i] = 1;
          if (!reach[i]) { row[n + 5] = 1; M[i] = row; continue; }
          (N.out || []).forEach(function (x) { row[x[1]] -= x[0]; });
          var a = N.cost;
          if (N.end === 'cut') {
            a = 0;
            plan(design, N.st).forEach(function (x) { var o = suggestedOpt(x); a += C.priced(o ? o.mats : x.mats).sum; });
          }
          row[n] = a; row[n + 1] = N.restart; row[n + 2] = N.base; row[n + 3] = N.unknown;
          if (N.end === 'stop') row[n + 4] = 1;
          if (N.end) tfam.forEach(function (f, j) { if (N.st.skip[f]) row[n + 6 + j] = 1; });
          M[i] = row;
        }
        for (var c = 0; c < n; c++) {
          var piv = c;
          for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
          if (piv !== c) { var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp; }
          var d = M[c][c];
          if (Math.abs(d) < 1e-12) continue;   // a loop with no way out: its states come out Infinity
          var rc = M[c];
          for (var r2 = 0; r2 < n; r2++) {
            if (r2 === c) continue;
            var fct = M[r2][c] / d;
            if (!fct) continue;
            var rr = M[r2];
            for (var k = c; k < W; k++) rr[k] -= fct * rc[k];
          }
        }
        var V = [];
        for (var k2 = 0; k2 < K; k2++) {
          var v = new Float64Array(n);
          for (var i2 = 0; i2 < n; i2++) v[i2] = Math.abs(M[i2][i2]) < 1e-12 ? Infinity : M[i2][n + k2] / M[i2][i2];
          V.push(v);
        }
        C.solved = { n: n, V: V };
        C.memo.clear();
        return C.solved;
      };
      return C;
    }
    function chainFor(design, peek) {
      var k = dsig(design);
      var C = chains.get(k);
      if (C) { chains.delete(k); chains.set(k, C); return C; }
      if (peek) return null;
      C = buildChain(design);
      chains.set(k, C);
      while (chains.size > 3) chains.delete(chains.keys().next().value);
      return C;
    }
    /* A chain that grew past half the limit over a session (every item edit adds states) starts again before it
       explores states it hasn't seen, so new states aren't cut short. It starts again once per item state (its anchor):
       the average and the choices for the same item then share one chain instead of throwing each other's away. */
    function fitChain(C, design, st, states) {
      var anchor = skey(canon(st));
      if (C.nodes.length <= COST_MAXN / 2 || C.anchor === anchor || states.every(function (s) { return C.index.has(skey(canon(s))); })) return C;
      chains.delete(dsig(design));
      C = chainFor(design, false);
      C.anchor = anchor;
      return C;
    }
    /* A node's value with restarts folded in: here + r · fresh / (1 − r(fresh)). */
    function valuer(C) {
      var S = C.solve();
      var f0 = C.index.get(skey(canon(FRESH)));
      var r0 = S.V[1][f0];
      // 200+ magic bases per finish, or a fresh base can end in a loop: "very high", and no fresh value
      var capped = !(r0 < 0.995) || S.V[5][f0] > 1e-9;
      var fresh = capped ? null : S.V.map(function (v) { return v[f0] / (1 - r0); });
      return {
        capped: capped, fresh: fresh, r: function (id) { return S.V[1][id]; },
        col: function (id, k) {
          var r = S.V[1][id], v = S.V[k][id];
          if (r <= 1e-12) return v;
          if (!fresh) return k === 0 || k === 2 ? Infinity : v;
          return v + r * fresh[k];
        },
        stuck: function (id) { var r = S.V[1][id]; return S.V[5][id] > 1e-9 || (!fresh && r > 1e-9); },
        // why a state is stuck: a loop the steps never leave (here, or after a restart), not just too many restarts
        loop: function (id) { var r = S.V[1][id]; return S.V[5][id] > 1e-9 || (r > 1e-9 && S.V[5][f0] > 1e-9); }
      };
    }
    /* These states are already explored and solved: answering takes no exploring and no solve. */
    function ready(C, states) {
      if (C.queue.length || !C.solved || C.solved.n !== C.nodes.length) return false;
      return [FRESH].concat(states).every(function (x) { var id = C.index.get(skey(canon(x))); return id !== undefined && C.nodes[id].out; });
    }
    /* Get the chain ready for these states within the time budget (ms); false when it needs another slice. */
    function prepare(C, states, opts) {
      C.node(FRESH);
      states.forEach(function (s) { C.node(s); });
      return C.pump(opts.budget ? nowMs() + opts.budget : 0);
    }

    /* If every roll lands: the steps' required mats priced once (the suggested option's on a removal). */
    function planCost(design, steps) {
      var lg = design.league === 'roa' ? 'roa' : 'fr';
      var div = 0, known = true, base = false, stopsAt = null;
      steps.forEach(function (x, i) {
        if (stopsAt !== null) return;
        // a step that waits for your call: its items belong to one of its choices, priced on the choices
        if (x.kind !== 'done' && !x.project && !x.options) { stopsAt = i; return; }
        var op = suggestedOpt(x);
        var r = matsCost(required(op ? op.mats : x.mats), lg);
        div += r.sum; if (!r.known) known = false;
        if (x.kind === 'base') base = true;
      });
      return { div: div, known: known, base: base, stopsAt: stopsAt, restart: !!(steps[steps.length - 1] || {}).endsHere };
    }
    /* What it costs to finish from st: { happy, avg, risk, capped, fresh, states, cut }, or null when `quick` can't
       answer without exploring, or a `budget` slice ran out (call again to carry on). */
    function costPlan(design, st, opts) {
      opts = opts || {};
      return inLeague(design, function () {
        var C = chainFor(design, opts.quick);
        if (!C) return null;
        var k0 = skey(canon(st));
        if (C.solved && C.solved.n === C.nodes.length && C.memo.has(k0)) return C.memo.get(k0);
        var steps = opts.steps || plan(design, st);
        var path = [st], s = st;
        steps.forEach(function (x) { if (x.project && x.project.type !== 'restart') { s = apply(s, x.project); path.push(s); } });
        if (opts.quick && !ready(C, path)) return null;
        if (!opts.quick) C = fitChain(C, design, st, path);
        if (!prepare(C, path, opts)) return null;
        var val = valuer(C);
        var id0 = C.node(st);
        var happy = planCost(design, steps);
        var loop = val.col(id0, 5) > 1e-9;
        var capped = val.stuck(id0) || !isFinite(val.col(id0, 0));
        var avg = capped ? null : {
          div: val.col(id0, 0), bases: val.col(id0, 2), unknown: val.col(id0, 3) > 1e-9, stop: val.col(id0, 4),
          skipped: C.tfam.map(function (f, j) { return { f: f, name: famName(f), p: val.col(id0, 6 + j) }; })
            .filter(function (x) { return x.p >= 0.005; }).sort(function (a, b) { return b.p - a.p; })
        };
        /* The step that adds the most to the average beyond its own price: what its misses cost. */
        var risk = null;
        if (avg) {
          var i = 0;
          steps.forEach(function (x, si) {
            if (!x.project || x.project.type === 'restart') return;
            var before = C.node(path[i]), after = C.node(path[i + 1]);
            i += 1;
            var p = x.odds ? x.odds.p : 1;
            if (p >= 0.995 || x.kind === 'base') return;
            var op = suggestedOpt(x);
            var extra = val.col(before, 0) - C.priced(op ? op.mats : x.mats).sum - val.col(after, 0);
            if (!risk || extra > risk.extra) risk = { i: si, kind: x.kind, title: x.title, p: p, extra: extra, st: path[i - 1], step: x };
          });
          if (risk && risk.extra >= 5 && risk.extra >= 0.25 * avg.div) {
            risk.miss = missOf(design, risk.st, risk.step);
            delete risk.st; delete risk.step;
          } else risk = null;
        }
        var res = { happy: happy, avg: avg, risk: risk, capped: capped, loop: capped && loop, fresh: val.fresh ? { div: val.fresh[0], bases: val.fresh[2] } : null, states: C.nodes.length, cut: C.cut };
        C.memo.set(k0, res);
        return res;
      });
    }
    /* What the planner does after a typical miss on a slam, augment or desecration: junk where the roll was. */
    function missOf(design, st, step) {
      if (['slam', 'aug', 'desec'].indexOf(step.kind) < 0 || step.side === undefined) return { type: 'route' };
      var nx = nextStep(design, apply(st, { type: 'add', mods: [junkOf(step.side, step.kind === 'desec')] }));
      if (nx.kind === 'fixMagic') return { type: 'restart' };
      if (nx.kind !== 'remove') return { type: 'route' };
      var op = suggestedOpt(nx);
      if (op.key === 'restart') return { type: 'restart' };
      if (op.key === 'settle') return { type: 'skip', what: op.label.replace(/^Skip /, '') };
      var need = required(op.mats);
      return { type: 'fix', key: op.key, label: op.label, mats: need, each: matsCost(need, design.league === 'roa' ? 'roa' : 'fr').sum };
    }
    /* The choices a step offers that are worth pricing side by side, or null. */
    function choicesOf(step) {
      if (step.options) return step.options.map(function (o) { return { key: o.key, label: o.label, op: o, kind: o.key === 'restart' ? 'restart' : o.key === 'settle' ? 'skip' : 'fix' }; });
      if (step.kind === 'fixMagic') {
        return [{ key: 'restart', label: 'Start a new base', kind: 'restart', op: { key: 'restart', mats: [] } },
          { key: 'annul1', label: 'Orb of Annulment', kind: 'fix', op: { key: 'annul1', mats: [{ k: 'annul', n: 'Orb of Annulment' }] } }];
      }
      if ((step.kind === 'stop' || step.kind === 'rune') && !step.project && step.outcomes && step.outcomes.length > 1) {
        return step.outcomes.filter(function (o) { return o.astrid || o.o; }).map(function (o) {
          var kind = o.astrid ? 'astrid' : o.o.type === 'restart' ? 'restart' : 'skip';
          return { key: kind === 'skip' ? 'skip:' + o.o.f : kind, label: o.label, out: o, kind: kind };
        });
      }
      return null;
    }
    /* What each choice still costs to finish: [{ key, label, kind, now, known, keeps, finish, bases, stop }]. */
    function choiceCosts(design, st, step, opts) {
      var list = choicesOf(step);
      if (!list) return null;
      opts = opts || {};
      return inLeague(design, function () {
        var C = chainFor(design, opts.quick);
        if (!C) return null;
        var ck = 'c|' + skey(canon(st)) + '|' + list.map(function (x) { return x.key; }).join(',');
        if (C.solved && C.solved.n === C.nodes.length && C.memo.has(ck)) return C.memo.get(ck);
        var branches = list.map(function (x) {
          if (x.kind === 'restart' || x.kind === 'astrid') return [];
          if (x.out) return [[1, apply(st, x.out.o)]];
          return C.outcomes(st, step, x.op);
        });
        var states = [];
        branches.forEach(function (b) { b.forEach(function (y) { if (y[1] !== 'restart') states.push(y[1]); }); });
        if (opts.quick && !ready(C, states)) return null;
        if (!opts.quick) C = fitChain(C, design, st, states);
        if (!prepare(C, states, opts)) return null;
        var astrid = null;
        if (list.some(function (x) { return x.kind === 'astrid'; })) {
          astrid = costPlan(Object.assign({}, design, { astrid: true }), st, { budget: opts.budget, quick: opts.quick });
          if (!astrid) return null;
        }
        var val = valuer(C);
        var out = list.map(function (x, i) {
          var nowp = x.kind === 'astrid' ? C.priced([{ k: 'Astrid\'s Creativity' }]) : x.op && x.op.mats.length ? C.priced(x.op.mats) : { sum: 0, known: true };
          // lose: the chance it ends without a target that isn't skipped yet (the likeliest one, named in loseName)
          var r = { key: x.key, label: x.label, kind: x.kind, now: nowp.sum, known: nowp.known, keeps: x.kind !== 'skip', loop: false, lose: 0, loseName: null };
          var live = C.tfam.map(function (f, j) { return st.skip && st.skip[f] ? -1 : j; }).filter(function (j) { return j >= 0; });
          var lose = live.map(function () { return 0; });
          function worst() {
            lose.forEach(function (p, q) { if (p > r.lose) { r.lose = p; r.loseName = famName(C.tfam[live[q]]); } });
          }
          if (x.kind === 'restart') {
            r.finish = val.fresh ? val.fresh[0] : Infinity; r.bases = val.fresh ? val.fresh[2] : Infinity; r.stop = val.fresh ? val.fresh[4] : 0;
            r.loop = !val.fresh && val.loop(C.node(FRESH));
            if (val.fresh) { lose = live.map(function (j) { return val.fresh[6 + j]; }); worst(); }
            return r;
          }
          if (x.kind === 'astrid') {
            var a = astrid.avg;
            r.finish = a ? a.div : Infinity; r.bases = a ? a.bases : Infinity; r.stop = a ? a.stop : 0; r.loop = !!astrid.loop;
            if (a) a.skipped.forEach(function (y) { if (!(st.skip && st.skip[y.f]) && y.p > r.lose) { r.lose = y.p; r.loseName = y.name; } });
            return r;
          }
          var fin = nowp.sum, b = 0, stop = 0;
          branches[i].forEach(function (y) {
            var p = y[0];
            if (y[1] === 'restart') {
              if (!val.fresh) { fin = Infinity; b = Infinity; r.loop = r.loop || val.loop(C.node(FRESH)); return; }
              fin += p * val.fresh[0]; b += p * val.fresh[2]; stop += p * val.fresh[4];
              live.forEach(function (j, q) { lose[q] += p * val.fresh[6 + j]; });
              return;
            }
            var id = C.node(y[1]);
            if (val.stuck(id)) { fin = Infinity; b = Infinity; r.loop = r.loop || val.loop(id); return; }   // a loop, or restarts that never finish
            fin += p * val.col(id, 0); b += p * val.col(id, 2); stop += p * val.col(id, 4);
            live.forEach(function (j, q) { lose[q] += p * val.col(id, 6 + j); });
          });
          r.finish = isFinite(fin) ? fin : Infinity; r.bases = isFinite(b) ? b : Infinity; r.stop = stop;
          worst();
          return r;
        });
        C.memo.set(ck, out);
        return out;
      });
    }
    /* The shopping list for the steps: the base to buy, the items if every roll lands (merged, in order of first use),
       what a likely miss calls for, and the optional items. */
    function shoppingList(design, st, steps) {
      return inLeague(design, function () {
        steps = steps || plan(design, st);
        var lg = design.league === 'roa' ? 'roa' : 'fr';
        var rows = [], byK = {}, optional = [], optK = {}, misses = [];
        var s = st, base = null;
        steps.forEach(function (x, i) {
          if (x.kind === 'base') base = x.spec;
          if (!x.project && !x.options) return;   // done, or a step that waits for your call: its items belong to a choice
          var op = suggestedOpt(x);
          var mats = (op ? op.mats : x.mats) || [];
          var retried = ['slam', 'aug', 'desec'].indexOf(x.kind) > -1 && x.odds && x.odds.p < 0.995;
          mats.forEach(function (m) {
            if (m.opt) { if (!optK[m.k]) { optK[m.k] = 1; optional.push({ k: m.k, n: m.n, each: price(m.k, lg) }); } return; }
            var r = byK[m.k];
            if (!r) { r = byK[m.k] = { k: m.k, n: m.n, q: 0, each: price(m.k, lg), approx: !!m.approx, chance: null }; rows.push(r); }
            r.q += m.q || 1;
            if (retried && !r.chance) r.chance = { i: i, p: x.odds.p };
          });
          if (retried) {
            var mo = missOf(design, s, x);
            if (mo.type !== 'route') misses.push(Object.assign({ i: i }, mo));
          }
          if (x.project && x.project.type !== 'restart') s = apply(s, x.project);
        });
        rows.forEach(function (r) { r.total = r.each === null ? null : r.each * r.q; });
        return { base: base, rows: rows, misses: misses, optional: optional };
      });
    }
    /* What a recorded outcome used, as price keys and counts ({ sp: [[key, qty]], b: magic bases }), or null. */
    function spendOf(step, opt, outcome) {
      if (!outcome || outcome.astrid) return null;
      if (step.kind === 'base') return { sp: [], b: 1 };
      if (outcome.o && (outcome.o.type === 'restart' || outcome.o.type === 'skip')) return { sp: [], b: 0 };
      if (step.kind === 'finish') {
        // a finishing step that was done used its items, the optional ones too (the Divine Orb); Skip used nothing
        return outcome.label === 'Skip' || outcome.free ? { sp: [], b: 0 } : { sp: (step.mats || []).map(function (x) { return [x.k, x.q || 1]; }), b: 0 };
      }
      var mats = outcome.uses || (opt ? opt.mats : step.mats) || [];
      return { sp: required(mats).map(function (x) { return [x.k, x.q || 1]; }), b: 0 };
    }
    /* An entry saved before spend was recorded: what its step used, if the step still matches its title. */
    function deriveSpend(design, h) {
      if (h.e || typeof h.t !== 'string') return null;
      var from = h.ps || h.st;
      if (!from) return null;
      return inLeague(design, function () {
        var step = nextStep(design, clone(from));
        var cut = h.t.indexOf(' · ');
        var title = cut > -1 ? h.t.slice(0, cut) : h.t, optLabel = cut > -1 ? h.t.slice(cut + 3) : null;
        if (step.title !== title) return null;
        var opt = null;
        if (step.options) {
          if (optLabel === null) return { sp: [], b: 0 };   // Skip or Start a new base: the app leaves those out of the title
          opt = step.options.find(function (o) { return o.label === optLabel; });
          if (!opt) return null;
        }
        var outs = (opt ? opt.outcomes : step.outcomes) || [];
        var o = outs.find(function (x) { var l = x.label.replace(/…$/, ''); return h.o === l || String(h.o || '').indexOf(l + ':') === 0; });
        return o ? spendOf(step, opt, o) : null;
      });
    }
    /* Spend lists summed and priced at a league: { div, bases, known, unknown: [keys] }. */
    function spentOn(list, league) {
      var q = {}, bases = 0;
      list.forEach(function (x) { if (!x) return; bases += x.b || 0; (x.sp || []).forEach(function (p) { q[p[0]] = (q[p[0]] || 0) + p[1]; }); });
      var div = 0, unknown = [];
      Object.keys(q).forEach(function (k) { var v = price(k, league); if (v === null) unknown.push(k); else div += v * q[k]; });
      return { div: div, bases: bases, known: !unknown.length, unknown: unknown };
    }
    function costReset() { chains.clear(); }

    return {
      MODS: MODS, FAMS: FAMS, CLASS: CLASS, BASE: BASE,
      catalog: catalog, tierOptions: tierOptions, methods: methods, famName: famName, modText: modText,
      analyze: analyze, plan: plan, apply: apply, nextStep: nextStep, summary: summary, slamOddsFor: slamOddsFor,
      oddsLabel: oddsLabel, price: price, matsCost: matsCost, labelTier: labelTier, newId: newId, SIDE: SIDE, SIDE_CAP: SIDE_CAP, findBases: findBases, socketable: socketable, suggest: suggest, special: special, buyName: buyName,
      planCost: planCost, costPlan: costPlan, choicesOf: choicesOf, choiceCosts: choiceCosts, shoppingList: shoppingList,
      spendOf: spendOf, deriveSpend: deriveSpend, spentOn: spentOn, costReset: costReset,
      setLeague: setLeague, hardness: function (design, st, t) { var c = catalog(design.base, design.ilvl); return hardness(c, analyze(c, design, st), t); }
    };
  }

  root.createEngine = createEngine;
  if (typeof module !== 'undefined') module.exports = { createEngine: createEngine };
})(typeof window !== 'undefined' ? window : globalThis);
