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

test('fresh gloves: the base carries a target on each side, and the alloy’s junk comes once it’s rare', () => {
  const { design } = glovesDesign();
  const steps = E.plan(design, { rarity: 'none', mods: [] });
  const kinds = steps.map((s) => s.kind);
  assert.deepEqual(kinds.slice(0, 4), ['base', 'regal', 'sacrifice', 'craft']);
  const spec = Object.fromEntries(steps[0].spec.map((r) => [r.k, r.v]));
  assert.equal(spec.Prefix, 'Maximum Life T1+');
  assert.match(spec.Suffix, /^(Lightning|Cold) Resistance T2\+$/, 'a suffix target is bought, not junk');
  assert.match(steps[0].how, /adds junk for it once the item is rare/);
  assert.match(steps[3].title, /Sovereign Alloy/);
  assert.equal(steps[3].odds.p, 0.5, 'the alloy deletes the junk or the bought suffix');
  assert.ok(kinds.includes('desec'), 'uses the desecration');
  assert.equal(kinds[kinds.length - 1], 'done');
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

test('astrid: without the rune, a second alloy-only mod ends on a step that explains it and offers the rune', () => {
  const steps = E.plan(twoAlloyGloves(false), { rarity: 'none', mods: [] });
  const warned = steps.find((s) => (s.warn || []).some((w) => /Only one crafted modifier/.test(w)));
  assert.ok(warned, 'warns about the one crafted slot');
  assert.ok(warned.warn.some((w) => /Astrid’s Creativity/.test(w)), 'and points at Astrid’s Creativity');
  const last = steps[steps.length - 1];
  assert.match(last.title, /Use Astrid’s Creativity for Cast Speed/);
  assert.match(last.how, /only comes from a Swift Alloy/);
  assert.ok(last.outcomes[0].astrid, 'first choice turns the rune on');
  assert.ok(!last.project, 'nothing is socketed until you choose it');
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
  const steps = E.plan(design(true), { rarity: 'none', mods: [] });
  const kinds = steps.map((s) => s.kind);
  assert.deepEqual(kinds.slice(0, 2), ['base', 'essence'], 'the essence makes it rare first');
  const craft = kinds.indexOf('craft');
  assert.equal(kinds[craft - 1], 'rune', 'the rune goes in right before the alloy');
  assert.match(steps[craft].title, /Sovereign Alloy/);
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

test('astrid: a last target that needs a second crafted slot offers the rune, then sacrifice, socket, essence', () => {
  // The user's leggings: Life, Movement Speed kept at T2 and Runic Ward from the alloy; Rarity and a desecrated
  // Fire Resistance kept instead of Lightning. Effect of Socketed Augment Items only comes from the Essence of Horror.
  const cat = E.catalog('Cryptic Leggings', 82);
  const lightning = tgt(cat, 1, '+#% to Lightning Resistance', 'T1');
  const design = (astrid) => ({
    cls: 'boots', base: 'Cryptic Leggings', ilvl: 82, runeforge: false, league: 'fr', astrid,
    targets: [[tgt(cat, 0, '+# to maximum Life', 'T2'), tgt(cat, 0, '#% increased Movement Speed', 'T1'), tgt(cat, 0, '#% increased Runic Ward', 'Alloy')],
      [tgt(cat, 1, '#% increased Rarity of Items found', 'T1'), lightning, tgt(cat, 1, '#% increased effect of Socketed Augment Items', 'Essence')]]
  });
  const item = () => ({ rarity: 'rare', done: {}, skip: { [lightning.f]: true }, mods: [
    mod(cat, 0, '+# to maximum Life', 'T2'), mod(cat, 0, '#% increased Movement Speed', 'T2', { mark: 'keep' }),
    mod(cat, 0, '#% increased Runic Ward', 'Alloy', { crafted: true }), mod(cat, 1, '#% increased Rarity of Items found', 'T1'),
    mod(cat, 1, '+#% to Fire Resistance', 'T3', { mark: 'keep', desec: true })] });
  const off = E.nextStep(design(false), item());
  assert.equal(off.kind, 'rune');
  assert.match(off.title, /Use Astrid’s Creativity for Effect of Socketed Augment Items/);
  assert.match(off.how, /only comes from an Essence of Horror[\s\S]*already has its one crafted modifier: Runic Ward/);
  assert.ok(off.outcomes[0].astrid, 'first choice plans it with the rune');
  assert.ok(off.outcomes.some((o) => /^Skip Effect of Socketed Augment Items/.test(o.label)), 'or skip it');
  const on = E.plan(design(true), item());
  assert.deepEqual(on.slice(0, 3).map((s) => s.kind), ['sacrifice', 'rune', 'craft']);
  assert.deepEqual(on[0].mats.map((m) => m.n), ['Omen of Dextral Exaltation', 'Exalted Orb'], 'junk goes on the suffix side first');
  assert.deepEqual(on[2].mats.map((m) => m.n), ['Omen of Dextral Crystallisation', 'Essence of Horror']);
  assert.match(on[2].how, /corrupted essence[\s\S]*deletes a random suffix/);
  assert.ok(Math.abs(on[2].odds.p - 1 / 3) < 1e-9, 'it deletes the junk one time in three');
});

test('crafted slot full: a target only a magic-item essence adds is a stop, not a rune offer', () => {
  const cat = E.catalog('Warden Bow', 82);
  // Bows have two "+# to Accuracy Rating" families; the essence-only one is the target here
  const F = cat.sides[0].find((f) => f.t === '+# to Accuracy Rating' && E.tierOptions(cat, f.f).some((o) => o.label === 'Essence'));
  const o = E.tierOptions(cat, F.f).find((x) => x.label === 'Essence');
  const acc = { f: F.f, lv: o.l, mi: o.mi };
  const design = { cls: 'bow', base: 'Warden Bow', ilvl: 82, league: 'fr', targets: [[acc], [tgt(cat, 1, '+# to maximum Runic Ward', 'Alloy')]] };
  const step = E.nextStep(design, { rarity: 'rare', done: {}, skip: {}, mods: [mod(cat, 1, '+# to maximum Runic Ward', 'Alloy', { crafted: true })] });
  assert.equal(step.kind, 'stop');
  assert.match(step.how, /only comes from a Greater Essence of Battle, which needs a magic item/);
  assert.ok(!step.outcomes.some((o) => o.astrid), 'the rune wouldn’t help');
});

/* The user's Cultist Crown: Life, Mana, Mana Cost Efficiency (alloy); Armour also applies to Elemental Damage,
   Life Regeneration, Damage taken Recouped as Life (desecration). */
function crown() {
  const cat = E.catalog('Cultist Crown', 82);
  const t = (s, re, label) => { const F = cat.sides[s].find((f) => re.test(f.name)); const o = E.tierOptions(cat, F.f).find((x) => x.label === label); return { f: F.f, mi: o.mi, lv: o.l }; };
  return { cat, design: { cls: 'helmet', base: 'Cultist Crown', ilvl: 82, league: 'roa', targets: [
    [t(0, /^Maximum Life$/, 'T1'), t(0, /^Maximum Mana$/, 'T1'), t(0, /^Mana Cost Efficiency$/, 'Alloy')],
    [t(1, /^Armour also applies to Elemental Damage$/, 'T1'), t(1, /^Life Regeneration per second$/, 'T1'), t(1, /^Damage taken Recouped as Life$/, 'Desecrated')]] } };
}

test('targets first: the magic base buys a hard suffix rather than junk for the alloy', () => {
  const { design } = crown();
  const steps = E.plan(design, { rarity: 'none', mods: [] });
  const fam = (m) => m.pseudo ? 'any' : E.famName(E.MODS[m.mi].f);
  assert.deepEqual(E.suggest(design, 'magic').map(fam), ['Maximum Life', 'Armour also applies to Elemental Damage']);
  assert.match(steps[0].how, /Maximum Mana \(T1\+\) instead of Maximum Life, or Life Regeneration per second \(T1\+\) instead of Armour also applies to Elemental Damage, works just as well/);
  assert.deepEqual(steps.slice(2, 4).map((s) => s.kind), ['sacrifice', 'craft']);
});

test('the order of the boxes never changes the plan', () => {
  const { design } = crown();
  const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((p) => [x].concat(p)));
  const fam = (m) => m.pseudo ? 'any' + m.s : E.famName(E.MODS[m.mi].f);
  const sig = (d) => JSON.stringify([E.plan(d, { rarity: 'none', mods: [] }).map((s) => [s.kind, (s.mats || []).map((m) => m.n),
    s.odds ? Math.round(s.odds.p * 1000) : null, s.project ? (s.project.mods || []).map(fam).sort() : null]), E.suggest(d, 'magic').map(fam), E.suggest(d, 'rare').map(fam).sort()]);
  const want = sig(design);
  for (const P of perms(design.targets[0])) for (const S of perms(design.targets[1])) assert.equal(sig(Object.assign({}, design, { targets: [P, S] })), want);
  // Empty boxes in between don't matter either
  const [arm, regen] = design.targets[1];
  const two = (S) => sig(Object.assign({}, design, { targets: [design.targets[0], S] }));
  const gaps = two([arm, regen, null]);
  for (const S of [[regen, arm, null], [arm, null, regen], [null, regen, arm], [regen, null, arm], [null, arm, regen]]) assert.equal(two(S), gaps);
});

test('a magic base that already has junk where the alloy deletes keeps that route', () => {
  const { cat, design } = crown();
  const item = { rarity: 'magic', done: {}, skip: {}, mods: [mod(cat, 0, '+# to maximum Life', 'T1'), { id: 'j', s: 1, mi: null, pseudo: 'any', mark: 'junk' }] };
  const steps = E.plan(design, item);
  assert.deepEqual(steps.slice(0, 2).map((s) => s.kind), ['regal', 'craft']);
  assert.ok(steps[1].odds.p >= 0.995, 'the alloy can only delete the junk suffix');
});

test('two deletions on one side: the base keeps junk there so both are certain', () => {
  const steps = E.plan(leggings(true, true), { rarity: 'none', mods: [] });
  assert.match(steps[0].spec.find((r) => r.k === 'Suffix').v, /sacrifice/);
  const crafts = steps.filter((s) => s.kind === 'craft');
  assert.equal(crafts.length, 2);
  assert.ok(crafts.every((s) => s.odds.p >= 0.995));
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

/* ---------- cost estimates ---------- */
const fresh = () => ({ rarity: 'none', mods: [], done: {}, skip: {} });
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), (msg || '') + ' ' + a + ' vs ' + b);
const reqMats = (step) => { const o = step.options && step.options.find((x) => x.key === step.recommended); return (o ? o.mats : step.mats).filter((m) => !m.opt); };
function walkTo(design, kind) {
  const steps = E.plan(design, fresh());
  const i = steps.findIndex((s) => s.kind === kind);
  let s = fresh();
  for (let j = 0; j < i; j++) s = E.apply(s, steps[j].project);
  return { st: s, step: steps[i], i };
}

test('cost: if every roll lands is the plan’s required mats, priced once; misses drive the average', () => {
  const { design } = glovesDesign();
  const steps = E.plan(design, fresh());
  const want = steps.reduce((a, s) => a + E.matsCost(reqMats(s), 'fr').sum, 0);
  const cp = E.costPlan(design, fresh());
  close(cp.happy.div, want, 1e-9);
  assert.ok(cp.happy.base && cp.happy.known && cp.happy.stopsAt === null);
  assert.ok(cp.avg.div > cp.happy.div * 10, 'misses dominate');
  assert.ok(cp.avg.bases >= 1);
  assert.equal(steps[cp.risk.i].kind, 'slam');
  assert.equal(cp.risk.miss.type, 'fix');
  const at = E.apply(walkTo(design, 'slam').st, { type: 'add', mods: [junk(1)] });
  const fixStep = E.nextStep(design, at);
  close(cp.risk.miss.each, fixStep.options.find((o) => o.key === fixStep.recommended).cost, 1e-9);
  assert.ok(cp.avg.skipped.some((x) => x.name === 'Maximum Mana' && x.p > 0.5), 'reports the target the steps usually skip');
});

test('cost: a desecration retried after Omen of Light matches the closed form', () => {
  const { design } = glovesDesign();
  const { st, step } = walkTo(design, 'desec');
  const hit = E.apply(st, step.project);
  const miss = E.apply(st, { type: 'add', mods: [Object.assign(junk(step.side), { desec: true })] });
  const fix = E.nextStep(design, miss);
  assert.equal(fix.recommended, 'light');
  const cL = fix.options.find((o) => o.key === 'light').cost, cD = E.matsCost(reqMats(step), 'fr').sum, p = step.odds.p;
  close(E.costPlan(design, st).avg.div, (cD + (1 - p) * cL) / p + E.costPlan(design, hit).avg.div, 1e-9);
});

test('cost: restarts compound, and each choice prices what it still costs', () => {
  const { cat, design } = glovesDesign();
  const f = E.costPlan(design, fresh());
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), junk(1), junk(1)], done: {}, skip: {} };
  const cp = E.costPlan(design, st);
  assert.ok(cp.happy.restart);
  close(cp.avg.div, f.avg.div, 1e-9); close(cp.avg.bases, f.avg.bases, 1e-9);
  const step = E.nextStep(design, st);
  const cc = E.choiceCosts(design, st, step);
  assert.deepEqual(cc.map((c) => c.key), step.options.map((o) => o.key));
  close(cc.find((c) => c.key === 'restart').finish, f.avg.div, 1e-9);
  assert.equal(cc.find((c) => c.kind === 'skip').keeps, false);
  cc.forEach((c) => assert.ok(isFinite(c.finish) && c.finish >= 0));
  // the suggested fix after a missed slam is what the plan's own average says
  const at = E.apply(walkTo(design, 'slam').st, { type: 'add', mods: [junk(1)] });
  const rs = E.nextStep(design, at);
  close(E.choiceCosts(design, at, rs).find((c) => c.key === rs.recommended).finish, E.costPlan(design, at).avg.div, 1e-9);
});

