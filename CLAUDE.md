# PoE2 Crafting Playbook

A single-page web app for Path of Exile 2 (patch 0.5.5) crafting. Three screens:

- **Design**: pick a slot, base and item level, then fill prefix/suffix boxes with target mods (minimum tier per box). Each box shows how the mod gets onto the item.
- **Plan**: "Want" vs "Have" per slot, plus a step timeline. The current step is highlighted with materials, prices and odds; the user records what happened and the plan re-plans. Hand edits make the plan stale until "Reforge from here".
- **Reference**: the playbook text, crafting rules, quick fixes and a sortable materials/price ledger.

It ships as one self-contained HTML file. It is published as a claude.ai artifact and can also be served as a static page (`docs/index.html`, GitHub Pages ready).

## Commands

```bash
npm run build   # src + data -> dist/artifact.html (artifact content) and docs/index.html (standalone page)
npm test        # planner engine tests, node:test, no installs
npm run e2e     # Playwright walk-through of docs/index.html (needs: npm i -D playwright && npx playwright install chromium)
npm run serve   # serve docs/ on http://localhost:8080
npm run data    # refresh game data from Path of Building (needs git, python3, pip install lupa), then rebuild
```

Always run `npm run build && npm test` after changes. Run `npm run e2e` after UI changes and look at `tests/shots/` (dark, light, phone).

## Layout

```
src/engine.js        planner engine: pure functions over the game data, no DOM (works in node and the browser)
src/prices.js        poe.ninja price snapshot in divines, [Forbidden Rites, Runes of Aldur]
src/ui/app.js        the app: state, storage, Design, Plan, picker, crafts drawer
src/ui/ref.js        Reference screen's materials ledger
src/ui/app.css       all styles (theme tokens at the top)
src/ui/markup.html   static page skeleton, including the Reference screen's text
src/ui/icons.html    inline SVG sprite: slot icons (i-*), UI icons (u-*), gradients for the hero art
data/load.py         PoB Lua data -> data/raw.json (gitignored)
data/build_data.py   raw.json -> data/data.json (committed, deterministic)
scripts/build.js     assembles the single HTML file
scripts/fetch-pob.sh sparse clone of PathOfBuilding-PoE2 src/Data into vendor/pob (gitignored)
tests/               engine.test.js (unit), e2e.js (browser)
```

## Data model

`data/data.json` (embedded as `window.DATA`):

- `classes` `[{id, n, g, bone}]`: 21 slot classes (gloves, ring, qstaff...). `bone` is the desecration bone (Rib, Jawbone, Collarbone).
- `bases` `[{n, c, sub, lv, rq:[str,dex,int], p, ar?, wp?, im?, rf?, rfw?}]`: `p` is the mod pool index, `im` implicit text, `rf`/`rfw` the Runeforged armour/weapon stats.
- `fams` `[{s, g, t, c}]`: mod families (side 0 prefix / 1 suffix, PoB group, text template, category).
- `mods` `[[side, fam, level, textIdx, srcBits, lich?]]` with `texts[textIdx]`. srcBits: 1 normal, 2 essence, 4 alloy, 8 desecrated.
- `ids` `[modId]`: PoB mod ids parallel to `mods`. **Saved crafts reference mods by these ids (`k`), never by array index**, so data refreshes don't break saves.
- `pools[p]` rollable mod indices per pool; `desec[p]` desecrated (lich) mods per pool.
- `ess` `[{n, tier, lvl, m:{class: modIdx}}]` essences; `alloys` `[{n, m:{class:[modIdx]}}]` (alloy -> slot mapping is hand-written in build_data.py from the U4N alloy list).

Eligibility follows PoB: the first `weightKey` that matches the base's tags decides. Real spawn weights are not in the data (only 0/1), so **odds count every eligible tier equally**. Keep the UI copy honest about that.

## Engine (src/engine.js)

`createEngine(DATA, PRICES)` returns:

