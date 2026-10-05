/* Planner engine tests. Run: npm test (node's built-in test runner, no installs needed). */
const test = require('node:test');
const assert = require('node:assert');
const DATA = require('../data/data.json');
const PRICES = require('../src/prices.js');
const { createEngine } = require('../src/engine.js');

const E = createEngine(DATA, PRICES);
const GLOVES = 'Blacksteel Gauntlets';

/* A target on a base: family by its text template, tier by label (T1, T2, Alloy...). */
function tgt(cat, side, tmpl, tierLabel) {
  const F = cat.sides[side].find((f) => f.t === tmpl) || cat.sides[side].find((f) => f.t.includes(tmpl));
  assert.ok(F, 'no family ' + tmpl);
  const opts = E.tierOptions(cat, F.f);
  const o = tierLabel ? opts.find((x) => x.label === tierLabel) : opts[0];
  assert.ok(o, 'no tier ' + tierLabel + ' for ' + tmpl);
  return { f: F.f, lv: o.l, mi: o.mi };
}
let n = 0;
function mod(cat, side, tmpl, tierLabel, extra) {
  const t = tgt(cat, side, tmpl, tierLabel);
  n += 1;
  return Object.assign({ id: 't' + n, s: side, mi: t.mi, mark: 'auto' }, extra || {});
}
const junk = (side) => { n += 1; return { id: 'j' + n, s: side, mi: null, pseudo: 'junk', mark: 'junk' }; };

function glovesDesign() {
  const cat = E.catalog(GLOVES, 82);
  return {
    cat,
    design: {
      cls: 'gloves', base: GLOVES, ilvl: 82, runeforge: true, league: 'fr',
      targets: [
        [tgt(cat, 0, '+# to maximum Life', 'T1'), tgt(cat, 0, '+# to maximum Mana', 'T2'), tgt(cat, 0, '#% increased Runic Ward', 'Alloy')],
        [tgt(cat, 1, '+#% to Lightning Resistance', 'T2'), tgt(cat, 1, '+#% to Cold Resistance', 'T2'), tgt(cat, 1, '#% increased Critical Damage Bonus', 'T2')]
      ]
    }
  };
}

test('fresh gloves: base, regal, alloy into the junk side, slams, desecration, finish', () => {
  const { design } = glovesDesign();
  const steps = E.plan(design, { rarity: 'none', mods: [] });
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[0], 'base');
  assert.equal(kinds[1], 'regal');
  const craft = steps.find((s) => s.kind === 'craft');
  assert.ok(craft, 'has a crafted step');
  assert.match(craft.title, /Sovereign Alloy/);
  assert.ok(craft.odds.p >= 0.995, 'alloy deletion is certain to hit junk');
  assert.ok(kinds.includes('desec'), 'uses the desecration');
  assert.equal(kinds[kinds.length - 1], 'done');
  const base = steps[0].spec.find((r) => r.k === 'Suffix');
  assert.match(base.v, /sacrifice/, 'the base carries a sacrifice suffix for the alloy');
});

test('user case: life + mana with two junk suffixes -> alloy first, then annul the leftover junk', () => {
  const { cat, design } = glovesDesign();
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), mod(cat, 0, '+# to maximum Mana', 'T1'), junk(1), junk(1)] };
  const steps = E.plan(design, st);
  assert.equal(steps[0].kind, 'craft');
  assert.ok(steps[0].odds.p >= 0.995);
  assert.equal(steps[1].kind, 'remove');
  assert.equal(steps[1].recommended, 'annul');
});

test('one target and two junk suffixes -> start over before spending on the alloy', () => {
  const { cat, design } = glovesDesign();
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), junk(1), junk(1)] };
  const steps = E.plan(design, st);
  assert.equal(steps[0].kind, 'remove');
  assert.equal(steps[0].recommended, 'restart');
  assert.equal(steps.length, 1, 'projection stops after a restart');
  assert.ok(steps[0].endsHere);
});

test('every remove option has a cost, an average and outcomes', () => {
  const { cat, design } = glovesDesign();
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), mod(cat, 0, '+# to maximum Mana', 'T1'), mod(cat, 0, '#% increased Runic Ward', 'Alloy', { crafted: true }), junk(1)] };
  const step = E.nextStep(design, st);
  assert.equal(step.kind, 'remove');
  step.options.forEach((o) => {
    assert.equal(typeof o.cost, 'number');
    assert.equal(typeof o.exp, 'number');
    assert.ok(o.outcomes.length > 0, o.key + ' has outcomes');
  });
  assert.equal(step.options[0].key, step.recommended, 'suggested option is listed first');
});