test('cost: after a missed desecration, Omen of Light beats a random Annulment and a new base', () => {
  const { design } = crown();
  const { st, step } = walkTo(design, 'desec');
  const miss = E.apply(st, { type: 'add', mods: [Object.assign(junk(step.side), { desec: true })] });
  const cc = E.choiceCosts(design, miss, E.nextStep(design, miss));
  const by = Object.fromEntries(cc.map((c) => [c.key, c]));
  assert.ok(by.light.finish < by.annul.finish / 10, 'a random Annulment can take a good suffix');
  assert.ok(by.light.finish < by.restart.finish);
  assert.ok(by.restart.bases >= 1);
});

test('cost: a base that missed compares a new base with an Orb of Annulment', () => {
  const { cat, design } = glovesDesign();
  const st = { rarity: 'magic', mods: [junk(0), mod(cat, 1, '+#% to Cold Resistance', 'T2')], done: {}, skip: {} };
  const step = E.nextStep(design, st);
  assert.equal(step.kind, 'fixMagic');
  const cc = E.choiceCosts(design, st, step);
  assert.deepEqual(cc.map((c) => c.key), ['restart', 'annul1']);
  close(cc[1].now, E.price('annul', 'fr'), 1e-9);
});

test('cost: the rune offer prices planning it with Astrid’s Creativity', () => {
  const d = twoAlloyGloves(false);
  const steps = E.plan(d, fresh());
  let s = fresh();
  for (let j = 0; j < steps.length - 1; j++) s = E.apply(s, steps[j].project);
  const offer = E.nextStep(d, s);
  assert.ok(offer.outcomes[0].astrid);
  assert.equal(E.costPlan(d, fresh()).happy.stopsAt, steps.length - 1, 'the plan stops at the offer');
  const cc = E.choiceCosts(d, s, offer);
  const a = cc.find((c) => c.kind === 'astrid');
  close(a.finish, E.costPlan(Object.assign({}, d, { astrid: true }), s).avg.div, 1e-9);
  assert.ok(cc.find((c) => c.kind === 'restart').stop > 0.5, 'a new base stops at the same place');
});

test('cost: a certain plan averages what it costs if every roll lands', () => {
  const cp = E.costPlan(leggings(false, false), fresh());
  close(cp.avg.div, cp.happy.div, 1e-9);
  assert.equal(cp.risk, null);
});

test('cost: the order of the boxes doesn’t change the totals', () => {
  const { design } = crown();
  const sig = (d) => { const c = E.costPlan(d, fresh()); return [c.happy.div.toFixed(6), c.avg.div.toFixed(6), c.avg.bases.toFixed(6)].join('|'); };
  const want = sig(design);
  const [a, b, c] = design.targets[1];
  for (const S of [[b, a, c], [c, b, a], [a, c, b]]) assert.equal(sig(Object.assign({}, design, { targets: [design.targets[0], S] })), want);
});

