"""Turn data/raw.json (from load.py) into data/data.json, the compact game data the app embeds.

Usage: python3 data/build_data.py
"""
import json, os, re, collections
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, 'raw.json')))
M, V, E, B = R['mods'], R['veiled'], R['ess'], R['bases']

CLASSES = [
  # id, name, group, matcher, essence class, bone
  ('helmet','Helmet','Armour', lambda n,b: b['type']=='Helmet', 'Helmet','Rib'),
  ('body','Body Armour','Armour', lambda n,b: b['type']=='Body Armour', 'Body Armour','Rib'),
  ('gloves','Gloves','Armour', lambda n,b: b['type']=='Gloves', 'Gloves','Rib'),
  ('boots','Boots','Armour', lambda n,b: b['type']=='Boots', 'Boots','Rib'),
  ('shield','Shield','Off-hand', lambda n,b: b['type']=='Shield' and not b['tags'].get('buckler'), 'Shield','Rib'),
  ('buckler','Buckler','Off-hand', lambda n,b: b['type']=='Shield' and b['tags'].get('buckler'), 'Buckler','Rib'),
  ('focus','Focus','Off-hand', lambda n,b: b['type']=='Focus', 'Focus','Rib'),
  ('quiver','Quiver','Off-hand', lambda n,b: b['type']=='Quiver', 'Quiver','Jawbone'),
  ('ring','Ring','Jewellery', lambda n,b: b['type']=='Ring', 'Ring','Collarbone'),
  ('amulet','Amulet','Jewellery', lambda n,b: b['type']=='Amulet', 'Amulet','Collarbone'),
  ('belt','Belt','Jewellery', lambda n,b: b['type']=='Belt', 'Belt','Collarbone'),
  ('wand','Wand','Caster weapon', lambda n,b: b['type']=='Wand', 'Wand','Jawbone'),
  ('staff','Staff','Caster weapon', lambda n,b: b['type']=='Staff' and not b['tags'].get('warstaff'), 'Staff','Jawbone'),
  ('sceptre','Sceptre','Caster weapon', lambda n,b: b['type']=='Sceptre', 'Sceptre','Jawbone'),
  ('bow','Bow','Martial weapon', lambda n,b: b['type']=='Bow', 'Bow','Jawbone'),
  ('crossbow','Crossbow','Martial weapon', lambda n,b: b['type']=='Crossbow', 'Crossbow','Jawbone'),
  ('spear','Spear','Martial weapon', lambda n,b: b['type']=='Spear', 'Spear','Jawbone'),
  ('mace1','One Hand Mace','Martial weapon', lambda n,b: b['type']=='One Hand Mace', 'One Hand Mace','Jawbone'),
  ('mace2','Two Hand Mace','Martial weapon', lambda n,b: b['type']=='Two Hand Mace', 'Two Hand Mace','Jawbone'),
  ('qstaff','Quarterstaff','Martial weapon', lambda n,b: b['type']=='Staff' and b['tags'].get('warstaff'), 'Warstaff','Jawbone'),
  ('talisman','Talisman','Martial weapon', lambda n,b: b['type']=='Talisman', 'Talisman','Jawbone'),
]
ARMOUR = ['helmet','body','gloves','boots','shield','buckler','focus']
JEWEL = ['ring','amulet','belt']
MARTIAL = ['bow','crossbow','spear','mace1','mace2','qstaff','talisman']
CASTER = ['wand','staff','sceptre']
WEAPONS = MARTIAL + CASTER
def each(cs, ids): return {c: list(ids) for c in cs}
ALLOYS = [
 ('Runic Alloy', {'ring':['AlloyMaximumRunicWard1'], 'amulet':['AlloyMaximumRunicWardPercent1'], 'belt':['AlloyRunicWardRechargeRate1']}),
 ('Adaptive Alloy', {'staff':['AlloyDamageAsExtraFireTwoHandWhileMissingRunicWard1'], 'wand':['AlloyDamageAsExtraFireWhileMissingRunicWard1'], 'gloves':['AlloyAttackSpeedIfMissingWardRecently1']}),
 ('Protective Alloy', {**each(WEAPONS,['AlloyMaximumRunicWardWeapon1']), 'belt':['AlloyRecoverRunicWardOnCharmUse1'], 'shield':['AlloyRunicWardOnBlock1'], 'buckler':['AlloyRunicWardOnBlock1']}),
 ('Expansive Alloy', {'gloves':['AlloyRemnantPickupRange1'], 'body':['AlloyPresenceAreaOfEffect1'], 'helmet':['AlloyManaCostEfficiency1'], 'boots':['AlloyTemporaryMinionSkillLimit1']}),
 ('Swift Alloy', {'gloves':['AlloyCastSpeedGloves1'], 'ring':['AlloyAttackSpeedRing1'], 'belt':['AlloyFlaskChargesPerSecond1'], **each(['shield','buckler','focus'],['AlloyTotemPlacementSpeed1'])}),
 ('Cyclonic Alloy', {'body':['AlloyReducedSlowPotency1'], 'boots':['AlloySkillEffectDuration1'], 'gloves':['AlloyDamagingAilmentDuration1'], 'helmet':['AlloyArchonDuration1']}),
 ('Prismatic Alloy', {'gloves':['AlloyElementalPenetration1'], **each(MARTIAL,['AlloyAilmentMagnitude1']), **each(['focus','staff','wand'],['AlloyExposureEffect1']), 'sceptre':['AlloyMinionDamagingAilmentMagnitude1']}),
 ('Mystic Alloy', {'helmet':['AlloySpellAreaOfEffect1'], 'gloves':['AlloyAttackAreaOfEffect1'], 'boots':['AlloySpiritOnBoots1'], 'quiver':['AlloyChanceToChain1'], **each(['wand','staff'],['AlloyMaximumElementalInfusions1'])}),
 ('Sovereign Alloy', {**each(WEAPONS,['AlloyEffectOfSocketedAugments1']), **each(ARMOUR,['AlloyLocalWardIncreasePercent1','AlloyLocalWardIncreasePercent2']), **each(JEWEL,['AlloyEffectOfResistanceMods1'])}),
 ('Celestial Alloy', {**each(['staff','wand'],['AlloySpellLevelManaHybrid1']), **each(MARTIAL,['AlloyAccuracyAttackSpeedHybrid1'])}),
 ('Transcendent Alloy', {'staff':['AlloyCastSpeedDamageAsExtraColdHybrid1'], **each(MARTIAL,['AlloyAttributeIncreasedLocalPhysicalDamageHybrid1'])}),
 ("The Runebinder's Alloy", {'staff':['AlloyNaturesArchon1'], 'wand':['AlloyElementalSkillLimit1'], 'sceptre':['AlloyPuppeteerStacks1'], 'crossbow':['AlloyBallistaLimit1'], 'bow':['AlloyMarkEffect']}),
 ("The Runefather's Alloy", {**each(['mace1','mace2'],['AlloyRetainGlory1']), 'qstaff':['AlloyBellLimit1'], 'spear':['AlloyMeleeStrikeRange1'], 'talisman':['AlloyLightningDamageIgnites1']}),
]
DROP = {'genesis_tree_caster','genesis_tree_minion','not_for_sale','demigods'}
KEYS = set()
for m in list(M.values()) + list(V.values()):
    for k in m.get('weightKey') or []: KEYS.add(k)
