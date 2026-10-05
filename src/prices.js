/* poe.ninja averages in divines: [Forbidden Rites, Runes of Aldur]. Snapshot Oct 4-5, 2026. */
(function (root) {
  var PRICES = {
    date: 'October 4–5, 2026',
    exPerDiv: { fr: 1 / 0.001492, roa: 1 / 0.001977 },
    p: {
      trans: [0.001768, 0.00002523], gtrans: [0.0003614, 0.0125], ptrans: [0.02436, 0.02198],
      aug: [0.003216, 0.0001625], gaug: [0.007025, 0.002302], paug: [0.3256, 0.1124],
      regal: [0.005011, 0.005761], gregal: [0.007674, 0.005367], pregal: [0.04616, 0.1042],
      exalt: [0.001492, 0.001977], gexalt: [0.01904, 0.01581], pexalt: [3.35, 2.58],
      chaos: [0.09453, 0.1175], gchaos: [0.2852, 0.3042], pchaos: [7.55, 7.88],
      alch: [0.007683, 0.0004118], annul: [0.5375, 0.4165], divine: [1, 1], fracture: [7.68, 4.67],
      vaal: [0.01473, 0.01536], artificer: [0.008858, 0.06061],
      scrap: [0.01272, 0.01382], whetstone: [0.005947, 0.003556], etcher: [0.01782, 0.01244],
      o_sin_ex: [0.08592, 0.2438], o_dex_ex: [0.03986, 0.05797], o_gr_ex: [0.01041, 0.03333], o_cat_ex: [0.04096, 0.3509],
      o_sin_an: [18.37, 17.83], o_dex_an: [11.17, 11.63], o_sin_er: [16.48, 21.17], o_dex_er: [11.0, 14.61], o_whit: [11.09, 15.58],
      o_sin_cr: [0.2955, 0.2119], o_dex_cr: [0.4865, 0.1579], o_sanct: [1.22, 1.56], o_blessed: [0.2539, 0.26],
      o_sin_nec: [0.0009453, 0.002368], o_dex_nec: [0.003014, 0.01036], o_echo: [0.09276, 0.05357], o_light: [7.25, 6.44],
      o_sov: [0.00006514, 0.0002472], o_liege: [0.00006276, null], o_black: [0.008988, 0.001895],
      o_chance: [12.52, null], o_ancients: [0.009377, null],
      'Gnawed Rib': [0.0125, 0.0004943], 'Gnawed Jawbone': [0.007796, 0.001977], 'Gnawed Collarbone': [0.01906, 0.03955],
      'Preserved Rib': [0.01822, 0.004289], 'Preserved Jawbone': [0.01302, 0.0004914], 'Preserved Collarbone': [0.2345, 0.03067], 'Preserved Cranium': [24.88, 7.22],
      'Ancient Rib': [5.8, 2.22], 'Ancient Jawbone': [6.81, 2.77], 'Ancient Collarbone': [5.93, 4.04],
      verisium: [0.00006515, 0.00008037],
      'Greater Essence of the Body': [0.0007513, 0.001623], 'Greater Essence of the Mind': [0.0002504, 0.0001082],
      'Greater Essence of Enhancement': [0.0008182, null], 'Greater Essence of Abrasion': [0.001485, 0.002568],
      'Greater Essence of Flames': [0.0003005, null], 'Greater Essence of Ice': [0.001503, null], 'Greater Essence of Electricity': [null, 0.00974],
      'Greater Essence of Ruin': [0.01004, 0.1558], 'Greater Essence of Battle': [0.0007513, null], 'Greater Essence of Sorcery': [0.001483, null],
      'Greater Essence of Haste': [0.002997, 0.02922], 'Greater Essence of the Infinite': [0.001503, null], 'Greater Essence of Seeking': [0.03456, null],
      'Greater Essence of Insulation': [0.00212, 0.01948], 'Greater Essence of Thawing': [0.006489, 0.01169], 'Greater Essence of Grounding': [0.00346, 0.001948],
      'Greater Essence of Alacrity': [0.004722, 0.01169], 'Greater Essence of Opulence': [0.06455, 0.2], 'Greater Essence of Command': [0.0121, null],
      'Essence of the Body': [0.02986, 0.0974], 'Essence of Enhancement': [0.001503, null], 'Essence of Abrasion': [0.1158, null], 'Essence of Flames': [0.008264, null],
      'Essence of Ice': [0.01728, null], 'Essence of Electricity': [0.07362, null], 'Essence of Ruin': [0.2855, null], 'Essence of Battle': [0.001503, null],
      'Essence of Sorcery': [0.286, null], 'Essence of Haste': [0.03306, null], 'Essence of the Infinite': [0.03456, null], 'Essence of Seeking': [0.02855, null],
      'Essence of Insulation': [0.2855, null], 'Essence of Thawing': [0.4766, null], 'Essence of Alacrity': [0.003005, null], 'Essence of Opulence': [0.1929, null],
      'Essence of Command': [0.01503, null], 'Lesser Essence of the Mind': [0.001503, null],
      'Perfect Essence of the Body': [0.002218, 0.003955], 'Perfect Essence of the Mind': [null, 0.01948], 'Perfect Essence of Enhancement': [0.1116, 0.05882],
      'Perfect Essence of Grounding': [0.03977, null], 'Perfect Essence of Battle': [null, 0.01475], 'Perfect Essence of Sorcery': [null, 0.01733],
      'Perfect Essence of the Infinite': [null, 0.002666], 'Perfect Essence of Insulation': [null, 0.01169], 'Perfect Essence of Seeking': [0.00971, null],
      'Essence of Insanity': [0.01838, 0.1582], 'Essence of Horror': [0.8453, 0.2609], 'Essence of Delirium': [1.18, 3.0], 'Essence of Hysteria': [1.62, 0.6007],
      'Essence of the Abyss': [0.2569, 0.04882],
      'Sovereign Alloy': [0.2195, 0.3333], 'Runic Alloy': [0.1923, 0.172], 'Swift Alloy': [0.02949, 0.01845], 'Mystic Alloy': [0.09361, 0.1636],
      'Prismatic Alloy': [0.01004, 0.09073], 'Adaptive Alloy': [0.2387, 0.8636], 'Protective Alloy': [0.01828, 0.8571], 'Expansive Alloy': [0.1063, 0.01977],
      'Cyclonic Alloy': [0.05763, 0.1511], 'Celestial Alloy': [0.5336, 1.64], 'Transcendent Alloy': [0.2833, 0.04174],
      "The Runebinder's Alloy": [0.403, 2.0], "The Runefather's Alloy": [0.008429, 0.4],
      "Astrid's Creativity": [3.48, 2.35]
    }
  };
  root.PRICES = PRICES;
  if (typeof module !== 'undefined') module.exports = PRICES;
})(typeof window !== 'undefined' ? window : globalThis);