test('cost: unknown prices are flagged, not guessed', () => {
  const cat = E.catalog('Warden Bow', 82);
  const F = cat.sides[0].find((f) => f.t === '+# to Accuracy Rating' && E.tierOptions(cat, f.f).some((o) => o.label === 'Essence'));
  const o = E.tierOptions(cat, F.f).find((x) => x.label === 'Essence');
  const d = (lg) => ({ cls: 'bow', base: 'Warden Bow', ilvl: 82, league: lg, targets: [[{ f: F.f, lv: o.l, mi: o.mi }], [tgt(cat, 1, '#% increased Attack Speed')]] });
  const roa = E.costPlan(d('roa'), fresh()), fr = E.costPlan(d('fr'), fresh());
  assert.equal(roa.happy.known, false); assert.equal(roa.avg.unknown, true);
  assert.equal(fr.happy.known, true); assert.equal(fr.avg.unknown, false);
  assert.ok(isFinite(roa.avg.div));
});

test('cost: cached, sliced and repeatable', () => {
  const { design } = glovesDesign();
  E.costReset();
  assert.equal(E.costPlan(design, fresh(), { quick: true }), null);
  let r = null, slices = 0;
  while (!r) { r = E.costPlan(design, fresh(), { budget: 0.5 }); slices++; }
  assert.ok(slices > 1, 'a small budget takes more than one slice');
  const again = E.costPlan(design, fresh(), { quick: true });
  assert.ok(again && again.avg.div === r.avg.div);
  E.costReset();
  assert.equal(E.costPlan(design, fresh()).avg.div, r.avg.div);
});

test('cost: random designs give finite, sane numbers', () => {
  let x = 7;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const classes = DATA.classes.map((c) => c.id);
  for (let k = 0; k < 40; k++) {
    const cls = classes[Math.floor(rnd() * classes.length)];
    const b = DATA.bases.filter((y) => y.c === cls).sort((p, q) => q.lv - p.lv)[0];
    const cat = E.catalog(b.n, 82);
    const targets = [0, 1].map((s) => {
      const fams = cat.sides[s].filter((F) => F.tiers.length).slice(), out = [];
      for (let i = 0; i < Math.min(cat.caps[s], 1 + Math.floor(rnd() * 3)) && fams.length; i++) {
        const F = fams.splice(Math.floor(rnd() * fams.length), 1)[0];
        const t = F.tiers[Math.min(F.tiers.length - 1, Math.floor(rnd() * 3))];
        out.push({ f: F.f, mi: t.mi, lv: t.l });
      }
      return out;
    });
    const d = { cls, base: b.n, ilvl: 82, league: rnd() < 0.5 ? 'fr' : 'roa', astrid: rnd() < 0.3, targets };
    const cp = E.costPlan(d, fresh());
    assert.ok(isFinite(cp.happy.div) && cp.happy.div >= 0, b.n);
    if (cp.avg) assert.ok(isFinite(cp.avg.div) && cp.avg.div >= 0 && cp.avg.bases >= 0 && cp.avg.stop >= -1e-9 && cp.avg.stop <= 1 + 1e-9, b.n);
    assert.equal(cp.cut, false, b.n + ' fits in the state limit');
  }
});

test('cost: speed, as a multiple of one plan()', () => {
  const { design } = glovesDesign();
  const t = () => Number(process.hrtime.bigint()) / 1e6;
  E.plan(design, fresh()); E.costReset();
  let t0 = t();
  for (let i = 0; i < 5; i++) E.plan(design, fresh());
  const one = (t() - t0) / 5;
  t0 = t(); E.costPlan(design, fresh()); const cold = t() - t0;
  t0 = t();
  for (let i = 0; i < 20; i++) E.costPlan(design, fresh(), { quick: true });
  const hit = (t() - t0) / 20;
  assert.ok(cold < 80 * one, 'cold ' + cold + ' vs plan ' + one);
  assert.ok(hit < 0.2 * one, 'cached ' + hit + ' vs plan ' + one);
});

test('cost: the shopping list merges the steps’ items and names what a miss calls for', () => {
  const { design } = glovesDesign();
  const sl = E.shoppingList(design, fresh());
  assert.equal(sl.base.find((r) => r.k === 'Base').v, GLOVES);
  const regal = sl.rows.find((r) => r.k === 'pregal');
  assert.equal(regal.q, 1);
  close(regal.total, E.price('pregal', 'fr'), 1e-9);
  assert.equal(sl.rows.find((r) => r.k === 'scrap').q, 4);
  assert.ok(sl.rows.find((r) => r.k === 'gexalt').chance.p < 0.1, 'the slam is chancy: bring spares');
  assert.ok(sl.misses.some((m) => m.type === 'fix' && /Annulment/.test(m.label)));
  assert.ok(sl.optional.some((o) => o.k === 'divine'), 'the Divine Orb is optional');
  assert.ok(!sl.rows.some((r) => r.k === 'divine'));
});

test('spend: what an outcome records', () => {
  const { design } = glovesDesign();
  const steps = E.plan(design, fresh());
  assert.deepEqual(E.spendOf(steps[0], null, steps[0].outcomes[0]), { sp: [], b: 1 }, 'the base: one magic base, no div');
  assert.deepEqual(E.spendOf(steps[0], null, steps[0].outcomes[1]), { sp: [], b: 1 }, 'My base has other mods too');
  const slam = steps.find((s) => s.kind === 'slam');
  assert.deepEqual(E.spendOf(slam, null, slam.outcomes[0]).sp, [['o_dex_ex', 1], ['gexalt', 1]], 'no optional Omen of Greater Exaltation');
  const fin = steps.find((s) => s.kind === 'finish' && s.key === 'quality');
  assert.deepEqual(E.spendOf(fin, null, fin.outcomes[0]).sp, [['scrap', 4]]);
  assert.deepEqual(E.spendOf(fin, null, fin.outcomes[1]), { sp: [], b: 0 }, 'a finish step’s Skip');
  const div = steps.find((s) => s.kind === 'finish' && s.key === 'divine');
  assert.deepEqual(E.spendOf(div, null, div.outcomes[0]).sp, [['divine', 1]], 'Done on the optional Divine step used the orb');
  const at = E.apply(walkTo(design, 'slam').st, { type: 'add', mods: [junk(1)] });
  const rs = E.nextStep(design, at);
  const annul = rs.options.find((o) => o.key === 'annul');
  assert.deepEqual(E.spendOf(rs, annul, annul.outcomes[0]).sp, [['o_dex_an', 1], ['annul', 1]]);
  const settle = rs.options.find((o) => o.key === 'settle');
  assert.deepEqual(E.spendOf(rs, settle, settle.outcomes[0]), { sp: [], b: 0 });
  assert.equal(E.spendOf(rs, null, { label: 'Plan it with Astrid’s Creativity', astrid: true }), null);
  const { cat } = glovesDesign();
  const fm = E.nextStep(design, { rarity: 'magic', mods: [junk(0), mod(cat, 1, '+#% to Cold Resistance', 'T2')], done: {}, skip: {} });
  assert.deepEqual(E.spendOf(fm, null, fm.outcomes.find((o) => o.label === 'Annul removed it')).sp, [['annul', 1]], 'the Orb of Annulment was used');
});

test('spend: an old entry with no spend is rebuilt from its title', () => {
  const { design } = glovesDesign();
  const at = E.apply(walkTo(design, 'slam').st, { type: 'add', mods: [junk(1)] });
  const rs = E.nextStep(design, at);
  const annul = rs.options.find((o) => o.key === 'annul');
  const h = { t: rs.title + ' · ' + annul.label, o: annul.outcomes[0].label, st: at, ps: at };
  assert.deepEqual(E.deriveSpend(design, h), E.spendOf(rs, annul, annul.outcomes[0]));
  assert.deepEqual(E.deriveSpend(design, { t: rs.title, o: 'Start a new base', st: at, ps: at }), { sp: [], b: 0 }, 'Skip or new base: nothing');
  assert.equal(E.deriveSpend(design, { t: 'Some old title', o: 'Done', st: at, ps: at }), null, 'a step that no longer matches: not counted');
  const s = E.spentOn([{ sp: [['o_dex_an', 1], ['annul', 1]], b: 0 }, { sp: [], b: 1 }], 'fr');
  close(s.div, E.price('o_dex_an', 'fr') + E.price('annul', 'fr'), 1e-9);
  assert.equal(s.bases, 1);
});

test('removal notes no longer quote the old flat averages', () => {
  const { cat, design } = glovesDesign();
  const notes = [];
  notes.push(E.nextStep(design, { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), junk(1), junk(1)], done: {}, skip: {} }).note);
  const at = E.apply(walkTo(design, 'slam').st, { type: 'add', mods: [junk(1)] });
  notes.push(E.nextStep(design, at).note);
  notes.forEach((t) => assert.ok(t && !/\d+(\.\d+)? div/.test(t), t));
});

