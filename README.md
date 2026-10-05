# PoE2 Crafting Playbook

Plan a Path of Exile 2 craft from an empty base to a finished rare.

![The Plan screen: what you want next to what you have, and the next step](docs/screenshot-plan.png)

- **Design** the item: pick a slot and base (or type a base name like Cryptic Leggings to jump straight to it), then choose the prefixes and suffixes you want from the mods that can actually roll on that base, with a minimum tier for each. Every box shows how that mod gets there: on the base, an Exalt slam with rough odds, an alloy or essence in your crafted slot (two with Astrid's Creativity socketed), or a desecration pick.
- **Plan** it step by step: start from nothing or from an item in progress. Each step lists what to use, what it costs and the odds. Tell it what happened ("Got Cold Resistance", "Something else…") and it re-plans. Mark unwanted mods Keep or Ditch. When junk blocks a slot it compares fixing, skipping a target and starting over.
- **Reference**: the general crafting order, rules, quick fixes and every main material with where it drops and its price (Forbidden Rites or Runes of Aldur).

Data comes from [Path of Building PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)'s game files. Prices are a poe.ninja snapshot (October 4–5, 2026). Odds are rough: the game data has no spawn weights, so every tier counts the same.

## Use it

- Open `docs/index.html` in a browser, or `npm run serve` and go to http://localhost:8080.
- In claude.ai it runs as an artifact, where crafts sync to your account between devices. As a plain page they're kept in the browser.

## Develop

```bash
npm run build   # assemble docs/index.html and dist/artifact.html
npm test        # planner tests
npm run e2e     # browser walk-through (needs Playwright)
npm run data    # refresh game data from Path of Building
```

See [CLAUDE.md](CLAUDE.md) for how the planner and the app are put together.
