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

test('stable mod ids exist for every mod', () => {
  assert.equal(DATA.ids.length, DATA.mods.length);
  assert.equal(new Set(DATA.ids).size, DATA.ids.length);
});