test('keeping a lower tier of a target counts as filled', () => {
  const { cat, design } = glovesDesign();
  const low = mod(cat, 1, '+#% to Cold Resistance', 'T6', { mark: 'keep' });
  const A = E.analyze(cat, design, { rarity: 'rare', mods: [low] });
  assert.equal(low.status, 'hit');
  assert.ok(low.accepted);
  assert.ok(!A.sides[1].unfilled.some((t) => t.f === E.MODS[low.mi].f), 'cold resistance no longer needed');
  assert.equal(A.sides[1].unfilled.length, 2);
});

test('implicits change slot counts', () => {
  assert.deepEqual(E.catalog(GLOVES, 82).caps, [3, 3]);
  assert.deepEqual(E.catalog('Dusk Amulet', 82).caps, [4, 2]);
  assert.deepEqual(E.catalog('Penumbra Amulet', 82).caps, [5, 1]);
});

test('essences: the cheapest one that reaches the tier is chosen', () => {
  const cat = E.catalog('Amethyst Ring', 82);
  const t = tgt(cat, 0, '+# to maximum Life', 'T3');
  const m = E.methods(cat, t);
  assert.ok(m.essEarly.length >= 1);
  const prices = m.essEarly.map((e) => E.price(e.name, 'fr')).filter((v) => v !== null);
  assert.equal(E.price(m.essEarly[0].name, 'fr'), Math.min(...prices));
});

test('apply: restart clears the item and skips, skip marks a family', () => {
  const { cat } = glovesDesign();
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1')], skip: {} };
  const skipped = E.apply(st, { type: 'skip', f: 5 });
  assert.ok(skipped.skip[5]);
  const fresh = E.apply(skipped, { type: 'restart' });
  assert.equal(fresh.rarity, 'none');
  assert.equal(fresh.mods.length, 0);
  assert.deepEqual(fresh.skip, {});
});

test('odds labels', () => {
  assert.equal(E.oddsLabel(1), 'certain');
  assert.equal(E.oddsLabel(0.5), '50%');
  assert.equal(E.oddsLabel(0.05), '≈1 in 20');
  assert.equal(E.oddsLabel(0), 'not possible here');
});

/* Gloves with two alloy-only targets: Runic Ward (prefix) and Cast Speed (suffix). */
function twoAlloyGloves(astrid) {
  const cat = E.catalog(GLOVES, 82);
  return {
    cls: 'gloves', base: GLOVES, ilvl: 82, runeforge: true, league: 'fr', astrid,
    targets: [
      [tgt(cat, 0, '+# to maximum Life', 'T1'), tgt(cat, 0, '+# to maximum Mana', 'T2'), tgt(cat, 0, '#% increased Runic Ward', 'Alloy')],
      [tgt(cat, 1, '+#% to Lightning Resistance', 'T2'), tgt(cat, 1, '+#% to Cold Resistance', 'T2'), tgt(cat, 1, '#% increased Cast Speed', 'Alloy')]
    ]
  };
}

test('astrid: without the rune, a second alloy-only mod has no route and the plan says why', () => {
  const steps = E.plan(twoAlloyGloves(false), { rarity: 'none', mods: [] });
  assert.equal(steps[steps.length - 1].kind, 'stop');
  const warned = steps.find((s) => (s.warn || []).some((w) => /Only one crafted modifier/.test(w)));
  assert.ok(warned, 'warns about the one crafted slot');
  assert.ok(warned.warn.some((w) => /Astrid’s Creativity/.test(w)), 'and points at Astrid’s Creativity');
  assert.ok(!steps.some((s) => s.kind === 'rune'));
});

test('astrid: both alloys go on, with the rune socketed right before the second', () => {
  const steps = E.plan(twoAlloyGloves(true), { rarity: 'none', mods: [] });
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[kinds.length - 1], 'done');
  const crafts = steps.filter((s) => s.kind === 'craft');
  assert.deepEqual(crafts.map((s) => s.mats[s.mats.length - 1].n), ['Sovereign Alloy', 'Swift Alloy']);
  const r = kinds.indexOf('rune');
  assert.ok(r > kinds.indexOf('craft'), 'the rune waits until after the first crafted mod');
  assert.equal(steps[r + 1], crafts[1], 'and goes in right before the second');
  assert.deepEqual(steps[r].mats.map((m) => m.k), ['artificer', "Astrid's Creativity"]);
  assert.ok(crafts.every((s) => s.odds.p >= 0.995), 'each alloy deletes only junk');
});