LICH = {'amanamu_mod':'Amanamu','ulaman_mod':'Ulaman','kurgal_mod':'Kurgal'}

def first_weight(m, tags):
    for k, w in zip(m.get('weightKey') or [], m.get('weightVal') or []):
        if k in LICH: continue
        if k in tags: return w
    return 0

# ---- bases
bases = []
cls_of = {}
for cid, cname, grp, match, ecls, bone in CLASSES:
    for n, b in sorted(B.items()):
        if b.get('hidden') or n.startswith('Runemastered') or n.startswith('Runeforged'): continue
        if set(b['tags']) & {'not_for_sale','demigods'}: continue
        if not match(n, b): continue
        cls_of[n] = cid
        bases.append((cid, n, b))

def poolkey(b):
    return frozenset((set(b['tags']) - DROP) & KEYS)

pools = {}   # key -> index
pool_tags = []
for cid, n, b in bases:
    k = poolkey(b)
    if k not in pools:
        pools[k] = len(pools); pool_tags.append(k)

# ---- mods
mod_index = {}   # mod id -> idx
mod_rows = []
fam_index = {}   # (side, group) -> idx
fam_rows = []
texts = []
text_index = {}
def tmpl(lines):
    return ' / '.join(re.sub(r'\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?', '#', l) for l in lines)
