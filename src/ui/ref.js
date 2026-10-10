/* Reference screen: the sortable materials ledger. Prices come from the same snapshot the planner uses. */
(function () {
  'use strict';
  var P = window.PRICES.p;
  function lg() { return window.App ? window.App.league() : 'fr'; }
  var SRC_ORDER = ['Drops', 'Ritual', 'Abyss', 'Essence', 'Runes of Aldur', 'Breach', 'Delirium'];
  var SRC_VAR = { 'Drops': '--src-drops', 'Ritual': '--src-ritual', 'Abyss': '--src-abyss', 'Essence': '--src-essence', 'Runes of Aldur': '--src-aldur', 'Breach': '--src-breach', 'Delirium': '--src-delirium' };
  var TYPE_ORDER = ['Currency', 'Omen', 'Bone', 'Essence', 'Alloy', 'Material', 'Catalyst', 'Emotion', 'Socketable'];
  function L(label, key) { var v = P[key] || [null, null]; return [label, v[0], v[1]]; }
  function V(key) { return P[key] || [null, null]; }
  var ALLOYS = ['Sovereign Alloy', 'Runic Alloy', 'Swift Alloy', 'Mystic Alloy', 'Prismatic Alloy', 'Adaptive Alloy', 'Protective Alloy', 'Expansive Alloy', 'Cyclonic Alloy', 'Celestial Alloy', 'Transcendent Alloy', "The Runebinder's Alloy", "The Runefather's Alloy"];
  function range(names) {
    return [0, 1].map(function (i) {
      var v = names.map(function (n) { return (P[n] || [])[i]; }).filter(function (x) { return x !== null && x !== undefined; });
      return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : [null, null];
    });
  }
  var DATA = [
    { n: 'Orb of Transmutation', t: 'Currency', w: 'Drops', what: 'Turns a normal item magic with one mod.', notes: 'Greater rolls mod level 44+, Perfect 70+ (top tiers only). There’s no Alteration Orb, so a bad roll costs the base.', p: { lines: [L('Base', 'trans'), L('Greater', 'gtrans'), L('Perfect', 'ptrans')] } },
    { n: 'Orb of Augmentation', t: 'Currency', w: 'Drops', what: 'Adds a second mod to a magic item, on its open side.', notes: 'Greater rolls mod level 44+, Perfect 70+.', p: { lines: [L('Base', 'aug'), L('Greater', 'gaug'), L('Perfect', 'paug')] } },
    { n: 'Regal Orb', t: 'Currency', w: 'Drops', what: 'Upgrades magic to rare and adds a third mod.', notes: 'Greater rolls mod level 35+, Perfect 50+. A Greater Essence does the same job with a guaranteed mod.', p: { lines: [L('Base', 'regal'), L('Greater', 'gregal'), L('Perfect', 'pregal')] } },
    { n: 'Exalted Orb', t: 'Currency', w: 'Drops', what: 'Adds one random mod to a rare with an open slot.', notes: 'Greater rolls mod level 35+, Perfect 50+. Aim it with Exaltation omens.', p: { lines: [L('Base', 'exalt'), L('Greater', 'gexalt'), L('Perfect', 'pexalt')] } },
    { n: 'Chaos Orb', t: 'Currency', w: 'Drops', what: 'Removes one random mod and adds one random mod.', notes: 'Greater and Perfect raise the new mod to level 35+ and 50+. Whittling or Erasure omens control which mod leaves.', p: { lines: [L('Base', 'chaos'), L('Greater', 'gchaos'), L('Perfect', 'pchaos')] } },
    { n: 'Orb of Alchemy', t: 'Currency', w: 'Drops', what: 'Turns a normal item rare with four random mods.', notes: 'Mostly for waystones. On gear it fills slots you’d rather choose.', p: { v: V('alch') } },
    { n: 'Orb of Annulment', t: 'Currency', w: 'Drops', what: 'Removes one random mod.', notes: 'Cheap but blind. Aim it with a Sinistral or Dextral Annulment omen, or Omen of Light for a desecrated mod.', p: { v: V('annul') } },
    { n: 'Divine Orb', t: 'Currency', w: 'Drops', what: 'Rerolls the numbers on every mod within its tier.', notes: 'A finishing step. It can roll values down, so stop once they’re good. Fractured mods keep their values.', p: { v: V('divine') } },
    { n: 'Fracturing Orb', t: 'Currency', w: 'Drops', what: 'Permanently locks one random mod on a rare with four or more mods.', notes: 'You can’t pick the mod. Used to protect keepers before a side annul. In 0.5 it only drops with Atlas specialisation, so most people buy it.', p: { v: V('fracture') } },
    { n: 'Vaal Orb', t: 'Currency', w: 'Drops', what: 'Corrupts the item with a random outcome. Nothing can change it afterwards.', notes: 'Always the last step. No omen makes it safe in the current leagues.', p: { v: V('vaal') } },
    { n: 'Artificer’s Orb', t: 'Currency', w: 'Drops', what: 'Adds an augment socket.', notes: 'Add sockets and runes after the mods are final.', p: { v: V('artificer') } },
    { n: 'Quality orbs', t: 'Currency', w: 'Drops', what: 'Armourer’s Scrap, Blacksmith’s Whetstone and Arcanist’s Etcher add quality to armour, martial weapons and caster weapons.', notes: 'On armour, each 1% quality gives 1% more Armour, Evasion, Energy Shield and Runic Ward.', p: { lines: [L('Scrap', 'scrap'), L('Whetstone', 'whetstone'), L('Etcher', 'etcher')] } },

    { n: 'Omen of Sinistral Exaltation', t: 'Omen', w: 'Ritual', what: 'Your next Exalted Orb adds a prefix.', notes: 'Add Omen of Greater Exaltation for two prefixes.', p: { v: V('o_sin_ex') } },
    { n: 'Omen of Dextral Exaltation', t: 'Omen', w: 'Ritual', what: 'Your next Exalted Orb adds a suffix.', notes: 'Add Omen of Greater Exaltation for two suffixes.', p: { v: V('o_dex_ex') } },
    { n: 'Omen of Greater Exaltation', t: 'Omen', w: 'Ritual', what: 'Your next Exalted Orb adds two mods.', notes: 'Pair it with a side omen to put both on one side.', p: { v: V('o_gr_ex') } },
    { n: 'Omen of Catalysing Exaltation', t: 'Omen', w: 'Ritual', what: 'Your next Exalted Orb favours mods that match the item’s catalyst quality.', notes: 'Rings and amulets. Apply catalysts first.', p: { v: V('o_cat_ex') } },
    { n: 'Omen of Sinistral Annulment', t: 'Omen', w: 'Ritual', what: 'Your next Orb of Annulment removes a prefix.', notes: 'Random among prefixes that aren’t fractured.', p: { v: V('o_sin_an') } },
    { n: 'Omen of Dextral Annulment', t: 'Omen', w: 'Ritual', what: 'Your next Orb of Annulment removes a suffix.', notes: 'Random among suffixes that aren’t fractured.', p: { v: V('o_dex_an') } },
    { n: 'Omen of Sinistral Erasure', t: 'Omen', w: 'Ritual', what: 'Your next Chaos Orb removes a prefix.', notes: 'Stack it with Whittling to remove the lowest-level prefix.', p: { v: V('o_sin_er') } },
    { n: 'Omen of Dextral Erasure', t: 'Omen', w: 'Ritual', what: 'Your next Chaos Orb removes a suffix.', notes: 'Stack it with Whittling to remove the lowest-level suffix.', p: { v: V('o_dex_er') } },
    { n: 'Omen of Whittling', t: 'Omen', w: 'Ritual', what: 'Your next Chaos Orb removes the mod with the lowest required item level.', notes: 'Item level, not tier. Hover the Chaos Orb to see the marked mod. Rarity, low resists and low alloy tiers usually go first.', p: { v: V('o_whit') } },
    { n: 'Omen of Sinistral Crystallisation', t: 'Omen', w: 'Ritual', what: 'Your next Perfect or Corrupted Essence, or Alloy, removes a prefix.', notes: 'The new mod still lands on its own side.', p: { v: V('o_sin_cr') } },
    { n: 'Omen of Dextral Crystallisation', t: 'Omen', w: 'Ritual', what: 'Your next Perfect or Corrupted Essence, or Alloy, removes a suffix.', notes: 'The new mod still lands on its own side.', p: { v: V('o_dex_cr') } },
    { n: 'Omen of Sanctification', t: 'Omen', w: 'Ritual', what: 'Your next Divine Orb multiplies each mod by 78–122% and locks the item.', notes: 'A final gamble. Sanctified items can’t be crafted further.', p: { v: V('o_sanct') } },
    { n: 'Omen of the Blessed', t: 'Omen', w: 'Ritual', what: 'Your next Divine Orb rerolls only implicit mods.', notes: 'Leaves your explicit rolls alone.', p: { v: V('o_blessed') } },

    { n: 'Omen of Sinistral Necromancy', t: 'Omen', w: 'Abyss', what: 'Your next desecration adds a prefix.', notes: '', p: { v: V('o_sin_nec') } },
    { n: 'Omen of Dextral Necromancy', t: 'Omen', w: 'Abyss', what: 'Your next desecration adds a suffix.', notes: '', p: { v: V('o_dex_nec') } },
    { n: 'Omen of Abyssal Echoes', t: 'Omen', w: 'Abyss', what: 'Lets you reroll the three Well of Souls options once.', notes: 'You still pick from one set of three.', p: { v: V('o_echo') } },
    { n: 'Omen of Light', t: 'Omen', w: 'Abyss', what: 'Your next Orb of Annulment removes only the desecrated mod.', notes: 'Undoes a bad pick so you can desecrate again. Drops from rares in Abyssal Depths.', p: { v: V('o_light') } },
    { n: 'Lich omens', t: 'Omen', w: 'Abyss', what: 'Sovereign, Liege and Blackblooded force your next desecration to roll from Ulaman, Amanamu or Kurgal.', notes: 'Weapons and jewellery only.', p: { lines: [L('Sovereign', 'o_sov'), L('Liege', 'o_liege'), L('Blackblooded', 'o_black')] } },
    { n: 'Gnawed bones', t: 'Bone', w: 'Abyss', what: 'Adds a hidden desecrated mod. Reveal it at the Well of Souls and pick one of three.', notes: 'Items up to item level 64 only. One desecrated mod per item.', p: { lines: [L('Rib', 'Gnawed Rib'), L('Jawbone', 'Gnawed Jawbone'), L('Collarbone', 'Gnawed Collarbone')] } },
    { n: 'Preserved bones', t: 'Bone', w: 'Abyss', what: 'Adds a hidden desecrated mod at any item level. Reveal it at the Well of Souls and pick one of three.', notes: 'Rib: armour. Jawbone: weapons and quivers. Collarbone: rings, amulets, belts. Cranium: jewels. On a full item it deletes a random mod first.', p: { lines: [L('Rib', 'Preserved Rib'), L('Jawbone', 'Preserved Jawbone'), L('Collarbone', 'Preserved Collarbone'), L('Cranium', 'Preserved Cranium')] } },
    { n: 'Ancient bones', t: 'Bone', w: 'Abyss', what: 'Like Preserved bones, but every option is mod level 40 or higher.', notes: 'Worth it for a final pick where tiers matter.', p: { lines: [L('Rib', 'Ancient Rib'), L('Jawbone', 'Ancient Jawbone'), L('Collarbone', 'Ancient Collarbone')] } },

    { n: 'Greater Essences', t: 'Essence', w: 'Essence', what: 'Upgrade magic to rare and add the essence’s guaranteed mod. Lesser and normal ones do the same at lower tiers.', notes: 'Counts as your one crafted mod. Three of one tier make one of the next at the reforge bench.', p: { lines: [L('Body (life)', 'Greater Essence of the Body'), L('Mind (mana)', 'Greater Essence of the Mind'), L('Grounding', 'Greater Essence of Grounding'), L('Seeking', 'Greater Essence of Seeking')] } },
    { n: 'Perfect Essences', t: 'Essence', w: 'Essence', what: 'On a rare, remove a random mod and add a stronger guaranteed mod.', notes: 'Counts as your crafted mod. A Crystallisation omen picks which side loses a mod.', p: { lines: [L('Body', 'Perfect Essence of the Body'), L('Grounding', 'Perfect Essence of Grounding'), L('Enhancement', 'Perfect Essence of Enhancement')] } },
    { n: 'Corrupted essences', t: 'Essence', w: 'Essence', what: 'Hysteria, Delirium, Horror and Insanity add unusual guaranteed mods to rares.', notes: 'Made by using a Remnant of Corruption on an essence monolith. Crystallisation omens work on them. Check the tooltip for your slot.', p: { lines: [L('Insanity', 'Essence of Insanity'), L('Horror', 'Essence of Horror'), L('Delirium', 'Essence of Delirium'), L('Hysteria', 'Essence of Hysteria')] } },
    { n: 'Essence of the Abyss', t: 'Essence', w: 'Essence', what: 'Removes a random mod and adds a Mark of the Abyssal Lord.', notes: 'Your next desecration turns the mark into a higher-tier desecrated mod.', p: { v: V('Essence of the Abyss') } },

    { n: 'Verisium', t: 'Material', w: 'Runes of Aldur', what: 'Runeforges armour at the Verisium Anvil, adding Runic Ward.', notes: 'Above item level 55 it trades some Armour, Evasion or Energy Shield for the ward. The Anvil previews the result. Blacksteel Gauntlets take 355.', p: { per: V('verisium'), qty: 355 } },
    { n: 'Exceptional Verisium', t: 'Material', w: 'Runes of Aldur', what: 'Runeforges special bases at the Verisium Anvil, like Grasping Mail, and upgrades Kalguuran uniques.', notes: 'Grasping Mail takes 5 to become Runeforged, the first of three changes that make a Runefather’s Grasping Mail. From Expedition maps.', p: { v: V('xverisium') } },
    { n: 'Runic Alloys', t: 'Alloy', w: 'Runes of Aldur', what: 'Thirteen kinds. Each removes a random mod and adds an alloy-only crafted mod that depends on the item slot.', notes: 'Counts as your crafted mod. A Crystallisation omen picks the side. The Design screen shows which alloy gives what on your base.', p: { range: range(ALLOYS) } },
    { n: 'Astrid’s Creativity', t: 'Socketable', w: 'Runes of Aldur', what: 'A rune: the item can have one more crafted modifier, so two essence or alloy mods instead of one.', notes: 'Goes in an augment socket (add one with an Artificer’s Orb), so not on most jewellery or quivers. Socket it before the second crafted mod. It can’t be taken out again. Comes from rune recipes at Verisium Remnants.', p: { v: V('Astrid\'s Creativity') } },
    { n: 'Sovereign Alloy', t: 'Alloy', w: 'Runes of Aldur', what: 'Armour: (31–40)% increased Runic Ward at item level 65+, (24–30)% below. Weapons: socketed augment effect. Jewellery: larger explicit resistance rolls.', notes: 'The armour mod only scales that piece’s own Runic Ward, so Runeforge it.', p: { v: V('Sovereign Alloy') } },

    { n: 'Catalysts', t: 'Catalyst', w: 'Breach', what: 'Add quality to rings and amulets that boosts mods with a matching tag. New ones in 0.5 also work on jewels.', notes: 'Only from the Genesis Tree in 0.5. Refined versions cost more.', p: { lines: [['Flesh (life)', 0.00844, 0.01832], ['Skittering (speed)', 0.3681, 0.2789], ['Sibilant (caster)', 0.6532, 0.3214]] } },
    { n: 'Liquid Emotions', t: 'Emotion', w: 'Delirium', what: 'Instill amulets with notable passives. In 0.5 some also add crafted mods to jewels.', notes: 'Potent and Concentrated versions cost more.', p: { range: [[0.00156, 0.007166], [0.001977, 0.01977]] } },
    { n: 'Runes and Soul Cores', t: 'Socketable', w: 'Drops', what: 'Go in augment sockets for fixed bonuses. Some 0.5 runes unlock extra mod pools for crafting.', notes: 'Socketing is permanent and a new one destroys the old. Soul Cores come mostly from the Trial of Chaos.', p: null }
  ];

  var KEY = 'poe2-crafting-playbook-v1';
  var state = { q: '', src: 'All', sort: 'where', dir: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (['where', 'type', 'name', 'cost'].indexOf(saved.sort) > -1) state.sort = saved.sort;
      if (saved.dir === 1 || saved.dir === -1) state.dir = saved.dir;
      if (saved.src === 'All' || SRC_ORDER.indexOf(saved.src) > -1) state.src = saved.src;
    }
  } catch (e) { /* no saved view */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ sort: state.sort, dir: state.dir, src: state.src })); } catch (e) { /* ignore */ } }

  function trimNum(s) { return s.indexOf('.') > -1 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmt(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 0.1) {
      if (v < 1) return trimNum(v.toFixed(2)) + ' div';
      if (v < 10) return trimNum(v.toFixed(1)) + ' div';
      return Math.round(v) + ' div';
    }
    var ex = v * window.PRICES.exPerDiv[lg()];
    if (ex < 0.95) return '&lt;1 ex';
    return Math.max(1, Math.round(ex)) + ' ex';
  }
  function li() { return lg() === 'fr' ? 0 : 1; }
  function sortVal(r) {
    var p = r.p, i = li();
    if (!p) return null;
    if (p.v) return p.v[i];
    if (p.lines) {
      var vals = p.lines.map(function (l) { return l[1 + i]; }).filter(function (x) { return x !== null && x !== undefined; });
      return vals.length ? Math.min.apply(null, vals) : null;
    }
    if (p.range) return p.range[i][0];
    if (p.per) return p.per[i] === null ? null : p.per[i] * p.qty;
    return null;
  }
  function val(v) { return '<span class="px-v' + ((v !== null && v >= 5) ? ' hi' : '') + '">' + fmt(v) + '</span>'; }
  function priceHTML(r) {
    var p = r.p, i = li();
    if (!p) return '<div class="px"><span class="px-l">Varies</span><span class="px-v">—</span></div>';
    if (p.v) return '<div class="px"><span class="px-l">Each</span>' + val(p.v[i]) + '</div>';
    if (p.lines) return p.lines.map(function (l) { return '<div class="px"><span class="px-l">' + l[0] + '</span>' + val(l[1 + i]) + '</div>'; }).join('');
    if (p.range) return '<div class="px"><span class="px-l">Range</span><span class="px-v">' + fmt(p.range[i][0]) + ' – ' + fmt(p.range[i][1]) + '</span></div>';
    if (p.per) return '<div class="px"><span class="px-l">For ' + p.qty + '</span>' + val(p.per[i] === null ? null : p.per[i] * p.qty) + '</div>';
    return '';
  }
  function srcTag(w) { return '<span class="src-tag"><i style="--dot:var(' + SRC_VAR[w] + ')"></i>' + w + '</span>'; }

  var rowsEl = document.getElementById('rows'), countEl = document.getElementById('count'), qEl = document.getElementById('q');
  var sortEl = document.getElementById('sort'), clearEl = document.getElementById('clear'), srcsEl = document.getElementById('srcs');
  srcsEl.innerHTML = ['All'].concat(SRC_ORDER).map(function (s) {
    var dot = s === 'All' ? '' : '<i style="--dot:var(' + SRC_VAR[s] + ')"></i>';
    return '<button type="button" class="src" data-src="' + s + '" aria-pressed="false">' + dot + s + '</button>';
  }).join('');

  function compare(a, b) {
    var d = state.dir;
    if (state.sort === 'name') return d * a.n.localeCompare(b.n);
    if (state.sort === 'where') { var x = SRC_ORDER.indexOf(a.w) - SRC_ORDER.indexOf(b.w); return x ? d * x : a.n.localeCompare(b.n); }
    if (state.sort === 'type') { var y = TYPE_ORDER.indexOf(a.t) - TYPE_ORDER.indexOf(b.t); return y ? d * y : a.n.localeCompare(b.n); }
    var va = sortVal(a), vb = sortVal(b);
    if (va === null && vb === null) return a.n.localeCompare(b.n);
    if (va === null) return 1;
    if (vb === null) return -1;
    return va === vb ? a.n.localeCompare(b.n) : d * (va - vb);
  }
  function render() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.filter(function (r) {
      if (state.src !== 'All' && r.w !== state.src) return false;
      if (!q) return true;
      return (r.n + ' ' + r.t + ' ' + r.w + ' ' + r.what + ' ' + r.notes).toLowerCase().indexOf(q) > -1;
    }).sort(compare);
    var grouped = state.sort === 'where' || state.sort === 'type';
    var html = '', last = null, counts = {};
    if (grouped) list.forEach(function (r) { var g = state.sort === 'where' ? r.w : r.t; counts[g] = (counts[g] || 0) + 1; });
    list.forEach(function (r) {
      if (grouped) {
        var g = state.sort === 'where' ? r.w : r.t;
        if (g !== last) {
          var dot = state.sort === 'where' ? '<i class="g-dot" style="--dot:var(' + SRC_VAR[g] + ')"></i>' : '';
          html += '<tr class="group"><th colspan="6" scope="colgroup"><span class="g-wrap">' + dot + g + ' <span class="g-n">' + counts[g] + '</span></span></th></tr>';
          last = g;
        }
      }
      html += '<tr class="item2"><td class="c-name">' + r.n + '</td><td class="c-type"><span class="ttag">' + r.t + '</span></td><td class="c-where">' + srcTag(r.w) + '</td>' +
        '<td class="c-what">' + r.what + '</td><td class="c-notes" data-label="Notes">' + r.notes + '</td><td class="c-cost" data-label="Cost">' + priceHTML(r) + '</td></tr>';
    });
    if (!list.length) html = '<tr class="empty"><td colspan="6">Nothing matches. Clear the search or pick another source.</td></tr>';
    rowsEl.innerHTML = html;
    countEl.textContent = 'Showing ' + list.length + ' of ' + DATA.length + ' · prices for ' + (lg() === 'fr' ? 'Forbidden Rites' : 'Runes of Aldur');
    clearEl.hidden = !(state.q || state.src !== 'All');
    document.querySelectorAll('#ledger thead th[data-key]').forEach(function (th) {
      var on = th.getAttribute('data-key') === state.sort;
      th.setAttribute('aria-sort', on ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
      th.querySelector('.arr').textContent = on ? (state.dir === 1 ? '▲' : '▼') : '';
    });
    sortEl.value = state.sort === 'name' ? (state.dir === 1 ? 'name' : 'name-desc') : state.sort === 'cost' ? (state.dir === 1 ? 'cost' : 'cost-desc') : state.sort;
    srcsEl.querySelectorAll('.src').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-src') === state.src)); });
    save();
  }
  qEl.addEventListener('input', function () { state.q = qEl.value; render(); });
  sortEl.addEventListener('change', function () {
    var v = sortEl.value;
    if (v === 'name-desc') { state.sort = 'name'; state.dir = -1; } else if (v === 'cost-desc') { state.sort = 'cost'; state.dir = -1; } else { state.sort = v; state.dir = 1; }
    render();
  });
  document.querySelectorAll('#ledger thead button[data-sort]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      render();
    });
  });
  srcsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.src'); if (!b) return;
    var s = b.getAttribute('data-src');
    state.src = (state.src === s && s !== 'All') ? 'All' : s;
    render();
  });
  clearEl.addEventListener('click', function () { state.q = ''; qEl.value = ''; state.src = 'All'; render(); qEl.focus(); });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('#v-ref .use').forEach(function (b) {
    b.addEventListener('click', function () {
      state.q = b.getAttribute('data-q'); qEl.value = state.q; state.src = 'All';
      render();
      document.getElementById('r-materials').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
  document.querySelectorAll('[data-jump]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var t = document.getElementById(a.getAttribute('data-jump'));
      if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });
  window.RefLedger = { render: render };
  render();
})();