test('astrid: an early essence and an alloy share the two crafted slots', () => {
  const cat = E.catalog(GLOVES, 82);
  const design = (astrid) => ({
    cls: 'gloves', base: GLOVES, ilvl: 82, runeforge: false, league: 'fr', astrid,
    targets: [[tgt(cat, 0, '+# to maximum Life', 'T1'), tgt(cat, 0, '+# to maximum Mana', 'T3'), tgt(cat, 0, '#% increased Runic Ward', 'Alloy')],
      [tgt(cat, 1, '+#% to Lightning Resistance', 'T2'), tgt(cat, 1, '+#% to Cold Resistance', 'T2')]]
  });
  assert.equal(E.plan(design(false), { rarity: 'none', mods: [] })[1].kind, 'regal', 'one crafted slot: the alloy has it');
  const kinds = E.plan(design(true), { rarity: 'none', mods: [] }).map((s) => s.kind);
  assert.deepEqual(kinds.slice(0, 4), ['base', 'essence', 'rune', 'craft']);
});

/* Cryptic Leggings: Movement Speed and Rarity, optionally with Runic Ward (Sovereign Alloy only) and Effect of
   Socketed Augment Items (Essence of Horror only). */
function leggings(extra, astrid) {
  const cat = E.catalog('Cryptic Leggings', 82);
  const top = (s, re) => { const F = cat.sides[s].find((f) => re.test(f.name)); const o = E.tierOptions(cat, F.f)[0]; return { f: F.f, mi: o.mi, lv: o.l }; };
  const P = [top(0, /^Movement Speed/)], S = [top(1, /^Rarity of Items/)];
  if (extra) { P.push(top(0, /^Runic Ward/)); S.push(top(1, /Socketed Augment/)); }
  return { cls: 'boots', base: 'Cryptic Leggings', ilvl: 82, runeforge: false, league: 'fr', astrid, targets: [P, S] };
}

test('astrid: craft-only mods get the crafted slots before an essence takes one', () => {
  const steps = E.plan(leggings(true, true), { rarity: 'none', mods: [] });
  const kinds = steps.map((s) => s.kind);
  assert.equal(kinds[kinds.length - 1], 'done', 'no stop for Effect of Socketed Augment Items');
  assert.ok(!kinds.includes('essence'), 'Rarity is slammed or desecrated, not essenced');
  const crafts = steps.filter((s) => s.kind === 'craft');
  assert.deepEqual(crafts.map((s) => s.mats[s.mats.length - 1].n), ['Sovereign Alloy', 'Essence of Horror']);
  assert.ok(crafts.every((s) => s.odds.p >= 0.995), 'each deletion only hits junk: the second sacrifice goes on the empty side');
});

test('magic: an augment doesn’t aim at the target an essence adds anyway', () => {
  const kinds = E.plan(leggings(false, false), { rarity: 'none', mods: [] }).map((s) => s.kind);
  assert.deepEqual(kinds.slice(0, 2), ['base', 'essence']);
  assert.ok(!kinds.includes('aug'));
});

test('suggest: the magic base the plan starts from, and the item when it turns rare', () => {
  const names = (mods) => mods.map((m) => (m.s ? 'S ' : 'P ') + (m.pseudo ? 'any' : E.famName(E.MODS[m.mi].f)));
  assert.deepEqual(names(E.suggest(leggings(false, false), 'magic')), ['P Movement Speed'], 'no suffix: the essence adds Rarity');
  const rare = E.suggest(leggings(false, false), 'rare');
  assert.deepEqual(names(rare), ['P Movement Speed', 'S Rarity of Items found']);
  assert.ok(rare[1].crafted, 'the essence mod counts as crafted');
  assert.deepEqual(names(E.suggest(leggings(true, true), 'magic')), ['P Movement Speed', 'S any'], 'the suffix side is junk for the alloy');
  const base = E.nextStep(leggings(true, true), { rarity: 'none', mods: [] });
  assert.deepEqual(names(E.suggest(leggings(true, true), 'magic')), names(base.project.mods), 'same as the plan’s base step');
  assert.equal(E.suggest({ cls: 'boots', base: 'Cryptic Leggings', ilvl: 82, targets: [[], []] }, 'magic'), null, 'nothing to suggest without targets');
});