test('cost: a loop the steps can never leave is capped, and so are the choices that lead back into it', () => {
  const { cat, design } = glovesDesign();
  const d = Object.assign({}, design, { runeforge: false, targets: [[design.targets[0][0], design.targets[0][1]], [tgt(cat, 1, '+#% to Cold Resistance', 'T2')]] });
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), mod(cat, 0, '+# to maximum Mana', 'T2'), mod(cat, 1, '+#% to Cold Resistance', 'T6', { fract: true })], done: {}, skip: {} };
  const step = E.nextStep(d, st);
  assert.equal(step.kind, 'desec');
  assert.equal(step.odds.p, 0, 'the fractured lower tier blocks the desecration');
  const cp = E.costPlan(d, st);
  assert.ok(cp.capped && cp.loop && cp.avg === null);
  const miss = E.apply(st, { type: 'add', mods: [Object.assign(junk(1), { desec: true })] });
  const cc = E.choiceCosts(d, miss, E.nextStep(d, miss));
  const by = Object.fromEntries(cc.map((c) => [c.key, c]));
  assert.equal(by.light.finish, Infinity, 'it leads back to the same desecration');
  assert.ok(isFinite(by.settle.finish) && isFinite(by.restart.finish));
});

test('cost: a step that waits for your call isn’t priced as if it were done', () => {
  const d = twoAlloyGloves(false);
  const steps = E.plan(d, fresh());
  const offer = steps[steps.length - 1];
  const before = steps.slice(0, -1).reduce((a, s) => a + E.matsCost(reqMats(s), 'fr').sum, 0);
  const happy = E.planCost(d, steps);
  close(happy.div, before, 1e-9, 'the rune and the alloy belong to a choice');
  assert.ok(E.matsCost(reqMats(offer), 'fr').sum > 1, 'the offer has items of its own');
  let s = fresh();
  for (let j = 0; j < steps.length - 1; j++) s = E.apply(s, steps[j].project);
  assert.equal(E.costPlan(d, s).happy.stopsAt, 0);
  assert.equal(E.shoppingList(d, s).rows.length, 0);
});

test('cost: when a fresh base never finishes, every choice that restarts is Infinity, never a huge number', () => {
  const cat = E.catalog('Portent Amulet', 75);
  const des = (s) => cat.sides[s].filter((F) => !F.tiers.length && F.lich.length);
  const t = (F) => ({ f: F.f, mi: F.lich[0].mi, lv: F.lich[0].l });
  const d = { cls: 'amulet', base: 'Portent Amulet', ilvl: 75, league: 'fr', targets: [des(0).slice(0, 2).map(t), des(1).slice(0, 1).map(t)] };
  assert.ok(E.costPlan(d, fresh()).capped);
  const st = { rarity: 'magic', mods: [mod(cat, 0, '+# to maximum Life')], done: {}, skip: {} };
  const step = E.nextStep(d, st);
  assert.equal(step.kind, 'fixMagic');
  E.choiceCosts(d, st, step).forEach((c) => assert.equal(c.finish, Infinity, c.key));
});

test('spend: an entry without a title isn’t priced (and doesn’t throw)', () => {
  const { design } = glovesDesign();
  assert.equal(E.deriveSpend(design, { o: 'Done', st: fresh(), ps: fresh() }), null);
});

test('cost: a new base that usually drops a target says so, and the loop is named on the choices', () => {
  const { cat, design } = glovesDesign();
  const st = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), mod(cat, 0, '+# to maximum Mana', 'T1'), mod(cat, 0, '#% increased Runic Ward', 'Alloy', { crafted: true }), junk(1)], done: {}, skip: {} };
  const by = Object.fromEntries(E.choiceCosts(design, st, E.nextStep(design, st)).map((c) => [c.key, c]));
  assert.ok(by.restart.lose > 0.5 && by.restart.loseName === 'Maximum Mana', 'a fresh base usually ends without Maximum Mana');
  assert.ok(by.annul.lose < 0.05, 'fixing this item keeps every target');
  const d = Object.assign({}, design, { runeforge: false, targets: [[design.targets[0][0], design.targets[0][1]], [tgt(cat, 1, '+#% to Cold Resistance', 'T2')]] });
  const st2 = { rarity: 'rare', mods: [mod(cat, 0, '+# to maximum Life', 'T1'), mod(cat, 0, '+# to maximum Mana', 'T2'), mod(cat, 1, '+#% to Cold Resistance', 'T6', { fract: true }), Object.assign(junk(1), { desec: true })], done: {}, skip: {} };
  const cc = E.choiceCosts(d, st2, E.nextStep(d, st2));
  assert.ok(cc.find((c) => c.key === 'light').loop, 'Omen of Light leads back into the loop');
  assert.ok(!cc.find((c) => c.key === 'restart').loop);
});

test('cost: a chain past half its limit answers the average and the choices for one item from cache, render after render', () => {
  // A review case: Warlord Cuirass, mid-craft at "Make room on the prefix side", with a chain of over 200 states.
  // Before the fix, the average and the choices each started the chain again and threw the other's work away.
  const byId = (k) => { const mi = DATA.ids.indexOf(k); assert.ok(mi >= 0, k); return { f: E.MODS[mi].f, mi, lv: E.MODS[mi].l }; };
  const [ar, arb, th, regen, cold, attr] = ['LocalIncreasedPhysicalDamageReductionRatingPercent8_', 'LocalIncreasedArmourAndBase5', 'AttackerTakesDamage7',
    'LifeRegeneration9', 'ColdResist7', 'ReducedLocalAttributeRequirements3'].map(byId);
  const d = { cls: 'body', base: 'Warlord Cuirass', ilvl: 82, league: 'fr', targets: [[ar, arb, th], [regen, cold, attr]] };
  const st = { rarity: 'rare', mods: [{ id: 'a', s: 0, mi: ar.mi, mark: 'auto' }, junk(0), junk(0), { id: 'c', s: 1, mi: cold.mi, mark: 'auto' }, { id: 'r', s: 1, mi: attr.mi, mark: 'auto' }, junk(1)], done: {}, skip: {} };
  E.costReset();
  const steps = E.plan(d, st);
  assert.equal(steps[0].kind, 'remove');
  const render = () => {
    let cp = E.costPlan(d, st, { steps, quick: true }), cc = E.choiceCosts(d, st, steps[0], { quick: true });
    const quick = !!cp && !!cc;
    for (let i = 0; i < 500 && !(cp && cc); i++) {
      if (!cp) cp = E.costPlan(d, st, { steps, budget: 12 });
      if (cp && !cc) cc = E.choiceCosts(d, st, steps[0], { budget: 12 });
    }
    return { quick, states: cp.states };
  };
  const first = render();
  assert.ok(first.states > 200, 'the chain holds ' + first.states + ' states');
  render();
  for (let r = 0; r < 3; r++) assert.ok(render().quick, 'render ' + (r + 3) + ' comes from cache');
});

const GRASP = 'Grasping Mail', FATHER = "Runefather's Grasping Mail";
function fatherDesign() {
  const cat = E.catalog(FATHER, 82);
  return { cat, design: { cls: 'body', base: FATHER, ilvl: 82, runeforge: false, astrid: false, league: 'fr',
    targets: [[tgt(cat, 0, 'to maximum Life', 'T2'), tgt(cat, 0, '#% increased Fire Damage', 'T1'), null], [tgt(cat, 1, 'Cast Speed', 'T2'), tgt(cat, 1, 'to Fire Resistance', 'T2'), null]] } };
}