- `catalog(base, ilvl)` -> `{base, cls, caps:[prefixSlots, suffixSlots], sides:[[family]], byFam}`. Caps come from implicits like "+1 Prefix Modifier allowed" (Dusk Amulet is 4/2).
- `tierOptions(cat, fam)`, `methods(cat, target)` (slam / essence / alloy / lich routes), `analyze(cat, design, st)` (sets `m.status` = hit | low | junk | keep on the item's mods).
- `nextStep(design, st)`, `plan(design, st)` (current step plus a projected happy path, max 16 steps, stops after a restart), `apply(st, outcome)`.
- `setLeague('fr'|'roa')`, `price(key, league)`, `oddsLabel(p)`.

Shapes:

- `design = {cls, base, ilvl, runeforge, league, targets:[[{f, mi, lv}|null...], [...]]}`
- `st = {rarity:'none'|'magic'|'rare', mods:[{id, s, mi|null, mark:'auto'|'keep'|'junk', crafted?, desec?, fract?, pseudo?:'any'|'junk', est?}], done:{}, skip:{famIdx:true}}`
- A step: `{kind, title, how, mats:[{k, n, q?, opt?}], odds?:{p, what, alt?}, note?, warn?, spec?, options?, recommended?, outcomes:[{label, o}|{label, pick}|{label, edit}], project}`

Policy order in `rareStep`: (0) if a removal will be needed anyway and starting over is the recommendation, say so before spending; (1) crafted mod that deletes (alloy / Perfect or corrupted essence), aimed with Crystallisation at the side holding only junk; (2) removal when junk blocks a target; (3) Exalt slams on the hardest side first, reserving slots for the crafted and desecrated targets; (4) desecration for the last open target; (5) removal or stop with skip options.

Removal advice: options get `cost` (per try) and `exp` (rough average spend). With 2+ target mods on the item the cheapest fix up to 50 div is suggested; with 0-1 a new base; otherwise skip the hardest target. Every option is always shown.

## Game rules encoded (patch 0.5.5)

- 3 prefixes + 3 suffixes on rares (implicits can change this), 1+1 on magic.
- One crafted mod (essence or alloy) and one desecrated mod per item.
- Floors: Greater Exalt/Regal/Chaos mod level 35, Perfect 50. Greater Transmute/Aug 44, Perfect 70. A floor never removes a family's top tier.
- Alloys and Perfect/corrupted essences always delete a random mod. Crystallisation omens pick the side.
- Desecration: bone + Necromancy omen for the side, Abyssal Echoes for one reroll, pick 1 of 3 at the Well of Souls. Ancient bones: mod level 40+. Lich omens only on weapons and jewellery.
- Whittling removes the mod with the lowest required item level. Chaos adds a mod on any side with room.

## Constraints (artifact host)

- One self-contained file. External scripts only from cdnjs/jsdelivr/unpkg; stylesheets only Google Fonts. **No external images** (the CSP blocks them), so art is inline SVG. The gloves hero (`HERO_GLOVES` in app.js) is hand-drawn.
- Colours are tokens in `:root` (dark first) with light overrides under `prefers-color-scheme: light` and `[data-theme="light"]`. The item tooltip (`--tip-*`) stays dark in both themes on purpose. Never put a literal colour in a component rule.
- Must work at 400px wide with no sideways scroll; the phone layout uses a bottom tab bar.
- `localStorage` reads and writes stay in try/catch. Key: `poe2-crafting-playbook-app-v2` (crafts, current id, league, view) and `poe2-crafting-playbook-v1` (ledger sort/filter).
- `window.claude` only exists inside claude.ai. With `claude.use('user')` and `claude.use('db')` crafts sync to `data/users/<uid>/<craftId>` (doc format `v: 2`, see `packCraft` in app.js). Without it (standalone page, friends without write access) everything falls back to localStorage. Never let the app depend on `window.claude`.
- `alert`/`confirm`/`prompt` don't work in artifacts. Confirmations are inline buttons.

## Publishing

- Artifact: https://claude.ai/artifact/NL7gbhvtcHRBprEhoivbAg (owner: the user). From a Claude session with the Artifact tool, publish `dist/artifact.html` to that URL with `capabilities: {db: {}, user: {}}`, keep the title "PoE2 Crafting Playbook", and omit `icon`.
- GitHub Pages: Settings -> Pages -> Deploy from branch `main`, folder `/docs`. Commit `docs/index.html` after building.

## Refreshing data

- Game data: `npm run data`. Check `git diff --stat data/data.json` and run the tests.
- Prices: edit `src/prices.js` (divines per item, `[FR, RoA]`, plus `exPerDiv` and `date`). Keys used by the engine: `trans gtrans ptrans aug gaug paug regal gregal pregal exalt gexalt pexalt chaos gchaos pchaos annul divine fracture`, omen keys `o_*`, and item names for bones, essences and alloys. `ref.js` reads the same table.

## Ideas not built yet

Real spawn weights (better odds), live prices, installable PWA (manifest + service worker on GitHub Pages), a shopping list for a plan, trade-search links for the base step, export/import of a craft, catalysts and Omen of Catalysing Exaltation for jewellery.