def category(tags, txt):
    t = set(tags or [])
    low = txt.lower()
    if 'gem' in t or 'level of all' in low: return 'Skill levels'
    if 'minion' in t or 'allies' in low or 'minion' in low: return 'Minions & allies'
    if 'resistance' in t or 'resistance' in low: return 'Resistances'
    if 'attribute' in t or re.search(r'to (strength|dexterity|intelligence|all attributes)', low): return 'Attributes'
    if 'life' in t or 'life' in low: return 'Life'
    if 'mana' in t or 'mana' in low or 'spirit' in low: return 'Mana & spirit'
    if 'defences' in t or 'armour' in t or 'evasion' in t or 'energy_shield' in t or 'runic ward' in low or 'block' in low: return 'Defences'
    if 'critical' in t or 'critical' in low: return 'Critical'
    if 'speed' in t or 'speed' in low: return 'Speed'
    if 'caster' in t or 'spell' in low: return 'Spells'
    if 'attack' in t or 'damage' in t or 'physical' in t or 'damage' in low: return 'Damage'
    return 'Other'
def text_id(s):
    if s not in text_index:
        text_index[s] = len(texts); texts.append(s)
    return text_index[s]
def add_mod(mid, m, src, lich=None):
    if mid in mod_index:
        r = mod_rows[mod_index[mid]]
        r['src'] |= src
        return mod_index[mid]
    side = 0 if m['type'] == 'Prefix' else 1
    lines = m.get('_lines') or []
    fk = (side, m['group'])
    if fk not in fam_index:
        fam_index[fk] = len(fam_rows)
        fam_rows.append({'s': side, 'g': m['group'], 't': tmpl(lines), 'c': category(m.get('modTags'), ' '.join(lines)), 'lv': -1})
    f = fam_index[fk]
    # family template from highest level tier seen
    if m['level'] > fam_rows[f]['lv']:
        fam_rows[f]['lv'] = m['level']; fam_rows[f]['t'] = tmpl(lines)
    row = {'id': mid, 's': side, 'f': f, 'l': m['level'], 'x': text_id(' / '.join(lines)), 'src': src}
    if lich: row['lich'] = lich
    mod_index[mid] = len(mod_rows); mod_rows.append(row)
    return mod_index[mid]

pool_mods = [[] for _ in pool_tags]
desec_mods = [[] for _ in pool_tags]
for pi, tags in enumerate(pool_tags):
    for mid, m in sorted(M.items()):
        if m.get('type') not in ('Prefix','Suffix'): continue
        if first_weight(m, tags) > 0:
            pool_mods[pi].append(add_mod(mid, m, 1))
    for mid, m in sorted(V.items()):
        if not mid.startswith('AbyssMod') or m.get('type') not in ('Prefix','Suffix'): continue
        if first_weight(m, tags) > 0:
            lich = next((LICH[t] for t in m.get('modTags', []) if t in LICH), None)
            desec_mods[pi].append(add_mod('V:'+mid, m, 8, lich))

