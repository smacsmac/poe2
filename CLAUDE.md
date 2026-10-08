# PoE2 Crafting Playbook

A single-page web app for Path of Exile 2 (patch 0.5.5) crafting. Four screens:

- **Design**: pick a slot, base and item level, then fill prefix/suffix boxes with target mods (minimum tier per box). Each box shows how the mod gets onto the item. In the mod picker, the Essence, alloy and Desecrated tags only mark mods that can't be rolled (each tag means "only this way"); a mod that rolls and also comes from an essence says so in its tier list ("Also from ..."). The "Find a base" search above the slots finds any base in any slot and switches to it (like clicking that slot: a craft with targets or progress is kept in My crafts and a new one starts).
- **Forge** (the plan; internally still `plan`: `#v-plan`, `data-go="plan"`, `renderPlan`, and `#forge` works as a link): "Want" vs "Have" per slot, prefixes and suffixes each in their own box (suffix text in `--tip-suffix`), plus a step timeline. "Suggest" fills the item with what a bought base of the chosen rarity should have (`E.suggest`), and the "what's on your item" pickers list the design's targets for that side first. The steps open with two setup steps, "What kind of item would you like to start with?" (Normal/Magic/Rare: one you have or one you'll buy) and "What's on it?" (Suggest, Copy targets in), whose buttons do the same as the item card's; the plan follows from step 3 (`SETUP` in app.js) and the setup collapses into two done lines once the first outcome is recorded. The current-step box starts on the setup (`setupStage`, from the craft's `su` bits: 1 = step 1 answered, 2 = step 2 done): step 1 until a rarity is chosen or the item is edited, step 2 until Suggest or its Done button (a Normal item skips it), then the plan's step 3. `su` is saved, kept in undo snapshots, and set to 3 for older saves already under way. **Buying what Suggest filled in**: Suggest sets the craft's `bu` flag (saved, kept in undo snapshots as `bu`/`y`), and while it's set (and no setup step is current) step 3 is "Buy a magic/rare X" (`buyCard`): the item level to look for and each suggested mod with a tier select (changing one is an item edit, so the plan follows), then "Bought it" (`buyDone`: a recorded outcome with `buy: 1`, and `b: 1` for a magic base, so spent so far counts the base and doesn't also add "the item you started with") or "I'll make it myself instead" (back to a Normal item, so step 3 becomes "Get a magic base"). The plan follows from step 4. Clear item, Copy targets in and a rarity change clear `bu`. The current step is highlighted with materials, prices and odds; the user records what happened and the plan re-plans. The plan is live: any change to the item or the design re-plans at once (`replan`, `planSt` always mirrors `st`), so there is no Forge ahead or Reforge button. Every item change is its own labelled undo step (`manualEdit(c, fn, label)`; no-op changes add none), and Undo sits right of Clear item and in the steps toolbar. The timeline folds runs of hand edits into one "Edited the item" line; `trimHist` keeps the history at 60 entries (40 when saved), folding the oldest edit runs first. When it drops recorded steps it counts them (`hdrop`) and keeps the item they started from (`h0`), so step numbers and "Started from" survive trimming and reloads. Opening the Forge creates a blank item, which doesn't make a craft under way: `underWay(c)` (history, or an item that isn't blank Normal) decides that for saving (`worth`), the base search, slot switches and My crafts. Undoing "Plan it with Astrid's Creativity" also turns the rune off (history entries can carry `as`). Re-renders give keyboard focus back to the same button (`focusKey`/`restoreFocus`); after an outcome focus and scroll go to the new current step. Toasts are also written to the `#sr-live` region for screen readers.
- **Cost** (Forge; `costBtn`/`costSection`/`costBody` in app.js): the steps toolbar's "Cost & shopping list" button (left of Copy for a chat; `app.ui.shop`, not saved) opens the cost box above the steps, so the steps start with step 1 and no figures; closed, the average isn't worked out at all (only the choices' figures are). The box's "Cost · rough" shows what the rest of the plan costs if every roll lands (`E.planCost`), the average with misses if you follow the steps (`E.costPlan`), the targets the steps usually end up skipping, spent so far, and under "What drives the average" the step whose misses add the most (what they add on average once you get there, and what a miss there leads to). On a step that waits for your call (a stop or the rune offer) the block just says the choices carry the figures, and "if every roll lands" stops before such a step (its items belong to one of its choices). Every choice on a step with choices (Make room options, a base that missed, stop and rune offers) shows what it still costs to finish (`E.choiceCosts`, "~X to finish" plus its price now, "N in 10 without X" when that choice often ends without a target, and "Can't finish" when it leads into a loop), next to the spent line ("That's gone whichever you choose") and at most one hint: a choice that keeps every target (under 5% chance of losing one) and averages less than the suggested one (5% less, or 20% when it needs more magic bases, which are never priced), which also hides the Make room note saying fixing is the better bet; or what keeping a target costs over skipping it. A total with nothing priced reads "Not priced", never "nothing". The render uses `quick` results; when the average isn't ready it shows "Working out the average…", works it out in 12 ms slices (`scheduleCost`) and patches the text in (`patchCost`, text only: it rewrites the block only if it was drawn before the average was ready, never a button or the open "What drives the average"). The box also holds the **shopping list**: the base to buy (never priced), the steps' items merged with counts (chancy steps say "bring spares"), what a likely miss calls for each time, optional items, totals, and Copy list (`shopText`). **Spent so far**: each recorded outcome keeps what it used (`sp: [[priceKey, qty]]`, `b: 1` for a magic base; `E.spendOf`), so it reprices with the league; trimmed steps fold into the craft's `hs` (older entries are priced from their title before they fold); entries saved before this are priced from their step title (`E.deriveSpend`) or counted as "not counting N earlier steps". A finished craft's line keeps the same caveats (the item you started with, unpriced steps, unknown prices).
- **Mod text colours**: wherever mod text or a mod name is shown as HTML (Design boxes and route list, the implicit, Forge want/have rows, the picker), `modHTML(text)` in app.js escapes it and colours just the words Strength, Dexterity, Intelligence (red, green, blue), Fire, Cold (an icier blue than Intelligence), Lightning (yellow) and Chaos (a darker red), via `.kw-*` and the `--kw-*` tokens; the base's Str/Dex/Int requirements too. "Fire" as a verb ("Fire an additional Projectile") stays plain. The item card remaps `--kw-*` to `--tip-kw-*`, so it keeps the dark set in both themes. Plain text (toasts, aria labels, Copy for a chat) stays uncoloured. Rarity words follow the game too: Magic blue and Rare yellow on step 1's choices and its done line (`rarHTML`, `--rar-magic`/`--rar-rare`) and on the item card's Normal/Magic/Rare switch (`--tip-magic`/`--tip-rare`, picked or not; the picked one gets a bar).
- **Story** (`#v-story`, `data-go="story"`, `renderStory` in app.js): the Path of Exile 2 story so far at five lengths (50, 100, 250, 500 and 1,000 words; `STORY`), picked with a row of buttons, plus a "Did you know?" fact (`LORE`, "Another one" shows a different one). The length and the last fact are kept in `localStorage` under `poe2-crafting-playbook-lore` as `{n, f}`. The texts and facts were written from poe2wiki.net, poewiki.net and pathofexile.com and fact-checked (patch 0.5); keep any new ones short, true and plain.
- **Reference**: the playbook text, crafting rules, quick fixes and a sortable materials/price ledger.

The header shows the app version (`.brand-v`, "V2"): `appVersion` in package.json, put into the page by the build (`{{APP_VERSION}}` in markup.html and app.js; Copy for a chat names it too). **Bump `appVersion` by one for every change published to main, and tell the user which version is being worked on when a change starts.** The header has the price league switch with full names (below 1320px wide it moves to `.league-row` under the header, and phones show FR and RoA; both sets of `[data-lg]` buttons stay in sync), a **Saved** button that says where the open craft is kept (`savedState()` in app.js: `local`, `account`, `saving`, or `fail` when the browser blocks storage; clicking it explains in a toast) and a gold **+** that starts a new craft in the same slot and says the old one is in My crafts.

**Copy for a chat** (under "Craft it" in Design's route panel, and in the Forge's steps toolbar) copies the same plain-text summary of the open craft, never the others, to paste into Claude or ChatGPT: `craftText(c)` in app.js gives the base, the targets with how each is made, the item now (status, tier, crafted/desecrated), the steps done, a COST section (spent so far, if every roll lands, on average and what drives it), the next step in full (each choice with what it still costs to finish) and the rest as an outline. It's written for an assistant that doesn't know the app, so it opens with a short how-to-read. Copying tries the Clipboard API, then `execCommand('copy')`, then opens `#copybox`, a dialog with the text selected to copy by hand (embedded pages can block the clipboard).

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
- Cost (one section near the end of `createEngine`): `planCost(design, steps)` -> `{div, known, base, stopsAt, restart}` (required mats priced once, the suggested option's on a removal). `costPlan(design, st, {steps, quick, budget})` -> `{happy, avg:{div, bases, unknown, stop, skipped:[{f, name, p}]}, risk:{i, title, p, share, miss}, capped, fresh, states, cut}` or `null` (`quick`: answer only from what's already solved; `budget`: explore for at most that many ms, call again to carry on). `choicesOf(step)`, `choiceCosts(design, st, step, opts)` -> `[{key, label, kind, now, known, keeps, finish, bases, stop, loop, lose, loseName}]` (`lose`: the chance it ends without a target that isn't skipped yet). `shoppingList(design, st, steps)` -> `{base, rows, misses, optional}`. `spendOf(step, opt, outcome)`, `deriveSpend(design, histEntry)`, `spentOn(list, league)`, `costReset()`. The average is the planner's own advice solved exactly as a Markov chain over item states (one dense solve; restarts folded in as `a + r·X`, X the fresh base). Rolls draw from the same pool as the step's odds, every tier equal; a drawn wanted family at or above the target tier is that target, anything else (lower tiers too) is junk. Alloys and Annulment remove each candidate equally often, desecration uses the step's odds, removals take the suggested option. States that can't reach an end (done, stop, restart) are a loop the steps never leave: they get their own column, and anything that can end there is capped (`loop: true`, "after some misses the steps can't finish this item"), as is anything that restarts when a fresh base never finishes; capped choices are `Infinity`, never a huge number. Chains are cached per design and league (LRU 3); a chain past 200 states starts again before exploring states it hasn't seen, once per item state (`fitChain`, `C.anchor`, so the average and the choices for one item share a chain), and a single query past 400 prices the extra states as if every roll lands and says `cut`. The league is pinned while they run. Magic bases are counted, never priced; optional mats never count; unknown prices are flagged.
- `findBases(q, {cls, limit})` -> `{words, total, list:[{b, score, imp, on}]}` for the Design search. Every word has to match: a word start in the name ranks best, then the slot, defence type or attribute (aliases such as chest, es, armor, str/dex/int), then the middle of a name, then an implicit (`imp` is the line that matched). Ties go to `cls`, then the higher level base. `on[i]` says where word i matched so the UI highlights only that.

Shapes:

- `design = {cls, base, ilvl, runeforge, astrid, league, targets:[[{f, mi, lv}|null...], [...]]}`
- `st = {rarity:'none'|'magic'|'rare', mods:[{id, s, mi|null, mark:'auto'|'keep'|'junk', crafted?, desec?, fract?, pseudo?:'any'|'junk', est?}], done:{}, skip:{famIdx:true}}`
- A step: `{kind, title, how, mats:[{k, n, q?, opt?}], odds?:{p, what, alt?}, note?, warn?, spec?, options?, recommended?, outcomes:[{label, o}|{label, pick}|{label, edit}|{label, astrid}], project}`. An outcome can carry `uses` (what it used when the step's mats are optional, like the Orb of Annulment on a base that missed).
- History entries (app.js, saved as `h`): `{t, o, e?, st, ps, sl, as?, su?, sp?, b?}`; `sp`/`b` are written on every recorded outcome (`[]` when nothing was used). The craft keeps `hdrop`/`h0` and `hs: {sp:{key: qty}, b, x}` for trimmed steps (`x` = ones that couldn't be priced). `astrid: true` turns Astrid's Creativity on for the craft (the UI ticks the Design checkbox and re-plans).

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
- `localStorage` reads and writes stay in try/catch (`saveOk` remembers whether the last one worked, for the Saved button). Key: `poe2-crafting-playbook-app-v2` (crafts, current id, league, view), `poe2-crafting-playbook-v1` (ledger sort/filter) and `poe2-crafting-playbook-lore` (the Story screen's length and last fact).
- `window.claude` only exists inside claude.ai. With `claude.use('user')` and `claude.use('db')` crafts sync to `data/users/<uid>/<craftId>` (doc format `v: 2`, see `packCraft` in app.js; `as: 1` marks Astrid's Creativity). Without it (standalone page, friends without write access) everything falls back to localStorage. Never let the app depend on `window.claude`.
- `alert`/`confirm`/`prompt` don't work in artifacts. Confirmations are inline buttons.

## Publishing

- Artifact: https://claude.ai/artifact/NL7gbhvtcHRBprEhoivbAg (owner: the user). From a Claude session with the Artifact tool, publish `dist/artifact.html` to that URL with `capabilities: {db: {}, user: {}}`, keep the title "PoE2 Crafting Playbook", and omit `icon`.
- GitHub Pages: Settings -> Pages -> Deploy from branch `main`, folder `/docs`. Commit `docs/index.html` after building.

## Refreshing data

- Game data: `npm run data`. Check `git diff --stat data/data.json` and run the tests.
- Prices: edit `src/prices.js` (divines per item, `[FR, RoA]`, plus `exPerDiv` and `date`). Keys used by the engine: `trans gtrans ptrans aug gaug paug regal gregal pregal exalt gexalt pexalt chaos gchaos pchaos annul divine fracture`, omen keys `o_*`, and item names for bones, essences, alloys and Astrid's Creativity. `ref.js` reads the same table.

## Ideas not built yet

Real spawn weights (better odds), live prices, installable PWA (manifest + service worker on GitHub Pages), letting the removal advice rank its options by the cost chain (the "to finish" figures) instead of its own rough estimate, trade-search links for the base step, export/import of a craft, catalysts and Omen of Catalysing Exaltation for jewellery.
