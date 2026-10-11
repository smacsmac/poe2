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
      pitch: 'Stonefist gloves: Way of the Stonefist turns each glove mod into a related, stronger one, so pick mods for what they become.',
      targets: [
        [['Adds # to # Lightning damage to Attacks', 'T1'], ['Adds # to # Cold damage to Attacks', 'T1'], ['#% increased Evasion and Energy Shield', 'T1']],
        [['+# to Level of all Melee Skills', 'T1'], ['#% increased Critical Damage Bonus', 'T1'], ['+#% to Fire Resistance', 'T2']]
      ],
      prio: [
        { m: '+Level of all Melee Skills', f: ['+# to Level of all Melee Skills'], tip: 'Stonefist: +1 to Level of all Melee Skills and +10–12% to Quality of all Skills (from +2)' },
        { m: 'Adds Lightning damage to Attacks', f: ['Adds # to # Lightning damage to Attacks'], min: 2, tip: 'Stonefist: Attacks gain 21–23% of Damage as Extra Lightning (T1)' },
        { m: 'A second flat damage: Cold, Fire or Physical to Attacks', f: ['Adds # to # Cold damage to Attacks', 'Adds # to # Fire damage to Attacks', 'Adds # to # Physical Damage to Attacks'], min: 2, tip: 'Stonefist: extra damage of that type, 21–23% at T1' },
        { m: 'Increased Evasion and Energy Shield', f: EV_ES, min: 2, tip: 'Stonefist: 19–20% more global Evasion and Energy Shield (T1); with life, 8% of damage taken recouped as Life, Mana and ES' },
        { m: 'Critical Damage Bonus', f: ['#% increased Critical Damage Bonus'], min: 2, tip: 'Stonefist: +2.5–3% to Critical Hit Chance (T1)' },
        { m: 'Any resistance', f: RES, min: 2, tip: 'Stonefist: +3% to its maximum resistance, plus 36–40% (T1)' },
        { m: 'Attack Speed', f: ['#% increased Attack Speed'], alt: true, tip: 'Stonefist: 26–30% chance to gain Onslaught on Hit (T1), not attack speed' },
        { m: 'Arcane Surge on Critical Hit (desecrated)', f: ['#% chance to Gain Arcane Surge when you deal a Critical Hit'], alt: true, tip: 'Stonefist: 5–10% chance to gain a Power Charge on Critical Hit' }
      ],
      avoid: 'Maximum Life and Maximum Mana: on Fists of Stone they become “17% less damage taken while on Low Life” and “more Attack damage while on Low Mana”.',
      notes: [
        { h: 'Who buys it', p: 'Martial Artist (Monk) is one of the most played ascendancies: about 19% of tracked Runes of Aldur characters on poe.ninja (October 2026), and about 10% in Forbidden Rites.' },
        { h: 'Why it sells', p: 'Way of the Stonefist turns the gloves into Fists of Stone and swaps each explicit mod for a related one, tier for tier (Path of Building’s data). Buyers pay for the result, so the mods are ranked here by what they become. The base is replaced too, so any base with a high item level works.' },
        { h: 'Before you craft', p: 'Paste a finished pair into the community Stonefist converter to see the result. On trade, look at what gloves with two flat damage mods, +Melee Skills and Critical Damage Bonus sell for, and how many are listed.' },
        { h: 'Watch out', p: 'Other attack builds want life on gloves, so Stonefist gloves without life sell mostly to Martial Artists. One review says Way of the Stonefist was weakened in 0.5.5d: check current prices before spending much.' }
      ],
      sources: [NINJA_ROA, NINJA_FR,
        ['Path of Building PoE2 data (Fists of Stone mods)', 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2'],
        ['Stonefist converter (community)', 'https://stonefist.kamiops.co/'],
        ['poe2database: Way of the Stonefist', 'https://poe2database.com/passives/way-of-the-stonefist'],
        ['IGGM: Martial Artist ascendancy review', 'https://www.iggm.com/news/poe-2-patch-0-5-0-martial-artist-ascendacy-review-way-of-the-stonefist-outrageous-glove-mechanic']]
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
      id: 'rf-boots', name: 'Premium Runeforged boots', tag: 'Every build',
      base: 'Cryptic Leggings', ilvl: 82, runeforge: true,
      pitch: 'Boots with top rolls first (35% movement speed, high life, two high resistances), then Runic Ward as the extra.',
      targets: [
        [['#% increased Movement Speed', 'T1'], ['+# to maximum Life', 'T1'], ['#% increased Runic Ward', 'Alloy']],
        [['+#% to Fire Resistance', 'T1'], ['+#% to Cold Resistance', 'T1'], ['+#% to Chaos Resistance', 'T2']]
      ],
      prio: [
        { m: 'Movement Speed', f: ['#% increased Movement Speed'], min: 1, tip: '35% is what makes them premium' },
        { m: 'Maximum Life', f: ['+# to maximum Life'], min: 2 },
        { m: 'A high resistance', f: RES, min: 2, tip: '36% or more' },
        { m: 'A second high resistance', f: RES, min: 2 },
        { m: 'Increased Runic Ward (Sovereign Alloy)', f: ['#% increased Runic Ward'], tip: 'the extra for Runic Ward builds; runeforging adds the ward to the base' },
        { m: 'Chaos resistance, or a third resistance', f: RES, min: 3 },
        { m: 'Increased Armour and Energy Shield', f: ['#% increased Armour and Energy Shield', '#% increased Armour and Energy Shield / +# to Stun Threshold', '+# to Armour / +# to maximum Energy Shield'], alt: true },
        { m: 'Rarity of Items found or Stun Threshold', f: ['#% increased Rarity of Items found', '+# to Stun Threshold'], alt: true }
      ],
      notes: [
        { h: 'Who buys it', p: 'Every build needs boots, including the two biggest in Runes of Aldur: Spirit Walker (about 30% of tracked characters on poe.ninja in October 2026) and Martial Artist (about 19%).' },
        { h: 'Competition', p: 'Plain life and resistance boots are the most crafted item there is. The top rolls are what set a pair apart: 35% movement speed with high life and two T1–T2 resistances.' },
        { h: 'The Runic Ward part', p: 'Ward mods only add value for Runic Ward builds, a smaller market, so get the base stats right first and treat the Sovereign Alloy as the extra, not the point.' },
        { h: 'Before you craft', p: 'On trade, compare 35% movement speed boots with life and two resistances to 30% ones: the gap is what the top roll is worth.' }
      ],
      sources: [NINJA_ROA, NINJA_FR]
    },
    {
      id: 'sw-spear', name: 'Spirit Walker fast spear', tag: 'To test',
      base: 'Soaring Spear', ilvl: 82,
      pitch: 'The second weapon set of Twister Spirit Walkers: a fast spear for Whirling Slash, where attack speed matters more than big damage.',
      targets: [
        [['Adds # to # Physical Damage', 'T2'], ['#% increased Physical Damage', 'T2'], ['+# to Accuracy Rating', 'T2']],
        [['#% increased Attack Speed', 'T1'], ['Leeches #% of Physical Damage as Life', 'T2'], ['Leeches #% of Physical Damage as Mana', 'T2']]
      ],
      prio: [
        { m: 'Attack Speed', f: ['#% increased Attack Speed'], min: 2, tip: 'the point of this spear: Whirling Slash builds its whirlwind faster' },
        { m: 'Life Leech', f: ['Leeches #% of Physical Damage as Life'], min: 3 },
        { m: 'Mana Leech', f: ['Leeches #% of Physical Damage as Mana'], min: 3, tip: 'helps pay for Whirling Slash' },
        { m: 'Adds Physical Damage', f: ['Adds # to # Physical Damage'], min: 3 },
        { m: 'Increased Physical Damage', f: ['#% increased Physical Damage', '#% increased Physical Damage / +# to Accuracy Rating'], min: 3 },
        { m: 'Critical Hit Chance', f: ['+#% to Critical Hit Chance'], min: 3 },
        { m: 'Accuracy Rating', f: ['+# to Accuracy Rating', '+# to Accuracy Rating / #% increased Light Radius'], alt: true },
        { m: 'Adds Cold, Fire or Lightning Damage', f: ['Adds # to # Cold Damage', 'Adds # to # Fire Damage', 'Adds # to # Lightning Damage'], alt: true }
      ],
      notes: [
        { h: 'Who buys it', p: 'Spirit Walker is the most played ascendancy in Runes of Aldur: about 30% of tracked characters on poe.ninja (October 2026). Twister guides run two weapon sets: one fast for Whirling Slash, one with big flat damage for Twister.' },
        { h: 'Why it could sell', p: 'Crafters chase the big damage spear, so a purpose-built fast spear may face less competition, and it doesn’t need every damage roll to be useful.' },
        { h: 'To test first', p: 'This one is an idea, not a proven market: the guides confirm the fast weapon set, but the leech lines come from a market suggestion the guides don’t mention. Check trade for fast spears and what they sell for before spending much.' },
        { h: 'Watch out', p: 'Guides keep Whirling Slash at level 1 to keep its mana cost low, so + levels to melee skills add little on this spear.' }
      ],
      sources: [NINJA_ROA,
        ['nexttier: Twister Spirit Walker (0.5)', 'https://nexttier.pro/guide/poe2-twister-spirit-walker-build-guide'],
        ['Odealo: Twister Spirit Walker (0.5)', 'https://odealo.com/articles/twister-spirit-walker-poe2-build'],
        ['Mobalytics: Twister Spirit Walker (0.5)', 'https://mobalytics.gg/poe-2/builds/twister-spirit-walker-snoobae']]
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