test('Grasping Mail rolls ring mods too, and plain body armour does not', () => {
  for (const n of [GRASP, FATHER]) {
    const cat = E.catalog(n, 82);
    const cast = cat.sides[1].find((F) => /Cast Speed/.test(F.t));
    assert.ok(cast && cast.ring, n + ': Cast Speed rolls, marked as a ring mod');
    assert.ok(cat.sides[0].some((F) => /Adds # to # Fire damage to Attacks/.test(F.t) && F.ring));
    assert.ok(!cat.sides[0].find((F) => F.t === '+# to maximum Life').ring, 'life rolls on body armour anyway');
  }
  const plain = E.catalog('Sacrificial Regalia', 82);
  assert.ok(!plain.sides[1].some((F) => /Cast Speed/.test(F.t)));
  assert.ok(!plain.sides.flat().some((F) => F.ring));
  assert.deepEqual(E.special(GRASP), { ring: true, father: false, wardOnly: false, from: null });
  assert.deepEqual(E.special(FATHER), { ring: true, father: true, wardOnly: true, from: GRASP });
});

test('Runefather’s Grasping Mail: Runic Ward only, so increased Armour, Evasion and Energy Shield do nothing', () => {
  const dead = (n) => E.catalog(n, 82).sides.flat().filter((F) => F.dead).map((F) => F.t);
  assert.deepEqual(dead(FATHER), ['#% increased Armour, Evasion and Energy Shield']);
  assert.deepEqual(dead(GRASP), []);
  assert.ok(!E.catalog(FATHER, 82).sides[1].find((F) => /Energy Shield Recharge Rate/.test(F.t)).dead, 'recharge rate is global');
});

test('Runefather’s Grasping Mail: buy a Grasping Mail, craft it, then three changes at the Verisium Anvil', () => {
  const { design } = fatherDesign();
  const steps = E.plan(design, fresh());
  assert.equal(steps[0].kind, 'base');
  assert.equal(steps[0].spec.find((r) => r.k === 'Base').v, GRASP);
  assert.match(steps[0].how, /^Buy a magic Grasping Mail /);
  assert.match(steps[0].how, /Grasping Orchid/);
  const keys = steps.filter((s) => s.kind === 'finish').map((s) => s.key);
  assert.deepEqual(keys.slice(keys.indexOf('runeforge'), keys.indexOf('runeforge') + 3), ['runeforge', 'runemaster', 'runefather']);
  const rf = steps.find((s) => s.key === 'runeforge');
  assert.deepEqual(rf.mats.map((m) => [m.k, m.q]), [['xverisium', 5]]);
  assert.match(rf.how, /Str\/Dex\/Int/);
  assert.ok(steps.find((s) => s.key === 'runemaster').note, 'unknown cost: says so');
  // a finished item that is already a Runefather's: one answer skips the rest of the chain, and used nothing
  const st = { rarity: 'rare', mods: [], done: { quality: true }, skip: {} };
  const cat = E.catalog(FATHER, 82);
  design.targets.forEach((side, s) => side.forEach((t) => { if (t) st.mods.push({ id: 'g' + t.mi, s, mi: t.mi, mark: 'auto' }); }));
  const step = E.nextStep(design, st);
  assert.equal(step.key, 'runeforge');
  const already = step.outcomes.find((o) => /already/.test(o.label));
  assert.deepEqual(E.spendOf(step, null, already), { sp: [], b: 0 });
  assert.deepEqual(E.spendOf(step, null, step.outcomes[0]), { sp: [['xverisium', 5]], b: 0 });
  const after = E.apply(st, already.o);
  assert.ok(after.done.runeforge && after.done.runemaster && after.done.runefather);
  assert.equal(E.nextStep(design, after).key, 'divine');
  assert.ok(cat.caps[0] === 3 && cat.caps[1] === 3);
});

test('Grasping Mail: runeforging it takes Exceptional Verisium', () => {
  const cat = E.catalog(GRASP, 82);
  const design = { cls: 'body', base: GRASP, ilvl: 82, runeforge: true, astrid: false, league: 'fr', targets: [[tgt(cat, 0, 'to maximum Life', 'T2'), null, null], [null, null, null]] };
  const steps = E.plan(design, fresh());
  const rf = steps.find((s) => s.key === 'runeforge');
  assert.deepEqual(rf.mats.map((m) => [m.k, m.q]), [['xverisium', 5]]);
  assert.ok(!steps.some((s) => s.key === 'runemaster'), 'only the Runefather’s goes on');
  assert.ok(E.price('xverisium', 'fr') > 0);
});

const GAME_TEXT = `Item Class: Gloves
Rarity: Rare
Blight Caress
Runeforged Blacksteel Gauntlets
--------
Armour: 36
Evasion Rating: 33
Runic Ward: 183 (augmented)
--------
Requires: Level 80, 55 Str, 55 Dex
--------
Sockets: S 
--------
Item Level: 80
--------
{ Prefix Modifier "Athlete's" (Tier: 1) — Life }
+147(120-149) to maximum Life
{ Prefix Modifier "Chalybeous" (Tier: 1) — Mana }
+113(105-124) to maximum Mana
{ Crafted Prefix Modifier "Verisium" }
30(24-30)% increased Runic Ward
{ Suffix Modifier "of the Ice" (Tier: 2) — Elemental, Cold, Resistance }
+37(36-40)% to Cold Resistance
{ Suffix Modifier "of the Volcano" (Tier: 3) — Elemental, Fire, Resistance }
+33(31-35)% to Fire Resistance
{ Desecrated Suffix Modifier "of the Phantom" (Tier: 2) — Attribute }
+32(31-33) to Dexterity`;
const tierOf = (r, m) => E.labelTier(E.catalog(r.base, r.ilvl), { f: E.MODS[m.mi].f, mi: m.mi });

test('tiers are numbered like the game: T1 is the best tier even when the item level is too low for it', () => {
  const at = (ilvl) => E.catalog(GLOVES, ilvl).sides[1].find((F) => F.t === '+#% to Cold Resistance');
  assert.equal(at(82).tiers[0].tier, 1);
  assert.equal(E.MODS[at(82).tiers[0].mi].x, '+(41-45)% to Cold Resistance');
  assert.equal(at(80).tiers[0].tier, 2, 'item level 80 starts at T2, as the game shows');
  assert.equal(E.tierOptions(E.catalog(GLOVES, 80), at(80).f)[0].label, 'T2');
});

test('import: an item copied in game with Ctrl+Alt+C', () => {
  const r = E.importItem(GAME_TEXT);
  assert.equal(r.base, GLOVES);
  assert.equal(r.cls, 'gloves');
  assert.equal(r.ilvl, 80);
  assert.equal(r.rarity, 'rare');
  assert.equal(r.name, 'Blight Caress');
  assert.equal(r.runeforged, true);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.mods.map((m) => [m.s, tierOf(r, m)]), [[0, 'T1'], [0, 'T1'], [0, 'alloy'], [1, 'T2'], [1, 'T3'], [1, 'T2']], 'the same tiers as the game');
  assert.equal(E.MODS[r.mods[0].mi].x, '+(120-149) to maximum Life');
  assert.ok(r.mods[2].crafted && !r.mods[2].desec);
  assert.ok(r.mods[5].desec && !r.mods[5].crafted);
  assert.ok(!r.mods[3].crafted && !r.mods[3].desec);
});

test('import: Ctrl+C without headers or ranges, a magic item, and text that is not an item', () => {
  const plain = GAME_TEXT.replace(/\{[^\n]*\}\n/g, '').replace(/(\d+)\(\d+-\d+\)/g, '$1');
  const r = E.importItem(plain);
  assert.deepEqual(r.mods.map((m) => [m.s, tierOf(r, m)]), [[0, 'T1'], [0, 'T1'], [0, 'alloy'], [1, 'T2'], [1, 'T3'], [1, 'T2']], 'sides from the mod, tiers from the value');
  const magic = E.importItem("Item Class: Gloves\nRarity: Magic\nAthlete's Blacksteel Gauntlets of the Ice\n--------\nItem Level: 81\n--------\n+120 to maximum Life\n+37% to Cold Resistance");
  assert.equal(magic.base, GLOVES);
  assert.equal(magic.rarity, 'magic');
  assert.deepEqual(magic.mods.map((m) => E.MODS[m.mi].x), ['+(120-149) to maximum Life', '+(36-40)% to Cold Resistance']);
  const unid = E.importItem('Item Class: Body Armours\nRarity: Rare\nGrasping Mail\n--------\nItem Level: 81\n--------\nUnidentified');
  assert.equal(unid.base, 'Grasping Mail');
  assert.ok(unid.unidentified);
  assert.equal(unid.mods.length, 0);
  assert.equal(E.importItem('hello there').base, null);
  // an implicit and a mod this base can't roll are left out; the second is reported
  const odd = E.importItem(GAME_TEXT.replace('--------\nItem Level: 80\n', '--------\nItem Level: 80\n--------\n{ Implicit Modifier }\n+10% to Chaos Resistance (implicit)\n') +
    '\n{ Suffix Modifier "of Nowhere" (Tier: 1) }\n+3 to Level of all Spell Skills');
  assert.equal(odd.mods.length, 6);
  assert.deepEqual(odd.skipped, ['+3 to Level of all Spell Skills']);
});

test('special crafts: every one resolves on its base, with notes and sources', () => {
  const S = require('../src/specials.js');
  assert.ok(S.list.length >= 5);
  assert.match(S.checked, /2026/);
  const ids = new Set();
  for (const sp of S.list) {
    assert.ok(!ids.has(sp.id), 'unique id ' + sp.id); ids.add(sp.id);
    assert.ok(E.BASE[sp.base], sp.id + ': base ' + sp.base);
    const r = E.specialTargets(sp);
    assert.deepEqual(r.missing, [], sp.id + ' resolves');
    const cat = E.catalog(sp.base, sp.ilvl);
    [0, 1].forEach((s) => assert.ok(r.targets[s].length <= cat.caps[s], sp.id + ' fits'));
    assert.equal(r.targets[0].length + r.targets[1].length, sp.targets[0].length + sp.targets[1].length);
    assert.ok(sp.notes.length >= 3 && sp.notes.every((n) => n.h && n.p), sp.id + ' notes');
    assert.ok(sp.sources.length && sp.sources.every((x) => /^https:\/\//.test(x[1])), sp.id + ' sources');
    // the plan for it runs from a fresh base
    const design = { cls: cat.cls, base: sp.base, ilvl: sp.ilvl, league: 'fr', targets: r.targets.map((side, s) => side.map((mi) => ({ f: E.MODS[mi].f, mi, lv: E.MODS[mi].l }))) };
    assert.equal(E.nextStep(design, fresh()).kind, 'base');
  }
  const father = E.specialTargets(S.list.find((x) => x.id === 'father'));
  assert.ok(father.targets[1].some((mi) => /Cast Speed/.test(E.MODS[mi].x)), 'the Runefather’s takes Cast Speed from the ring pool');
});

test('special crafts: every line of the priority list names mods the base can roll, alternatives last', () => {
  const S = require('../src/specials.js');
  for (const sp of S.list) {
    const cat = E.catalog(sp.base, sp.ilvl);
    const have = new Set(cat.sides.flat().map((F) => F.t));
    assert.ok(sp.prio.length >= 6 && sp.prio.length <= 9, sp.id + ': 6 to 9 lines');
    const firstAlt = sp.prio.findIndex((p) => p.alt);
    assert.ok(firstAlt >= 4, sp.id + ': at least 4 top lines before the alternatives');
    assert.ok(sp.prio.slice(firstAlt).every((p) => p.alt), sp.id + ': alternatives come last');
    for (const p of sp.prio) {
      assert.ok(p.m && Array.isArray(p.f) && p.f.length, sp.id + ': ' + p.m);
      assert.ok(p.f.some((t) => have.has(t)), sp.id + ': "' + p.m + '" rolls on ' + sp.base);
      if (p.min) assert.ok(p.min >= 1 && p.min <= 5);
    }
    // every design target is somewhere in the list
    const r = E.specialTargets(sp);
    for (const mi of r.targets.flat()) {
      const t = E.FAMS[E.MODS[mi].f].t;
      assert.ok(sp.prio.some((p) => p.f.includes(t)), sp.id + ': target ' + t + ' is ranked');
    }
  }
});

test('a kept mod can stand in for a target: Cold Resistance in place of Fire Resistance', () => {
  const W = 'Secured Wraps';
  const cat = E.catalog(W, 82);
  const fam = (side, tmpl) => cat.sides[side].find((f) => f.t === tmpl).f;
  const design = {
    cls: 'gloves', base: W, ilvl: 82, league: 'fr',
    targets: [
      [tgt(cat, 0, 'Adds # to # Lightning damage to Attacks', 'T1'), tgt(cat, 0, 'Adds # to # Cold damage to Attacks', 'T1'), tgt(cat, 0, '#% increased Evasion and Energy Shield', 'T1')],
      [tgt(cat, 1, '+# to Level of all Melee Skills', 'T1'), tgt(cat, 1, '#% increased Critical Damage Bonus', 'T1'), tgt(cat, 1, '+#% to Fire Resistance', 'T2')]
    ]
  };
  const cold = mod(cat, 1, '+#% to Cold Resistance', 'T4');
  const st = { rarity: 'rare', done: {}, skip: {}, mods: [mod(cat, 0, '#% increased Evasion and Energy Shield', 'T1'), cold, mod(cat, 1, '#% increased Critical Damage Bonus', 'T1')] };
  // As junk it blocks a suffix target, and every target on that side can be skipped, the hardest first
  const rm = E.nextStep(design, st);
  assert.equal(rm.kind, 'remove');
  const skips = rm.options.filter((o) => o.skip).map((o) => o.label);
  assert.deepEqual(skips, ['Skip Level of all Melee Skills', 'Skip Fire Resistance']);
  assert.ok(rm.options.find((o) => o.key === 'settle'), 'the hardest one keeps the key the advice uses');
  const cc = E.choiceCosts(design, st, rm);
  assert.equal(cc.filter((x) => x.kind === 'skip').length, 2);
  assert.ok(cc.every((x) => x.finish > 0));
  // Kept in place of Fire Resistance: it fills that target, so the suffixes only need Level of all Melee Skills
  cold.mark = 'keep';
  cold.for = fam(1, '+#% to Fire Resistance');
  const A = E.analyze(cat, design, st);
  assert.equal(cold.status, 'hit');
  assert.equal(cold.counts, true);
  assert.deepEqual(A.sides[1].unfilled.map((t) => t.f), [fam(1, '+# to Level of all Melee Skills')]);
  const steps = E.plan(design, st);
  assert.ok(!steps.some((s) => s.kind === 'remove'), 'no room to make');
  assert.equal(steps[steps.length - 1].kind, 'done');
  // Only kept: a ditched mod never counts, and the real mod on the item wins
  cold.mark = 'junk';
  E.analyze(cat, design, st);
  assert.equal(cold.counts, false);
  cold.mark = 'keep';
  st.mods.push(mod(cat, 1, '+#% to Fire Resistance', 'T1'));
  E.analyze(cat, design, st);
  assert.equal(cold.status, 'keep');
  assert.equal(cold.counts, false);
});

/* ---------- build files (the game's Build Planner) ---------- */
const BF = require('../src/buildfile.js');
const { makeZip } = require('./zip.js');
const asFile = (name, buf) => ({ name, size: buf.length, arrayBuffer: () => Promise.resolve(new Uint8Array(buf).buffer) });
const BUILD_STEP = (n, label, gloves) => JSON.stringify({
  author: 'Ky', link: 'https://mobalytics.gg/poe-2/builds/example', ascendancy: 'Sorceress2', name: label + ' {' + n + '} - [0.5.5] Example Build',
  inventory_slots: [
    { inventory_id: 'Gloves1', slot_x: 0, slot_y: 0, level_interval: [80, 100], additional_text: gloves },
    { inventory_id: 'Helm1', slot_x: 0, slot_y: 0, unique_name: 'Alpha\'s Howl' },
    { inventory_id: 'Flask1', slot_x: 0, slot_y: 0, additional_text: 'Ultimate Mana Flask\n1. 31% increased Charges gained' },
    { inventory_id: 'Flask1', slot_x: 1, slot_y: 0, unique_name: 'Olroth\'s Resolve' }
  ],
  passives: [{ id: 'spells18' }], skills: []
});

test('build files: an item’s base and mods, each at the tier its value falls in', () => {
  const r = E.buildItem('Runeforged Blacksteel Gauntlets\n1. +190 to maximum Life\n2. +105 to maximum Mana\n3. +41% to Fire Resistance\n' +
    '4. +36% to Cold Resistance\n5. 25% increased Critical Damage Bonus\n6. 24% increased Runic Ward\n\nRubDubDucky is a pretty cool guy');
  assert.equal(r.base, 'Blacksteel Gauntlets');
  assert.equal(r.cls, 'gloves');
  assert.equal(r.runeforged, true);
  const cat = E.catalog(r.base, 82);
  const got = Object.fromEntries(r.mods.map((m) => [E.famName(E.MODS[m.mi].f), [E.labelTier(cat, { f: E.MODS[m.mi].f, mi: m.mi }), m.off || '']]));
  assert.deepEqual(got['Maximum Life'], ['T1', 'over'], '+190 is above the best roll: the best tier, flagged');
  assert.deepEqual(got['Maximum Mana'], ['T1', '']);
  assert.deepEqual(got['Fire Resistance'], ['T1', '']);
  assert.deepEqual(got['Cold Resistance'], ['T2', '']);
  assert.deepEqual(got['Critical Damage Bonus'], ['T2', '']);
  assert.equal(got['Runic Ward'][0], 'alloy', 'a mod only an alloy adds is crafted');
  assert.ok(r.mods.find((m) => /Runic Ward/.test(m.text)).crafted);
  assert.deepEqual(r.skipped, ['RubDubDucky is a pretty cool guy'], 'a note isn’t a mod');
  assert.equal(E.buildItem('Ultimate Mana Flask\n1. 31% increased Charges gained').base, null, 'flasks aren’t in the planner');
  assert.equal(E.buildItem('Chiming Staff').mods.length, 0, 'a base with no mods listed');
  assert.equal(E.buildItem('Runefather’s Grasping Mail\n1. +200 to maximum Life').base, 'Runefather\'s Grasping Mail', 'a curly apostrophe still finds the base');
});

test('build files: a .build file and a zip of steps, in the order their {n} gives', async () => {
  const g = 'Sirenscale Gloves\n1. +100 to maximum Life\n2. +16% to Fire Resistance';
  const one = await BF.readFiles([asFile('Endgame.build', Buffer.from(BUILD_STEP(6, 'Endgame Step 1', g)))]);
  assert.equal(one.files, 1);
  assert.equal(one.build.title, '[0.5.5] Example Build');
  assert.equal(one.build.author, 'Ky');
  assert.equal(one.build.link, 'https://mobalytics.gg/poe-2/builds/example');
  const st = one.build.steps[0];
  assert.equal(st.name, 'Endgame Step 1');
  assert.deepEqual(st.items.map((i) => i.label), ['Gloves', 'Helmet', 'Flask 1', 'Flask 2']);
  assert.equal(st.items[1].unique, 'Alpha\'s Howl');
  assert.equal(st.items[0].text, g);
  for (const store of [false, true]) {
    const zip = makeZip([
      { name: 'Guide/Endgame Step 1 {6}.build', data: BUILD_STEP(6, 'Endgame Step 1', g) },
      { name: 'Guide/Act 1 {1}.build', data: BUILD_STEP(1, 'Act 1', 'Rope Cuffs\n1. +40 to maximum Life') },
      { name: '__MACOSX/Guide/._Act 1 {1}.build', data: 'junk' },
      { name: 'Guide/readme.txt', data: 'not a build' }
    ], store);
    const z = await BF.readFiles([asFile('0.5.5_Example_Build_-_Leaguestart.zip', zip)]);
    assert.equal(z.error, null);
    assert.equal(z.build.title, '0.5.5 Example Build - Leaguestart', 'a zip is named after its file');
    assert.deepEqual(z.build.steps.map((s) => s.name), ['Act 1', 'Endgame Step 1'], 'in their {n} order');
  }
  const bad = await BF.readFiles([asFile('notes.build', Buffer.from('{"hello": 1}'))]);
  assert.equal(bad.build, null);
  assert.deepEqual(bad.skipped, ['notes']);
  const broken = await BF.readFiles([asFile('x.zip', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]))]);
  assert.equal(broken.build, null);
  assert.equal(broken.error, 'badzip');
});

test('build files: a zip that inflates past the limit is refused, not read', async () => {
  const big = 'x'.repeat(BF.LIMITS.entry + 10);
  const zip = makeZip([{ name: 'a.build', data: big }]);
  // the declared size gives it away
  let z = await BF.readFiles([asFile('a.zip', zip)]);
  assert.equal(z.build, null);
  // a header that lies about the size is stopped while it inflates
  const lie = Buffer.from(zip);
  const cdAt = lie.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  lie.writeUInt32LE(100, cdAt + 24);
  z = await BF.readFiles([asFile('a.zip', lie)]);
  assert.equal(z.build, null);
  assert.equal(z.error, 'toobig');
});

test('build files: a hybrid written as two lines, values with two numbers, and mods both sides roll', () => {
  const mods = (txt) => {
    const r = E.buildItem(txt), cat = E.catalog(r.base, 82);
    return { r, list: r.mods.map((m) => [m.s ? 'S' : 'P', E.famName(E.MODS[m.mi].f), E.labelTier(cat, { f: E.MODS[m.mi].f, mi: m.mi }), m.off || '']) };
  };
  // the real Endgame Step 3 staff: cast speed (line 3) and extra cold (line 7) are one alloy
  const staff = mods('Gelid Staff\n1. 149% increased Spell Damage\n2. +7 to Level of all Cold Spell Skills\n3. 39% increased Cast Speed\n4. 60% increased Critical Hit Chance for Spells\n' +
    '5. Gain 49% of Damage as Extra Cold Damage\n6. Gain 49% of Damage as Extra Lightning Damage\n7. Gain 11% of Elemental Damage as Extra Cold Damage');
  const hy = staff.r.mods.find((m) => /Cast Speed/.test(m.text));
  assert.equal(DATA.ids[hy.mi], 'AlloyCastSpeedDamageAsExtraColdHybrid1');
  assert.ok(hy.crafted);
  assert.deepEqual(staff.r.skipped, []);
  assert.deepEqual([0, 1].map((s) => staff.r.mods.filter((m) => m.s === s).length), [3, 3]);
  assert.equal(mods('Gelid Staff\n40% increased Cast Speed').list[0][2], 'T3', 'cast speed alone still rolls');
  // values that fit no tier of a hybrid stay two mods
  assert.deepEqual(mods('Sirenscale Gloves\n1. 56% increased Energy Shield\n2. +100 to maximum Life').list.map((x) => x[1]), ['Energy Shield', 'Maximum Life']);
  // "Adds X to Y": every value counts
  const ring = (l) => mods('Prismatic Ring\n' + l).list[0].slice(2).join(' ').trim();
  assert.equal(ring('Adds 1 to 30 Lightning damage to Attacks'), 'T5');
  assert.equal(ring('Adds 1 to 2 Cold damage to Attacks'), 'T9');
  assert.equal(ring('Adds 5 to 50 Lightning damage to Attacks'), 'T2', 'between two tiers: the best one it reaches');
  assert.equal(ring('Adds 1 to 100 Lightning damage to Attacks'), 'T1 over');
  // Rarity is a prefix and a suffix on rings: the value, then the room, picks the side
  assert.deepEqual(mods('Prismatic Ring\n7% increased Rarity of Items found').list[0].slice(0, 3), ['S', 'Rarity of Items found', 'T3']);
  const full = mods('Prismatic Ring\n+100 to maximum Life\n+150 to maximum Mana\n+20 to Evasion Rating\n15% increased Rarity of Items found\n+30% to Fire Resistance').list;
  assert.deepEqual(full.find((x) => x[1] === 'Rarity of Items found').slice(0, 3), ['S', 'Rarity of Items found', 'T1'], 'the prefixes are full');
  assert.deepEqual(mods('Azure Amulet\n15% increased Rarity of Items found\n12% increased Rarity of Items found').list.map((x) => x[0]), ['P', 'S'], 'twice: once on each side');
  // a crafted-only family takes the option that holds the value
  assert.equal(mods('Absent Amulet\n16% increased Global Armour, Evasion and Energy Shield').list[0][2], 'desecrated');
});

test('build files: lines and base names written by hand', () => {
  const r = E.buildItem('Iron Crown\n3)+7% to Cold Resistance\n- +40 to maximum Life\n• +6% to Fire Resistance\n12.5 Life Regeneration per second');
  assert.deepEqual(r.skipped, []);
  assert.equal(r.mods.length, 4, 'numbering, bullets and a decimal value');
  assert.equal(E.buildItem('Azure Amulet\nMinions deal 15% increased Damage if you’ve Hit Recently').mods.length, 1, 'a curly apostrophe');
  assert.equal(E.buildItem('prismatic ring\n+40 to maximum Life').base, 'Prismatic Ring', 'any case');
  const sr = E.buildItem('Superior Runeforged Sirenscale Gloves\n+100 to maximum Life');
  assert.deepEqual([sr.base, sr.runeforged], ['Sirenscale Gloves', true]);
  assert.equal(E.buildItem('Blue Prismatic Ring of Life\n+40 to maximum Life').base, null, 'only the exact base name');
  for (const bad of ['constructor\n+10 to Strength', 'toString', '__proto__\nx', 'Runeforged constructor']) assert.equal(E.buildItem(bad).base, null, bad);
  assert.equal(E.importItem('Rarity: Magic\ntoString').base, null);
});

test('build files: odd zips and files are read safely', async () => {
  const step = (n, label, author, link) => JSON.stringify({ author, link, name: label + ' {' + n + '} - Guide name here', inventory_slots: [{ inventory_id: 'Gloves1', additional_text: 'Rope Cuffs\n+40 to maximum Life' }] });
  // a fake end record inside the comment
  const zip = makeZip([{ name: 'a.build', data: step(1, 'Act 1', 'Ky', 'https://x.example/a') }]);
  const fake = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(30)]);
  const withComment = Buffer.from(Buffer.concat([zip, fake]));
  withComment.writeUInt16LE(fake.length, zip.length - 2);
  assert.equal((await BF.readFiles([asFile('c.zip', withComment)])).files, 1);
  // over the size limit: refused unread
  const big = 'x'.repeat(BF.LIMITS.entry - 100);
  const many = makeZip(Array.from({ length: 9 }, (_, i) => ({ name: i + '.build', data: big })), true);
  const refused = await BF.readFiles([asFile('m.zip', many)]);
  assert.deepEqual([refused.build, refused.skipped], [null, ['m']]);
  // two directory entries pointing at one file's bytes are read once
  const one = makeZip([{ name: 'a.build', data: step(1, 'Act 1', 'Ky', 'https://x.example/a') }]);
  const cd = one.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])), eocd = one.length - 22;
  const rec = one.subarray(cd, eocd);
  const twice = Buffer.concat([one.subarray(0, eocd), rec, one.subarray(eocd)]);
  twice.writeUInt16LE(2, twice.length - 22 + 8); twice.writeUInt16LE(2, twice.length - 22 + 10); twice.writeUInt32LE(rec.length * 2, twice.length - 22 + 12);
  assert.equal((await BF.readFiles([asFile('t.zip', twice)])).files, 1);
  // a long whitespace run in a name doesn't freeze anything
  const t0 = Date.now();
  BF.parseBuild(JSON.stringify({ name: 'a' + ' '.repeat(100000) + 'b {1}', inventory_slots: [] }), 'x.build', 0);
  assert.ok(Date.now() - t0 < 200, 'quick');
  assert.equal(BF.parseBuild(JSON.stringify({ inventory_slots: [{ inventory_id: 'Z'.repeat(5000), additional_text: 'x' }] }), 'x', 0).items[0].label.length, 30);
  // two zips at once are two builds; loose files of one guide are one
  const two = await BF.readFiles([
    asFile('One.zip', makeZip([{ name: '1.build', data: step(1, 'Act 1', 'Ky', 'https://x.example/a') }, { name: '2.build', data: step(2, 'Act 2', 'Ky', 'https://x.example/a') }])),
    asFile('Two (1).zip', makeZip([{ name: '1.build', data: step(1, 'Start', 'Other', 'https://x.example/b') }]))
  ]);
  assert.deepEqual(two.builds.map((b) => [b.title, b.steps.length]), [['One', 2], ['Two', 1]], 'a second download’s " (1)" is dropped');
  const loose = await BF.readFiles([asFile('a.build', Buffer.from(step(2, 'Act 2', 'Ky', 'https://x.example/a'))), asFile('b.build', Buffer.from(step(1, 'Act 1', 'Ky', 'https://x.example/a')))]);
  assert.deepEqual(loose.builds.map((b) => b.steps.map((s) => s.name)), [['Act 1', 'Act 2']]);
});

