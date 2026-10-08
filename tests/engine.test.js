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
