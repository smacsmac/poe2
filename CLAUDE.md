# PoE2 Crafting Playbook

A single-page web app for Path of Exile 2 (patch 0.5.5) crafting. Three screens:

- **Design**: pick a slot, base and item level, then fill prefix/suffix boxes with target mods (minimum tier per box). Each box shows how the mod gets onto the item. The "Find a base" search above the slots finds any base in any slot and switches to it (like clicking that slot: a craft with targets or progress is kept in My crafts and a new one starts).
- **Forge** (the plan; internally still `plan`: `#v-plan`, `data-go="plan"`, `renderPlan`, and `#forge` works as a link): "Want" vs "Have" per slot, prefixes and suffixes each in their own box (suffix text in `--tip-suffix`), plus a step timeline. "Suggest" fills the item with what a bought base of the chosen rarity should have (`E.suggest`), and the "what's on your item" pickers list the design's targets for that side first. The steps open with two setup steps, "What do you have?" (Normal/Magic/Rare) and "What's on it?" (Suggest, Copy targets in), whose buttons do the same as the item card's; the plan follows from step 3 (`SETUP` in app.js) and the setup collapses into two done lines once the first outcome is recorded. The current step is highlighted with materials, prices and odds; the user records what happened and the plan re-plans. The plan is live: any change to the item or the design re-plans at once (`replan`, `planSt` always mirrors `st`), so there is no Forge ahead or Reforge button. Every item change is its own labelled undo step (`manualEdit(c, fn, label)`; no-op changes add none), and Undo sits right of Clear item and in the steps toolbar. The timeline folds runs of hand edits into one "Edited the item" line; `trimHist` keeps the history at 60 entries (40 when saved), folding the oldest edit runs first. When it drops recorded steps it counts them (`hdrop`) and keeps the item they started from (`h0`), so step numbers and "Started from" survive trimming and reloads. Opening the Forge creates a blank item, which doesn't make a craft under way: `underWay(c)` (history, or an item that isn't blank Normal) decides that for saving (`worth`), the base search, slot switches and My crafts. Undoing "Plan it with Astrid's Creativity" also turns the rune off (history entries can carry `as`). Re-renders give keyboard focus back to the same button (`focusKey`/`restoreFocus`); after an outcome focus and scroll go to the new current step. Toasts are also written to the `#sr-live` region for screen readers.
- **Reference**: the playbook text, crafting rules, quick fixes and a sortable materials/price ledger.

The header has the price league switch with full names (below 1320px wide it moves to `.league-row` under the header, and phones show FR and RoA; both sets of `[data-lg]` buttons stay in sync), a **Saved** button that says where the open craft is kept (`savedState()` in app.js: `local`, `account`, `saving`, or `fail` when the browser blocks storage; clicking it explains in a toast) and a gold **+** that starts a new craft in the same slot and says the old one is in My crafts.

**Copy for a chat** (under "Craft it" in Design's route panel, and in the Forge's steps toolbar) copies the same plain-text summary of the open craft, never the others, to paste into Claude or ChatGPT: `craftText(c)` in app.js gives the base, the targets with how each is made, the item now (status, tier, crafted/desecrated), the steps done, the next step in full and the rest as an outline. It's written for an assistant that doesn't know the app, so it opens with a short how-to-read. Copying tries the Clipboard API, then `execCommand('copy')`, then opens `#copybox`, a dialog with the text selected to copy by hand (embedded pages can block the clipboard).

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
src/ui/app.js        the app: state, storage, Design (with the base search), Forge, picker, crafts and slot drawers
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
- `suggest(design, rarity, skip)` -> the mods of the first state the plan reaches at that rarity from a fresh base: for magic, the base step's picks (the hardest target per side, or any mod on the side an alloy will clear); for rare, the item right after it turns rare. `null` when there's nothing to suggest.
- `socketable(base)`: armour, weapons and off-hands except quivers, plus Grasping Ring, Corona Amulet and Stalking Belt (bases made for socketed items). Only these can take Astrid's Creativity.
- `findBases(q, {cls, limit})` -> `{words, total, list:[{b, score, imp, on}]}` for the Design search. Every word has to match: a word start in the name ranks best, then the slot, defence type or attribute (aliases such as chest, es, armor, str/dex/int), then the middle of a name, then an implicit (`imp` is the line that matched). Ties go to `cls`, then the higher level base. `on[i]` says where word i matched so the UI highlights only that.

Shapes:

- `design = {cls, base, ilvl, runeforge, astrid, league, targets:[[{f, mi, lv}|null...], [...]]}`
- `st = {rarity:'none'|'magic'|'rare', mods:[{id, s, mi|null, mark:'auto'|'keep'|'junk', crafted?, desec?, fract?, pseudo?:'any'|'junk', est?}], done:{}, skip:{famIdx:true}}`
- A step: `{kind, title, how, mats:[{k, n, q?, opt?}], odds?:{p, what, alt?}, note?, warn?, spec?, options?, recommended?, outcomes:[{label, o}|{label, pick}|{label, edit}|{label, astrid}], project}`. `astrid: true` turns Astrid's Creativity on for the craft (the UI ticks the Design checkbox and re-plans).