test('build files: steps of one guide added one file at a time merge into one build', async () => {
  const step = (n, label) => JSON.stringify({ author: 'Ky', link: 'https://x.example/a', name: label + ' {' + n + '} - Guide name', inventory_slots: [{ inventory_id: 'Gloves1', additional_text: 'Rope Cuffs\n+' + (10 * n) + ' to maximum Life' }] });
  let list = [];
  for (const [n, label] of [[2, 'Act 2'], [1, 'Act 1'], [2, 'Act 2']]) {
    const r = await BF.readFiles([asFile(label + '.build', Buffer.from(step(n, label)))]);
    list = BF.mergeInto(list, r.build, 6).list;
  }
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].steps.map((s) => s.name), ['Act 1', 'Act 2'], 'in {n} order, Act 2 once');
  const other = await BF.readFiles([asFile('o.build', Buffer.from(JSON.stringify({ author: 'Someone', name: 'X {1} - Other guide', inventory_slots: [] })))]);
  list = BF.mergeInto(list, other.build, 6).list;
  assert.equal(list.length, 2, 'another guide is its own build');
});

test('build files: ranges written as the goal, single stats that only look like a hybrid, and a hybrid’s best line', () => {
  const one = (txt) => {
    const r = E.buildItem(txt), cat = E.catalog(r.base, 82);
    return r.mods.map((m) => [E.famName(E.MODS[m.mi].f), E.labelTier(cat, { f: E.MODS[m.mi].f, mi: m.mi }), m.off || '']);
  };
  assert.deepEqual(one('Sapphire Ring\n+(60-69) to maximum Life'), [['Maximum Life', 'T4', '']], 'a written range counts as its low end');
  assert.deepEqual(one('Gelid Staff\n(38-43)% increased Cast Speed')[0].slice(1), ['T3', '']);
  assert.deepEqual(one('Hardwood Spear\n+347 to Accuracy Rating\n8% increased Attack Speed').map((x) => x[0]), ['Accuracy Rating', 'Attack Speed'], 'two rolled mods, not an alloy');
  assert.deepEqual(one('Stocky Mitts\n27% increased Armour\n+30 to maximum Life').map((x) => x[0]), ['Armour', 'Maximum Life']);
  // two cast speed lines: the one that fits the alloy's slot goes to the alloy, the other rolls
  const st = one('Gelid Staff\n50% increased Cast Speed\n39% increased Cast Speed\nGain 11% of Elemental Damage as Extra Cold Damage');
  assert.deepEqual(st.map((x) => x[1] + (x[2] ? ' ' + x[2] : '')), ['T1', 'alloy']);
  // a crafted-only pair whose sum fits but a value is under its slot is 'under', not 'over'
  assert.equal(E.buildItem('Crude Bow\n20% increased Physical Damage\n+6 to all Attributes').mods[0].off, 'under');
  // dashes a word processor makes are bullets too
  assert.deepEqual(E.buildItem('Iron Crown\n– +40 to maximum Life\n— +6% to Fire Resistance\n3. – +6% to Cold Resistance').skipped, []);
  assert.equal(BF.slotLabel('constructor'), 'constructor');
  assert.equal(BF.slotLabel('toString'), 'toString');
});

