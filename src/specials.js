/* Special crafts: ready-made designs for items that sell, each with market notes for the Forge.
   Targets name a mod family by its text template (data.json fams[].t) and a tier label (T1, T2... or Alloy); the app
   resolves them on the base at its item level. The notes come from build guides and poe.ninja snapshots found in
   October 2026 (patch 0.5.5); play shares move, so they say where they come from and when.
   prio: what makes the item good, best first: { m: label, f: [family templates that count], min: tier to aim for
   (2 = T2 or better), tip, alt: a good alternative when the top ones don't land }. avoid: mods to skip. */
(function (root) {
  var CHECKED = 'October 11, 2026';
  var NINJA_FR = ['poe.ninja: Forbidden Rites builds', 'https://poe.ninja/poe2/builds/forbiddenrites'];
  var NINJA_ROA = ['poe.ninja: Runes of Aldur builds', 'https://poe.ninja/poe2/builds/runesofaldur'];
  var RES = ['+#% to Fire Resistance', '+#% to Cold Resistance', '+#% to Lightning Resistance', '+#% to Chaos Resistance',
    '+#% to Fire and Chaos Resistances', '+#% to Cold and Chaos Resistances', '+#% to Lightning and Chaos Resistances'];
  var EV_ES = ['#% increased Evasion and Energy Shield', '#% increased Evasion and Energy Shield / +# to maximum Life',
    '#% increased Evasion and Energy Shield / +# to Stun Threshold', '+# to Evasion Rating / +# to maximum Energy Shield'];
  var SPECIALS = [
    {
      id: 'ma-gloves', name: 'Martial Artist gloves', tag: 'Popular build',
      base: 'Secured Wraps', ilvl: 82,
      pitch: 'Damage gloves: Martial Artists make every glove mod stronger, and attack builds want the same mods.',
      targets: [
        [['Adds # to # Lightning damage to Attacks', 'T1'], ['Adds # to # Cold damage to Attacks', 'T1'], ['+# to maximum Life', 'T2']],
        [['+# to Level of all Melee Skills', 'T1'], ['#% increased Attack Speed', 'T1'], ['+#% to Fire Resistance', 'T2']]
      ],
      prio: [
        { m: '+Level of all Melee Skills', f: ['+# to Level of all Melee Skills'], tip: '+2 is the top roll; guides put skill levels first on Martial Artist gloves' },
        { m: 'Adds Lightning damage to Attacks', f: ['Adds # to # Lightning damage to Attacks'], min: 2 },
        { m: 'A second flat damage: Cold, Fire or Physical to Attacks', f: ['Adds # to # Cold damage to Attacks', 'Adds # to # Fire damage to Attacks', 'Adds # to # Physical Damage to Attacks'], min: 2 },
        { m: 'Attack Speed', f: ['#% increased Attack Speed'], min: 2, tip: '11% or more' },
        { m: 'Maximum Life', f: ['+# to maximum Life'], min: 3 },
        { m: 'Any resistance', f: RES, min: 3 },
        { m: 'Another resistance', f: RES, min: 3, alt: true },
        { m: 'Increased Evasion and Energy Shield', f: EV_ES, alt: true, tip: 'guides list evasion and energy shield for Martial Artists' }
      ],
      notes: [
        { h: 'Who buys it', p: 'Martial Artist (Monk) is one of the most played ascendancies: about 19% of Runes of Aldur characters early in the league, and about 10% in Forbidden Rites. Attack builds such as Gemling Legionnaire want flat damage, attack speed, life and resistances on gloves too.' },
        { h: 'Why it sells', p: 'Way of the Stonefist turns the gloves into Fists of Stone and makes their explicit mods stronger, so guides call high-roll damage gloves best in slot. The base is replaced, so any base with a high item level works: only the mods matter.' },
        { h: 'Before you craft', p: 'On trade, search gloves with two “Adds … damage to Attacks” mods, Attack Speed and +Level of all Melee Skills. Look at the prices and at how many are listed: few listings at good prices is the sign.' },
        { h: 'Tip', p: 'Sell what lands: two flat damage mods with Attack Speed already sell. Don’t chase a perfect six.' },
        { h: 'Watch out', p: 'One review says Way of the Stonefist was weakened in 0.5.5d, so check current prices before spending much.' }
      ],
      sources: [NINJA_ROA, NINJA_FR,
        ['poe2database: Way of the Stonefist', 'https://poe2database.com/passives/way-of-the-stonefist'],
        ['IGGM: Martial Artist ascendancy review', 'https://www.iggm.com/news/poe-2-patch-0-5-0-martial-artist-ascendacy-review-way-of-the-stonefist-outrageous-glove-mechanic'],
        ['Mobalytics: Giga Bonk Martial Artist (0.5.5)', 'https://mobalytics.gg/poe-2/builds/martial-artist-league-starter-build']]
    },
    {
      id: 'ms-boots', name: 'Movement speed boots', tag: 'Every build',
      base: 'Daggerfoot Shoes', ilvl: 82,
      pitch: 'The boots every build buys: movement speed, life and three resistances.',
      targets: [
        [['#% increased Movement Speed', 'T1'], ['+# to maximum Life', 'T2']],
        [['+#% to Fire Resistance', 'T2'], ['+#% to Cold Resistance', 'T2'], ['+#% to Lightning Resistance', 'T2']]
      ],
      prio: [
        { m: 'Movement Speed', f: ['#% increased Movement Speed'], min: 2, tip: '30% is T2, 35% is T1: the number buyers filter on' },
        { m: 'Maximum Life', f: ['+# to maximum Life'], min: 3 },
        { m: 'Any resistance', f: RES, min: 3 },
        { m: 'A second resistance', f: RES, min: 3 },
        { m: 'A third resistance', f: RES, min: 3 },
        { m: 'Increased Evasion and Energy Shield', f: EV_ES },
        { m: 'Rarity of Items found', f: ['#% increased Rarity of Items found'], alt: true, tip: 'mappers pay for it' },
        { m: 'Dexterity or Intelligence', f: ['+# to Dexterity', '+# to Intelligence', '+# to Dexterity and Intelligence'], alt: true }
      ],
      notes: [
        { h: 'Who buys it', p: 'Everyone. Martial Artist guides put movement speed first on boots, then resistances, life and evasion.' },
        { h: 'Competition', p: 'The most crafted item there is, so prices are lower and sales depend on the rolls: 30% movement speed or more with three resistances, or a high life roll, sells fastest.' },
        { h: 'Keep them universal', p: 'Runic Ward or augment mods only interest Runic Ward builds (Chronomancer is about 1–3% of characters on poe.ninja), so leave them off boots you mean to sell.' },
        { h: 'Before you craft', p: 'On trade, search boots with 30% movement speed, life and two or more resistances, sorted by price, to see what your rolls are worth.' }
      ],
      sources: [NINJA_ROA, NINJA_FR,
        ['Mobalytics: Martial Artist league starter (0.5)', 'https://mobalytics.gg/poe-2/builds/martial-artist-leveling-and-early-mapping-nicktew']]
    },
    {
      id: 'father', name: 'Runefather’s Grasping Mail', tag: 'Niche',
      base: "Runefather's Grasping Mail", ilvl: 82,
      pitch: 'A caster body armour with cast speed and all resistances from the ring pool, on pure Runic Ward.',
      targets: [
        [['+# to maximum Life', 'T1'], ['+# to Spirit', 'T1'], ['#% increased Runic Ward', 'Alloy']],
        [['#% increased Cast Speed', 'T1'], ['+#% to all Elemental Resistances', 'T1'], ['+#% to Chaos Resistance', 'T2']]
      ],
      prio: [
        { m: 'Cast Speed', f: ['#% increased Cast Speed'], min: 2, tip: 'no other body armour rolls it: the reason to buy this one' },
        { m: 'Maximum Life', f: ['+# to maximum Life'], min: 3 },
        { m: '+all Elemental Resistances', f: ['+#% to all Elemental Resistances'], min: 3 },
        { m: 'Spirit', f: ['+# to Spirit'], min: 3 },
        { m: 'Increased Runic Ward (Sovereign Alloy)', f: ['#% increased Runic Ward'] },
        { m: 'Any resistance (chaos is best)', f: RES, min: 3 },
        { m: 'Increased Cold, Fire or Lightning Damage', f: ['#% increased Cold Damage', '#% increased Fire Damage', '#% increased Lightning Damage'], alt: true },
        { m: 'Intelligence or maximum Mana', f: ['+# to Intelligence', '+# to maximum Mana'], alt: true }
      ],
      avoid: 'Increased Armour, Evasion and Energy Shield: the Runefather’s has none of them to increase.',
      notes: [
        { h: 'Why it’s special', p: 'Grasping Mail rolls ring mods too, so it can have Cast Speed and +all Elemental Resistances, which no other body armour rolls. The Runefather’s version is pure Runic Ward (550 base), made from a Grasping Mail in three changes at the Verisium Anvil.' },
        { h: 'Who buys it', p: 'Runic Ward casters, such as the Ice Nova Chronomancer: one 0.5 guide for that build wears a runeforged Grasping Mail. Olroth’s Resolve, the flask those builds use, sold for about 10 div in Runes of Aldur (6 in Forbidden Rites) in October.' },
        { h: 'Competition', p: 'Few crafters go through the Grasping Orchid (60 Breach Rings) and the Anvil, so there’s little competition, but the market is small too: Chronomancer is about 1–3% of characters.' },
        { h: 'Watch out', p: 'The app doesn’t know what the last two Anvil changes cost yet, and guides say the Orchid gives Grasping Mails rare and unidentified.' }
      ],
      sources: [NINJA_FR,
        ['Exile Codex: Ice Nova CoA Chronomancer (0.5)', 'https://exile.codex-wiki.com/builds/ice-nova-coa-chronomancer-build-guide-0-5-endgame-update'],
        ['Gamerant: the Grasping Orchid', 'https://gamerant.com/path-of-exile-2-poe2-how-unlock-grasping-orchid-what-do-use/']]
    },
    {
      id: 'gemling-xbow', name: 'Gemling crossbow', tag: 'Popular build',
      base: 'Siege Crossbow', ilvl: 82,
      pitch: 'The weapon of the most played build in Forbidden Rites: attack speed, projectile levels and elemental damage.',
      targets: [
        [['Adds # to # Lightning Damage', 'T1'], ['Adds # to # Cold Damage', 'T1'], ['#% increased Elemental Damage with Attacks', 'T1']],
        [['#% increased Attack Speed', 'T1'], ['+# to Level of all Projectile Skills', 'T1'], ['+#% to Critical Hit Chance', 'T1']]
      ],
      prio: [
        { m: 'Attack Speed', f: ['#% increased Attack Speed'], min: 2, tip: 'guides rank it first' },
        { m: '+Level of all Projectile Skills', f: ['+# to Level of all Projectile Skills'], min: 3, tip: '+3 or more' },
        { m: 'Adds Lightning Damage', f: ['Adds # to # Lightning Damage'], min: 3 },
        { m: 'Adds Cold or Fire Damage', f: ['Adds # to # Cold Damage', 'Adds # to # Fire Damage'], min: 3 },
        { m: 'Increased Elemental Damage with Attacks', f: ['#% increased Elemental Damage with Attacks'], min: 3 },
        { m: 'Critical Hit Chance', f: ['+#% to Critical Hit Chance'], min: 3 },
        { m: 'Critical Damage Bonus', f: ['+#% to Critical Damage Bonus'], alt: true },
        { m: 'Increased or added Physical Damage, for physical builds', f: ['#% increased Physical Damage', 'Adds # to # Physical Damage'], alt: true }
      ],
      notes: [
        { h: 'Who buys it', p: 'Gemling Legionnaire leads Forbidden Rites with about 35% of characters, and was about 9% of Runes of Aldur early in the league. The crossbow is its biggest upgrade.' },
        { h: 'What they want', p: 'Guides rank attack speed first, then + levels of projectile skills, added elemental damage and flat lightning. Physical builds want increased and added physical damage instead.' },
        { h: 'Competition', p: 'High value, but weapons are the most crafted slot: price-check this exact mix on trade before starting, and sell strong partial hits.' }
      ],
      sources: [NINJA_FR, NINJA_ROA,
        ['Mobalytics: Fresh Clip Gemling', 'https://mobalytics.gg/poe-2/builds/fearlessdumbo-fresh-clip-gemling'],
        ['Mobalytics: Grenades Gemling league starter (0.5.5)', 'https://mobalytics.gg/poe-2/builds/deadrabbit-grenades-gemling-league-starter']]
    },
    {
      id: 'cold-staff', name: 'Cold caster staff', tag: 'Niche',
      base: 'Chiming Staff', ilvl: 82,
      pitch: 'For Ice Nova and Comet casters: + levels of cold spells, extra cold damage and cast speed.',
      targets: [
        [['Gain #% of Damage as Extra Cold Damage', 'T1'], ['#% increased Cold Damage', 'T1'], ['+# to maximum Mana', 'T1']],
        [['+# to Level of all Cold Spell Skills', 'T1'], ['#% increased Cast Speed', 'T1'], ['#% increased Critical Hit Chance for Spells', 'T1']]
      ],
      prio: [
        { m: '+Level of all Cold Spell Skills (or all Spell Skills)', f: ['+# to Level of all Cold Spell Skills', '+# to Level of all Spell Skills'], min: 3, tip: 'guides call it the most important stat' },
        { m: 'Gain % of Damage as Extra Cold Damage', f: ['Gain #% of Damage as Extra Cold Damage'], min: 3 },
        { m: 'Increased Cold Damage or Spell Damage', f: ['#% increased Cold Damage', '#% increased Spell Damage', '#% increased Spell Damage / +# to maximum Mana'], min: 3 },
        { m: 'Cast Speed', f: ['#% increased Cast Speed'], min: 3 },
        { m: 'Gain % of Damage as Extra Lightning Damage', f: ['Gain #% of Damage as Extra Lightning Damage'], tip: 'cold caster guides use lightning to apply Shock' },
        { m: 'Critical Hit Chance for Spells', f: ['#% increased Critical Hit Chance for Spells'] },
        { m: 'Critical Spell Damage Bonus', f: ['#% increased Critical Spell Damage Bonus'], alt: true },
        { m: 'Maximum Mana', f: ['+# to maximum Mana'], alt: true }
      ],
      notes: [
        { h: 'What they want', p: 'Cold caster guides put + levels of cold spell skills first, then spell and cold damage, extra damage as cold or lightning, and cast speed. Chiming Staff grants Sigil of Power, which the Ice Nova Chronomancer guides use.' },
        { h: 'Who buys it', p: 'A smaller market: Chronomancer is about 1–3% of characters and Stormweaver about 2–3% on poe.ninja, so price-check first.' },
        { h: 'Tip', p: 'A staff with + cold levels, extra cold damage and cast speed holds its value even without the last mods.' }
      ],
      sources: [NINJA_FR,
        ['Mobalytics: Ky’s Cold Caster Chronomancer (0.5.5)', 'https://mobalytics.gg/poe-2/builds/cold-caster-chronomancer-ky'],
        ['poe-vault: Ice Nova Comet Chronomancer', 'https://www.poe-vault.com/poe2/sorceress/chronomancer/ice-nova-build-guide']]
    }
  ];
  root.SPECIALS = { checked: CHECKED, list: SPECIALS };
  if (typeof module !== 'undefined') module.exports = root.SPECIALS;
})(typeof window !== 'undefined' ? window : globalThis);
