/* Browser walk-through of the built page (docs/index.html) at desktop and phone sizes.
 * Run: npm run build && npm run e2e
 * Needs Playwright: npm i -D playwright && npx playwright install chromium
 * (or set CHROMIUM_PATH to an existing Chromium binary). Screenshots go to tests/shots/.
 */
const path = require('path');
const fs = require('fs');
const assert = require('node:assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const URL = 'file://' + path.join(__dirname, '..', 'docs', 'index.html');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

async function addTarget(page, side, i, query, famText) {
  await page.click(`[data-act="d-pick"][data-s="${side}"][data-i="${i}"]`);
  await page.fill('#pk-q', query);
  await page.locator('.fam-main', { hasText: famText }).first().click();
  await page.waitForSelector('#picker', { state: 'hidden' });
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    // Catch what "Copy for a chat" puts on the clipboard
    await ctx.addInitScript(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(scheme + ': ' + e.message));
    await page.goto(URL);

    // Design the user's gloves
    await addTarget(page, 0, 0, 'maximum life', 'to maximum Life');
    await addTarget(page, 0, 1, 'maximum mana', 'to maximum Mana');
    await addTarget(page, 0, 2, 'runic ward', 'Runic Ward');
    await addTarget(page, 1, 0, 'lightning resistance', 'Lightning Resistance');
    await addTarget(page, 1, 1, 'cold resistance', 'to Cold Resistance');
    await addTarget(page, 1, 2, 'critical damage', 'Critical Damage Bonus');
    assert.equal(await page.locator('#d-item .box:not(.empty)').count(), 6);
    // Element and attribute words carry the game's colours, the word only
    assert.deepEqual(await page.locator('#d-item .box-text .kw').allTextContents(), ['Lightning', 'Cold']);
    assert.deepEqual(await page.locator('#d-item .box-text .kw').evaluateAll((els) => els.map((e) => e.className)), ['kw kw-light', 'kw kw-cold']);
    // Life can roll, so the picker doesn't tag it Essence (that read as the only way); essence-only mods keep the tag
    await page.click('[data-act="d-pick"][data-s="0"][data-i="0"]');
    await page.fill('#pk-q', 'life');
    assert.equal(await page.locator('.fam-main', { hasText: 'to maximum Life' }).first().locator('.tag').count(), 0);
    assert.equal(await page.locator('.fam-main:has(.tag.ess) .fam-m', { hasText: /^\d+ tiers?/ }).count(), 0, 'no Essence tag on a mod that rolls');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${OUT}/${scheme}-design.png`, fullPage: true });

    // The header: full league names, and a Saved button that says where the craft is kept
    assert.deepEqual(await page.locator('.bar [data-lg]').allInnerTexts(), ['Forbidden Rites', 'Runes of Aldur']);
    assert.equal(await page.locator('.bar .brand-v').innerText(), 'V' + require('../package.json').appVersion, 'the app version shows in the header');
    await page.waitForSelector('#saved[data-state="local"]');
    await page.click('#saved');
    assert.match(await page.locator('#toast').innerText(), /The Blacksteel Gauntlets craft is saved in this browser/);

    // Copy for a chat: the craft as text, from the Design page
    await page.click('#d-route [data-act="copy-craft"]');
    assert.match(await page.locator('#toast').innerText(), /Copied this craft as text/);
    const designText = await page.evaluate(() => window.__copied);
    assert.match(designText, /^Path of Exile 2 crafting, patch 0\.5\.5\./);
    assert.match(designText, /THE ITEM\nBlacksteel Gauntlets \(Gloves, Armour\/Evasion\), item level 82\./);
    assert.match(designText, /- Runic Ward: \(31–40\)% increased Runic Ward\. How: Crafted slot · Sovereign Alloy\./);
    assert.match(designText, /WHERE I AM NOW\nNot started/);
    assert.match(designText, /NEXT STEP \(step 3\)\nGet a magic base/);

    // Astrid's Creativity opens a second crafted slot; untick it again for the rest of the walk-through
    await page.check('#d-astrid');
    assert.match(await page.locator('.slot2').first().innerText(), /crafted slots[\s\S]*1 free/i);
    await page.uncheck('#d-astrid');
    assert.doesNotMatch(await page.locator('.slot2').first().innerText(), /crafted slots/i);

    // The Forge opens on two setup steps (what you have, what's on it), then the live plan from step 3.
    // The current-step box starts on step 1.
    await page.click('[data-act="to-plan"]');
    assert.match(await page.locator('.st.now .card-k').textContent(), /Now · step 1 · Setup/);
    assert.equal((await page.locator('.st.now .card h3').innerText()).replace(/\s+/g, ' '), 'Step 1: What kind of item would you like to start with?', 'numbered for screen readers too');
    assert.match(await page.locator('.st.setup.todo h4').innerText(), /What’s on it\?/);
    assert.match(await page.locator('.st.next h4').first().textContent(), /Get a magic base/, 'the plan follows, waiting its turn');
    assert.equal(await page.locator('[data-act="forge"]').count(), 0, 'no Forge ahead button: the plan is live');
    await page.screenshot({ path: `${OUT}/${scheme}-setup.png`, fullPage: true });

    // An item in progress, set up from the steps: Rare, Copy targets in, then remove what it doesn't have
    await page.click('#p-steps [data-act="rarity"][data-v="rare"]');
    assert.equal(await page.getAttribute('#p-item .seg [data-v="rare"]', 'aria-pressed'), 'true', 'the item card follows step 1');
    await page.click('#p-steps [data-act="start-copy"]');
    for (const name of ['Runic Ward', 'Lightning Resistance', 'Cold Resistance', 'Critical Damage Bonus']) {
      await page.locator('.srow', { hasText: name }).first().locator('[data-act="have-del"]').click();
    }
    for (let k = 0; k < 2; k++) {
      await page.locator('.have.empty [data-act="have-add"][data-s="1"]').first().click();
      await page.click('.pk-junk');
    }
    assert.match(await page.locator('.now-on').innerText(), /On it now: Maximum Life T1, Maximum Mana T1, a junk suffix and a junk suffix\./);
    assert.match(await page.locator('.st.now .card-k').textContent(), /Now · step 2 · Setup/, 'step 2 stays current until Done');
    assert.match(await page.locator('.st.next h4').first().textContent(), /Sovereign Alloy/, 'the steps follow each change');
    await page.click('#p-steps [data-act="setup-done"]');
    assert.match(await page.locator('.st.now .card-k').textContent(), /Now · step 3/);
    assert.match(await page.locator('.card h3').textContent(), /Sovereign Alloy/);
    await page.click('.card [data-act="out"][data-i="0"]');
    assert.match(await page.locator('.card h3').textContent(), /Make room/);
    assert.match(await page.locator('.st.now .card-k').textContent(), /Now · step 4/);
    assert.equal(await page.locator('.st.setup-done').count(), 2, 'once a step is recorded, the setup shows as done');
    assert.equal(await page.locator('#tab-step').textContent(), '4');
    await page.screenshot({ path: `${OUT}/${scheme}-plan.png`, fullPage: true });

    // From the Forge, the copy has the item, the steps so far and the next one; Design copies the same text
    await page.click('.steps-tools [data-act="copy-craft"]');
    const forgeText = await page.evaluate(() => window.__copied);
    assert.match(forgeText, /WHERE I AM NOW\nRare item\.\nPrefixes \(3 of 3\):\n- \+\(\d+–\d+\) to maximum Life: on target, T1/);
    assert.match(forgeText, /\(31–40\)% increased Runic Ward: on target, crafted \(alloy\)/);
    assert.match(forgeText, /STEPS DONE\n1–2\. Started from a rare Blacksteel Gauntlets with Maximum Life, Maximum Mana, a junk suffix and a junk suffix\.\n3\. Add Runic Ward with the Sovereign Alloy: /);
    assert.match(forgeText, /NEXT STEP \(step 4\)\nMake room on the suffix side/);
    assert.match(forgeText, /Ways to do it:\n- .+\(suggested\)/);
    await page.click('.tabs [data-go="design"]');
    await page.click('#d-route [data-act="copy-craft"]');
    assert.equal(await page.evaluate(() => window.__copied), forgeText, 'both pages copy the same text');
    assert.match(forgeText, /\nCOST \(rough: /);
    assert.match(forgeText, /Spent so far: about [\d.]+ (div|ex) \(the steps I recorded in the app/);
    assert.match(forgeText, /\(suggested\): .+ About [\d.]+ (div|ex) a try; about [\d,.]+ (div|ex) to finish\./);
    await page.click('.tabs [data-go="plan"]');

    // Cost: each choice says what it still costs to finish; the cost box itself stays closed until asked for
    const choicesReady = () => page.waitForFunction(() => [...document.querySelectorAll('.oc .ofin')].every((e) => !/…/.test(e.textContent)));
    assert.equal(await page.locator('#p-cost').count(), 0, 'the steps start without the cost box');
    await choicesReady();
    for (const t of await page.locator('.opt .ofin').allInnerTexts()) assert.match(t, /to finish|until it stops again|Very high/);
    // a new base usually ends without Maximum Mana, and says so next to its lower figure
    assert.match(await page.locator('.opt[data-k="restart"] .otry').innerText(), /^\+ (a magic base|about \d+ magic bases) · (\d+ in 10|nearly always) without Maximum Mana$/);
    const spentCard = await page.locator('.card .spent').innerText();
    assert.match(spentCard, /^Spent so far: about [\d.]+ (div|ex), plus the item you started with\. That’s gone whichever you choose, so compare what each choice still costs\.$/);
    // "Cost & shopping list", left of Copy for a chat, opens the box: if every roll lands, the average, spent so far, the list
    assert.deepEqual((await page.locator('.steps-tools .btn').allInnerTexts()).slice(0, 2), ['Cost & shopping list', 'Copy for a chat']);
    await page.click('.steps-tools [data-act="shop"]');
    assert.equal(await page.getAttribute('.steps-tools [data-act="shop"]', 'aria-expanded'), 'true');
    await page.waitForSelector('#p-cost-body[aria-busy="false"]');
    const costText = await page.locator('#p-cost-body').innerText();
    assert.match(costText, /if every roll lands/);
    assert.match(costText, /~[\d,.]+ (div|ex) on average, following the steps/);
    assert.match(costText, /Spent so far: about [\d.]+ (div|ex), plus the item you started with\./);
    const shopH = await page.locator('#shop h4').allInnerTexts();
    assert.ok(shopH.some((t) => /^For the steps/.test(t)), 'items for the steps');
    assert.ok(!shopH.some((t) => /^The base/.test(t)), 'the item started rare: no base to buy');
    await page.screenshot({ path: `${OUT}/${scheme}-cost.png`, fullPage: true });
    await page.click('[data-act="shop-copy"]');
    assert.match(await page.locator('#toast').innerText(), /Copied the shopping list\./);
    assert.match(await page.evaluate(() => window.__copied), /^Shopping list: Blacksteel Gauntlets, item level 82\n/);
    await page.click('[data-act="shop-close"]');
    assert.equal(await page.locator('#p-cost').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-act')), 'shop', 'focus goes back to the button');
    // A save from before spend was recorded is priced from the steps' titles, the same way
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const k = 'poe2-crafting-playbook-app-v2', raw = JSON.parse(localStorage.getItem(k));
      Object.values(raw.crafts).forEach((c) => (c.h || []).forEach((h) => { delete h.sp; delete h.b; }));
      localStorage.setItem(k, JSON.stringify(raw));
    });
    await page.reload();
    await choicesReady();
    assert.equal(await page.locator('.card .spent').innerText(), spentCard, 'old entries are priced from their titles');

    // A hand edit re-plans at once and shows as one "Edited the item" line; Undo next to Clear item takes it back
    await page.locator('.have:not(.empty) [data-act="have-del"]').last().click();
    assert.doesNotMatch(await page.locator('.card h3').textContent(), /Make room/);
    assert.match(await page.locator('.st.done.edit').innerText(), /Edited the item[\s\S]*Removed a junk suffix/);
    assert.equal(await page.getAttribute('#p-item [data-act="undo"]', 'title'), 'Undo: Removed a junk suffix');
    await page.click('#p-item [data-act="undo"]');
    assert.match(await page.locator('#toast').innerText(), /Undid “Removed a junk suffix”/);
    assert.match(await page.locator('.card h3').textContent(), /Make room/);
    assert.equal(await page.locator('.st.done.edit').count(), 0);
    // A change that changes nothing adds no undo step
    await page.click('#p-item [data-act="rarity"][data-v="rare"]');
    assert.equal(await page.getAttribute('#p-item [data-act="undo"]', 'title'), 'Undo: Add Runic Ward with the Sovereign Alloy');

    // The Plan screen is called Forge. Suggest fills in the magic base the plan starts from: a hard target on each side.
    assert.match(await page.locator('.tabs [data-go="plan"]').innerText(), /^Forge/);
    await page.click('#p-item [data-act="rarity"][data-v="magic"]');
    await page.click('#p-item [data-act="suggest"]');
    assert.match(await page.locator('#toast').innerText(), /Suggested a magic base with Maximum Life and Cold Resistance\. The rarest targets go on the base/);
    // "Add what's here" lists your design's targets first, the one for that row on top
    await page.locator('.srow', { hasText: 'Maximum Mana' }).locator('[data-act="have-add"]').click();
    assert.match(await page.locator('.fam.pin .fam-t').first().innerText(), /maximum Mana/);
    await page.screenshot({ path: `${OUT}/${scheme}-pins.png` });
    await page.locator('.fam.pin .fam-main').first().click();
    assert.equal(await page.locator('.srow', { hasText: 'Maximum Mana' }).locator('.have.st-hit').count(), 1);
    await page.screenshot({ path: `${OUT}/${scheme}-forge.png`, fullPage: true });

    await page.click('.tabs [data-go="ref"]');
    await page.screenshot({ path: `${OUT}/${scheme}-reference.png` });

    // Find a base in any slot. The gloves craft has progress, so picking boots starts a new craft.
    await page.click('.tabs [data-go="design"]');
    await page.fill('#find-q', 'cryptic');
    assert.deepEqual(await page.locator('.fo .fo-n').allTextContents(), ['Cryptic Crown', 'Cryptic Leggings', 'Cryptic Helm']);
    await page.screenshot({ path: `${OUT}/${scheme}-find.png` });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.bp-name').textContent(), 'Cryptic Leggings');
    assert.equal(await page.locator('.slot[aria-pressed="true"]').getAttribute('data-cls'), 'boots');
    assert.match(await page.locator('#toast').textContent(), /new craft for Cryptic Leggings/);
    // The new boots craft is empty, so a ring switches it in place. Clicking a result works too.
    await page.fill('#find-q', 'prismatic');
    await page.locator('.fo', { hasText: 'Prismatic Ring' }).click();
    assert.equal(await page.locator('.bp-name').textContent(), 'Prismatic Ring');
    assert.equal(await page.inputValue('#find-q'), '');
    await page.fill('#find-q', 'zzz');
    assert.match(await page.locator('#find-foot').textContent(), /No base matches/);
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#find-pop').isHidden());
    await ctx.close();
  }

  // A last target that needs a second crafted slot: the plan offers Astrid's Creativity, then shows the way.
  // At 1280px wide the league switch sits in a row under the header.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  // This browser won't let the app copy, so "Copy for a chat" shows the text to copy by hand
  await ctx2.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')) } });
    document.execCommand = () => false;
  });
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errors.push('astrid: ' + e.message));
  await q.goto(URL);
  assert.ok(await q.locator('.league-row').isVisible(), 'league row under the header');
  assert.ok(await q.locator('.bar .league-wrap').isHidden(), 'no league switch in the header');
  await q.fill('#find-q', 'cryptic leggings');
  await q.keyboard.press('Enter');
  await addTarget(q, 0, 0, 'movement speed', 'Movement Speed');
  await addTarget(q, 0, 1, 'runic ward', 'Runic Ward');
  await addTarget(q, 1, 0, 'rarity', 'Rarity of Items');
  await addTarget(q, 1, 1, 'socketed augment', 'Socketed Augment');
  await q.click('[data-act="to-plan"]');
  await q.click('#p-item [data-act="start-copy"]');
  await q.locator('.srow', { hasText: 'Socketed Augment' }).locator('[data-act="have-del"]').click();
  await q.click('#p-steps [data-act="setup-done"]');
  assert.match(await q.locator('.card h3').textContent(), /Use Astrid’s Creativity for Effect of Socketed Augment Items/);
  // The rune offer compares what each way on still costs
  await q.waitForFunction(() => [...document.querySelectorAll('.oc .ofin')].every((e) => !/…/.test(e.textContent)));
  assert.match(await q.locator('.cmp .oc[data-ck="astrid"] .otry').innerText(), /^the rune: /);
  assert.match(await q.locator('.cmp .oc[data-ck="astrid"] .ofin').innerText(), /to finish|Very high/);
  await q.screenshot({ path: `${OUT}/dark-astrid.png`, fullPage: true });
  await q.click('.card [data-act="out"][data-i="0"]');
  assert.match(await q.locator('#toast').innerText(), /Astrid’s Creativity is on/);
  assert.equal(await q.locator('.st', { hasText: 'Socket Astrid’s Creativity' }).count(), 1, 'the plan sockets the rune');
  await q.click('.steps-tools [data-act="copy-craft"]');
  await q.waitForSelector('#copybox:not([hidden])');
  assert.match(await q.inputValue('#cb-text'), /I plan to use Astrid’s Creativity so it can hold two crafted mods\./);
  assert.match(await q.inputValue('#cb-text'), /\nNEXT STEP \(step 3\)\n.+\n[\s\S]*\d+\. Socket Astrid’s Creativity: Artificer’s Orb, Astrid’s Creativity/);
  await q.screenshot({ path: `${OUT}/dark-copybox.png` });
  await q.keyboard.press('Escape');
  assert.ok(await q.locator('#copybox').isHidden());
  await q.click('.tabs [data-go="design"]');
  assert.ok(await q.isChecked('#d-astrid'));
  // The gold + starts a new craft in the same slot and says the old one is saved
  await q.click('.new-btn');
  assert.match(await q.locator('#toast').innerText(), /New craft started\. The Cryptic Leggings craft is saved in My crafts/);
  assert.equal(await q.locator('#d-item .box:not(.empty)').count(), 0);
  assert.equal(await q.locator('.slot[aria-pressed="true"]').getAttribute('data-cls'), 'boots');
  await ctx2.close();

  // Phone
  const ph = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ph.newPage();
  p.on('pageerror', (e) => errors.push('phone: ' + e.message));
  await p.goto(URL);
  await addTarget(p, 0, 0, 'maximum life', 'to maximum Life');
  await p.click('[data-act="to-plan"]');
  // On a phone the steps come first, with the setup steps' buttons at the top
  assert.ok(await p.locator('#p-steps .pick3').isVisible());
  await p.locator('#p-steps [data-act="rarity"][data-v="magic"]').tap();
  await p.locator('#p-steps [data-act="suggest"]').tap();
  assert.match(await p.locator('.now-on').innerText(), /On it now: Maximum Life/);
  assert.match(await p.locator('.st.now .card-k').textContent(), /Now · step 3/, 'Suggest fills in the item, so step 3 is next');
  // Step 3 says what to buy; the tier you got can be set, then Bought it records the base and the plan goes on
  assert.match(await p.locator('.st.now .card h3').innerText(), /^Buy a magic /);
  assert.match(await p.locator('.buy-mods').innerText(), /Maximum Life/);
  assert.match(await p.locator('.st.next h4').first().innerText(), /Step 4:/, 'the plan follows the purchase');
  await p.locator('.buy-mods select').first().selectOption({ label: 'T2' });
  assert.match(await p.locator('#p-card .have:not(.empty) .h-text').first().innerText(), /maximum Life/);
  await p.locator('[data-act="buy-done"]').tap();
  assert.match(await p.locator('.st.now .card-k').textContent(), /Now · step 4/);
  assert.match(await p.locator('.st.done:not(.setup-done)').first().innerText(), /Buy a magic [\s\S]*Bought it: Maximum Life T2/);
  await p.locator('.steps-tools [data-act="undo"]').tap();
  assert.match(await p.locator('.st.now .card h3').innerText(), /^Buy a magic /, 'Undo brings the purchase back');
  assert.ok(await p.locator('#p-steps .to-item').isVisible(), 'a jump to the item card on a phone');
  const [sw, w] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= w, 'no sideways scroll on a phone');
  assert.ok(await p.locator('.league-row').isVisible(), 'league switch under the header on a phone');
  assert.deepEqual(await p.locator('.league-row [data-lg]').allInnerTexts(), ['FR', 'RoA'], 'short league names on a phone');
  assert.equal(await p.locator('#saved').innerText(), 'Saved');
  await p.screenshot({ path: `${OUT}/phone-plan.png`, fullPage: true });
  // The shopping list fits a phone too
  await p.locator('.steps-tools [data-act="shop"]').tap();
  await p.waitForSelector('#shop');
  const [sw3, w3] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw3 <= w3, 'no sideways scroll with the shopping list open');
  await p.screenshot({ path: `${OUT}/phone-cost.png`, fullPage: true });
  await p.locator('[data-act="shop-close"]').tap();
  // The Story screen: the story at five lengths, and a fact at a time
  await p.locator('.tabbar [data-go="story"]').tap();
  const lens = await p.locator('#s-len button').allInnerTexts();
  assert.deepEqual(lens, ['50 words', '100 words', '250 words', '500 words', '1,000 words']);
  for (const [i, target] of [[0, 50], [2, 250], [4, 1000]]) {
    await p.locator('#s-len button').nth(i).tap();
    const words = (await p.locator('#s-text').innerText()).trim().split(/\s+/).length;
    assert.ok(Math.abs(words - target) <= target * 0.2, target + ' words: got ' + words);
  }
  const fact = await p.locator('#s-fact').innerText();
  assert.ok(fact.length > 20, 'a fact');
  await p.locator('[data-act="story-fact"]').tap();
  assert.notEqual(await p.locator('#s-fact').innerText(), fact, 'another fact');
  const [sw4, w4] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw4 <= w4, 'no sideways scroll on the Story screen');
  await p.screenshot({ path: `${OUT}/phone-story.png`, fullPage: true });
  await p.click('.tabbar [data-go="design"]');
  await p.fill('#find-q', 'cryptic leg');
  await p.screenshot({ path: `${OUT}/phone-find.png` });
  await p.locator('.fo').first().tap();
  assert.equal(await p.locator('.bp-name').textContent(), 'Cryptic Leggings');
  const [sw2, w2] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw2 <= w2, 'no sideways scroll on a phone after a search');
  // On a phone the slot list is a drawer from the left instead of the side rail
  assert.ok(await p.locator('#rail').isHidden(), 'no slot rail on a phone');
  await p.tap('#slot-pick');
  await p.waitForSelector('#slots:not([hidden])');
  assert.equal(await p.locator('#slots .slot').count(), await p.evaluate(() => window.DATA.classes.length));
  await p.locator('#slots .drawer-card').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await p.screenshot({ path: `${OUT}/phone-slots.png` });
  await p.locator('#slots [data-cls="ring"]').tap();
  await p.waitForSelector('#slots', { state: 'hidden' });
  assert.equal(await p.locator('.bp-name').textContent(), 'Prismatic Ring');
  assert.match(await p.locator('#slot-pick').textContent(), /Ring/);

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('e2e passed. Screenshots in tests/shots/');
})().catch((e) => { console.error(e); process.exit(1); });