test('astrid: only bases with augment sockets take the rune', () => {
  assert.ok(E.socketable(E.BASE[GLOVES]));
  assert.ok(E.socketable(E.BASE['Grasping Ring']), 'jewellery made for socketed items');
  assert.ok(!E.socketable(E.BASE['Prismatic Ring']));
  assert.ok(!E.socketable(DATA.bases.find((b) => b.c === 'quiver')));
  const cat = E.catalog('Prismatic Ring', 82);
  const plain = { cls: 'ring', base: 'Prismatic Ring', ilvl: 82, league: 'fr', targets: [[tgt(cat, 0, '+# to maximum Life')], [tgt(cat, 1, '+#% to Cold Resistance')]] };
  const titles = (d) => E.plan(d, { rarity: 'none', mods: [] }).map((s) => s.title);
  assert.deepEqual(titles(Object.assign({ astrid: true }, plain)), titles(plain), 'ticking it on a ring changes nothing');
  assert.ok(!titles(plain).includes('Sockets and runes'), 'no socket step on a ring');
});

test('find a base: a full name finds it in any slot', () => {
  const r = E.findBases('cryptic leggings');
  assert.equal(r.total, 1);
  assert.equal(r.list[0].b.n, 'Cryptic Leggings');
  assert.equal(r.list[0].b.c, 'boots');
  assert.equal(E.findBases('  CRYPTIC   leg ').list[0].b.n, 'Cryptic Leggings', 'case, spaces and partial words');
});

test('find a base: ties go to the current slot, then the higher level base', () => {
  const names = (cls) => E.findBases('cryptic', { cls }).list.map((x) => x.b.n);
  assert.deepEqual(names('boots'), ['Cryptic Leggings', 'Cryptic Crown', 'Cryptic Helm']);
  assert.deepEqual(names('helmet'), ['Cryptic Crown', 'Cryptic Helm', 'Cryptic Leggings']);
});

test('find a base: slot and defence words narrow it down', () => {
  const r = E.findBases('evasion boots', { limit: 999 });
  const want = DATA.bases.filter((b) => b.c === 'boots' && /Evasion/.test(b.sub)).length;
  assert.equal(r.total, want);
  assert.ok(r.list.every((x) => x.b.c === 'boots' && /Evasion/.test(x.b.sub)));
  assert.ok(E.findBases('chest', { limit: 999 }).list.every((x) => x.b.c === 'body'), 'chest means body armour');
  assert.ok(E.findBases('es gloves', { limit: 999 }).list.every((x) => /Energy Shield/.test(x.b.sub)), 'es means energy shield');
  assert.deepEqual(E.findBases('cryptic boots').list[0].on, ['n', 'k'], 'says where each word matched');
});

test('find a base: name matches rank above slot, mid-word and implicit matches', () => {
  const r = E.findBases('ring', { limit: 999 });
  assert.equal(r.list[0].b.n, 'Ring', 'exact name first');
  const at = (n) => r.list.findIndex((x) => x.b.n === n);
  assert.ok(at('Dusk Ring') < at('Abyssal Signet'), 'name beats slot');
  assert.ok(at('Abyssal Signet') < at('Soldiering Sabatons'), 'slot beats the middle of a word');
  const s = E.findBases('spirit').list.find((x) => x.b.n === 'Solar Amulet');
  assert.ok(s, 'implicits are searched');
  assert.match(s.imp, /Spirit/, 'and the matching implicit line comes back');
  assert.ok(!E.findBases('spirit').list.some((x) => x.b.n === 'Lament Amulet'), 'skill variants are not searched');
});

test('find a base: apostrophes, limits and empty queries', () => {
  assert.equal(E.findBases("runefathers").list[0].b.n, "Runefather's Grasping Mail");
  assert.equal(E.findBases("scout's vest").list[0].b.n, "Scout's Vest");
  assert.equal(E.findBases('a', { limit: 5 }).list.length, 5);
  assert.ok(E.findBases('a', { limit: 5 }).total > 5);
  assert.equal(E.findBases('').total, 0);
  assert.equal(E.findBases(' - ').total, 0);
  assert.equal(E.findBases('zzzqqq').total, 0);
});

test('stable mod ids exist for every mod', () => {
  assert.equal(DATA.ids.length, DATA.mods.length);
  assert.equal(new Set(DATA.ids).size, DATA.ids.length);
});