test('build files: steps with the same number or the same name are kept apart, and link-less guides group by author', async () => {
  const f = (name, json) => asFile(name, Buffer.from(JSON.stringify(json)));
  const st = (label, n, extra) => Object.assign({ name: label + ' {' + n + '} - x', inventory_slots: [{ inventory_id: 'Gloves1', additional_text: 'Rope Cuffs\n+' + (10 * n) + ' to maximum Life' }] }, extra || {});
  // two different steps sharing a number, in one zip: both kept
  const v = await BF.readFiles([asFile('variants.zip', makeZip(['Budget', 'Endgame'].flatMap((lbl) => [1, 2].map((n) => ({ name: lbl + n + '.build', data: JSON.stringify(st(lbl, n, { author: 'A', link: 'https://x.example/v' })) })))))]);
  assert.equal(v.build.steps.length, 4);
  // the same zip twice, every step called Leveling: each step replaces its own copy
  const lev = makeZip([1, 2, 3].map((n) => ({ name: n + '.build', data: JSON.stringify(st('Leveling', n, { author: 'Ann', link: 'https://x.example/l' })) })));
  let list = BF.mergeInto([], (await BF.readFiles([asFile('leveling.zip', lev)])).build, 6).list;
  list = BF.mergeInto(list, (await BF.readFiles([asFile('leveling.zip', lev)])).build, 6).list;
  assert.deepEqual(list[0].steps.map((s) => s.n), [1, 2, 3]);
  // one pick of a guide's loose files without a link is one build, whatever their cut-short titles
  const ky = await BF.readFiles([f('a.build', st('Act 1', 1, { author: 'Ky', name: 'Act 1 {1} - [0.5.5] Ky\'s Cold Caster Chr' })), f('b.build', st('Endgame', 6, { author: 'Ky', name: 'Endgame Step 1 {6} - [0.5.5] Ky\'s Cold C' })), f('c.build', st('x', 9, { author: 'Ky', name: 'Nonsense {9} - [0.' }))]);
  assert.equal(ky.builds.length, 1);
  assert.equal(ky.build.steps.length, 3);
  // two unrelated link-less builds by one author with no real title don't replace each other
  list = BF.mergeInto([], (await BF.readFiles([f('w.build', st('Witch Start', 1, { author: 'Bob', name: 'Witch Start {1} - [0.' }))])).build, 6).list;
  list = BF.mergeInto(list, (await BF.readFiles([f('r.build', st('Warrior Start', 1, { author: 'Bob', name: 'Warrior Start {1} - [0.' }))])).build, 6).list;
  assert.equal(list.length, 2);
  // merging says what came in and where it is
  const m = BF.mergeInto(list.concat([]), (await BF.readFiles([asFile('leveling.zip', lev)])).build, 6);
  assert.equal(m.merged, false);
  const zipped = BF.mergeInto([], (await BF.readFiles([asFile('g.zip', makeZip([1, 3].map((n) => ({ name: n + '.build', data: JSON.stringify(st('Step ' + n, n, { author: 'G', link: 'https://x.example/g' })) }))))])).build, 6).list;
  const two = BF.mergeInto(zipped, (await BF.readFiles([f('s2.build', st('Step 2', 2, { author: 'G', link: 'https://x.example/g' }))])).build, 6);
  assert.deepEqual([two.merged, two.added, two.at, two.build.title], [true, ['Step 2'], 1, 'g'], 'the zip’s title stays');
});