Crafted slots go to craft-only targets first (`craftedPlan`: `cp` now, `cp.next` after it, `cp.extra` can't fit); the magic-to-rare essence bonus only takes a slot that is still free after them, and augments don't aim at the target it will add. A deleting craft with no junk to delete first gets a sacrifice on a side that holds nothing worth keeping (the other side, else its own side), so the deletion is certain where possible.

The magic base carries the hardest target on each side: hard targets cost far less to buy than to slam or desecrate later. It keeps a side as junk for a deleting craft only when that side has nothing to buy, already holds junk, or will face two deletions (two deleting crafts with Astrid's Creativity); see `junkSide`. Otherwise the junk is added once the item is rare (the sacrifice step) and the deletion is a coin flip with the bought target. Ties between equally hard targets go to the higher mod level, then the family (`byHardness`, `byLikely`), never to the box order, and the base step names the equally good alternative. Box order only matters when targets compete for the one desecrated slot or the crafted slots: the first box wins, and the Design screen warns about the other.

Policy order in `rareStep`: (0) if a removal will be needed anyway and starting over is the recommendation, say so before spending; (1) crafted mod that deletes (alloy / Perfect or corrupted essence), aimed with Crystallisation at the side holding only junk, or, when no side is clean, after a `sacrifice` slam (an omen-aimed Exalt that adds junk) on the side where that gives the best odds; (2) removal when junk blocks a target; (3) Exalt slams on the hardest side first, reserving slots for the crafted and desecrated targets; (4) desecration for the last open target; (5) removal, `craftCapStep`, or stop with skip options.

Craft-only targets (alloy or essence only) are `stuck` once the item's crafted slots are full: they don't count as blocked by junk (no removal or restart advice for them), and `craftCapStep` explains them instead. On a base with augment sockets it is a `rune` step whose first outcome is `{astrid: true}` ("Plan it with Astrid's Creativity"); otherwise a stop with skip and new-base outcomes. A target that only a regular essence adds (those need a magic item) is a stop on a rare either way: the rune wouldn't help. Craft steps for Perfect and corrupted essences start with what they do and where to get one (`craftIntro`).

Removal advice: options get `cost` (per try) and `exp` (rough average spend). With 2+ target mods on the item the cheapest fix up to 50 div is suggested; with 0-1 a new base; otherwise skip the hardest target. Every option is always shown.

## Game rules encoded (patch 0.5.5)

- 3 prefixes + 3 suffixes on rares (implicits can change this), 1+1 on magic.
- One crafted mod (essence or alloy) and one desecrated mod per item. Astrid's Creativity (a rune, needs an augment socket) allows a second crafted mod: with `design.astrid` the crafted cap is 2, an early essence can share with an alloy, and a `rune` step (Artificer's Orb + the rune, sets `done.astrid`) comes right before the second crafted mod, so the rune is only spent once the cheap, risky steps are behind you.
- Floors: Greater Exalt/Regal/Chaos mod level 35, Perfect 50. Greater Transmute/Aug 44, Perfect 70. A floor never removes a family's top tier.
- Alloys and Perfect/corrupted essences always delete a random mod. Crystallisation omens pick the side.
- Desecration: bone + Necromancy omen for the side, Abyssal Echoes for one reroll, pick 1 of 3 at the Well of Souls. Ancient bones: mod level 40+. Lich omens only on weapons and jewellery.
- Whittling removes the mod with the lowest required item level. Chaos adds a mod on any side with room.

## Constraints (artifact host)

- One self-contained file. External scripts only from cdnjs/jsdelivr/unpkg; stylesheets only Google Fonts. **No external images** (the CSP blocks them), so art is inline SVG. The gloves hero (`HERO_GLOVES` in app.js) is hand-drawn.
- Colours are tokens in `:root` (dark first) with light overrides under `prefers-color-scheme: light` and `[data-theme="light"]`. The item tooltip (`--tip-*`) stays dark in both themes on purpose. Never put a literal colour in a component rule.
- Must work at 400px wide with no sideways scroll; the phone layout uses a bottom tab bar, and its slot list is a drawer from the left (the "All slots" button) instead of the side rail. Tablets keep the rail as a sideways strip. The phone header keeps Saved and + visible: My crafts shows its count as a badge, and below 350px Saved is icon-only.
- `localStorage` reads and writes stay in try/catch (`saveOk` remembers whether the last one worked, for the Saved button). Key: `poe2-crafting-playbook-app-v2` (crafts, current id, league, view) and `poe2-crafting-playbook-v1` (ledger sort/filter).
- `window.claude` only exists inside claude.ai. With `claude.use('user')` and `claude.use('db')` crafts sync to `data/users/<uid>/<craftId>` (doc format `v: 2`, see `packCraft` in app.js; `as: 1` marks Astrid's Creativity). Without it (standalone page, friends without write access) everything falls back to localStorage. Never let the app depend on `window.claude`.
- `alert`/`confirm`/`prompt` don't work in artifacts. Confirmations are inline buttons.

## Publishing

- Artifact: https://claude.ai/artifact/NL7gbhvtcHRBprEhoivbAg (owner: the user). From a Claude session with the Artifact tool, publish `dist/artifact.html` to that URL with `capabilities: {db: {}, user: {}}`, keep the title "PoE2 Crafting Playbook", and omit `icon`.
- GitHub Pages: Settings -> Pages -> Deploy from branch `main`, folder `/docs`. Commit `docs/index.html` after building.

## Refreshing data

- Game data: `npm run data`. Check `git diff --stat data/data.json` and run the tests.
- Prices: edit `src/prices.js` (divines per item, `[FR, RoA]`, plus `exPerDiv` and `date`). Keys used by the engine: `trans gtrans ptrans aug gaug paug regal gregal pregal exalt gexalt pexalt chaos gchaos pchaos annul divine fracture`, omen keys `o_*`, and item names for bones, essences, alloys and Astrid's Creativity. `ref.js` reads the same table.

## Ideas not built yet

Real spawn weights (better odds), live prices, installable PWA (manifest + service worker on GitHub Pages), a shopping list for a plan, trade-search links for the base step, export/import of a craft, catalysts and Omen of Catalysing Exaltation for jewellery.