# ---- essences
ESS_CLASS = {c[4]: c[0] for c in CLASSES}
def ess_tier(name):
    if name.startswith('Lesser '): return 'lesser'
    if name.startswith('Greater '): return 'greater'
    if name.startswith('Perfect '): return 'perfect'
    if name in ('Essence of Hysteria','Essence of Delirium','Essence of Horror','Essence of Insanity'): return 'corrupted'
    if name in ('Essence of the Abyss','Essence of the Breach'): return None
    return 'normal'
essences = []
for k, e in sorted(E.items()):
    tier = ess_tier(e['name'])
    if not tier: continue
    cmap = {}
    for ec, mid in sorted((e.get('mods') or {}).items()):
        cid = ESS_CLASS.get(ec)
        if not cid: continue
        if mid == 'EssenceDisplayDefences3':
            cmap[cid] = 'DEF3'
            continue
        if mid not in M: continue
        cmap[cid] = add_mod(mid, M[mid], 2)
    if cmap:
        essences.append({'n': e['name'], 'tier': tier, 'lvl': e.get('tierLevel'), 'm': cmap})
# Greater Essence of Enhancement -> per pool, the (68-79)% local defence tier
def68 = {}
for pi in range(len(pool_tags)):
    for mi in pool_mods[pi]:
        txt = texts[mod_rows[mi]['x']]
        if re.match(r'^\(68-79\)% increased (Armour|Evasion|Energy Shield)', txt) and '/' not in txt:
            def68[pi] = mi
for e in essences:
    for c, v in list(e['m'].items()):
        if v == 'DEF3': e['m'][c] = 'DEF3'
# ---- alloys
alloys = []
for name, cmap in ALLOYS:
    out = {}
    for c, ids in cmap.items():
        out[c] = [add_mod(i, M[i], 4) for i in ids if i in M]
    alloys.append({'n': name, 'm': out})

# ---- base rows
def num(x):
    return x
base_rows = []
for cid, n, b in sorted(bases, key=lambda t: (t[0], t[2].get('subType',''), t[2]['req'].get('level', 0), t[1])):
    rf = B.get('Runeforged ' + n)
    row = {'n': n, 'c': cid, 'sub': b.get('subType',''), 'lv': b['req'].get('level', 0),
           'rq': [b['req'].get('str',0), b['req'].get('dex',0), b['req'].get('int',0)],
           'p': pools[poolkey(b)]}
    if b.get('armour'): row['ar'] = b['armour']
    if b.get('weapon'): row['wp'] = b['weapon']
    if b.get('implicit'): row['im'] = b['implicit']
    if rf and rf.get('armour'): row['rf'] = rf['armour']
    if rf and rf.get('weapon') and not rf.get('armour'): row['rfw'] = rf['weapon']
    base_rows.append(row)

out = {
  'src': os.environ.get('POB_SRC', 'Path of Building PoE2 data, dev branch bb52d6b (Oct 1, 2026)'),
  'classes': [{'id': c[0], 'n': c[1], 'g': c[2], 'bone': c[5]} for c in CLASSES],
  'bases': base_rows,
  'fams': [{k: v for k, v in f.items() if k != 'lv'} for f in fam_rows],
  'mods': [[r['s'], r['f'], r['l'], r['x'], r['src']] + ([r['lich']] if r.get('lich') else []) for r in mod_rows],
  'ids': [r['id'] for r in mod_rows],
  'texts': texts,
  'pools': pool_mods,
  'desec': desec_mods,
  'def68': def68,
  'ess': essences,
  'alloys': alloys,
}
s = json.dumps(out, separators=(',', ':'), sort_keys=True)
open(os.path.join(HERE, 'data.json'), 'w').write(s)
print('bytes', len(s), 'bases', len(base_rows), 'pools', len(pool_tags), 'mods', len(mod_rows), 'fams', len(fam_rows), 'texts', len(texts), 'ess', len(essences))
print(collections.Counter(r['c'] for r in base_rows))
