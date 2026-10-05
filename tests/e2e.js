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
    await page.screenshot({ path: `${OUT}/${scheme}-design.png`, fullPage: true });

    // The header: full league names, and a Saved button that says where the craft is kept
    assert.deepEqual(await page.locator('.bar [data-lg]').allInnerTexts(), ['Forbidden Rites', 'Runes of Aldur']);
    await page.waitForSelector('#saved[data-state="local"]');
    await page.click('#saved');
    assert.match(await page.locator('#toast').innerText(), /The Blacksteel Gauntlets craft is saved in this browser/);

    // Astrid's Creativity opens a second crafted slot; untick it again for the rest of the walk-through
    await page.check('#d-astrid');
    assert.match(await page.locator('.slot2').first().innerText(), /crafted slots[\s\S]*1 free/i);
    await page.uncheck('#d-astrid');
    assert.doesNotMatch(await page.locator('.slot2').first().innerText(), /crafted slots/i);

    // Plan from an item in progress: life + mana, two junk suffixes
    await page.click('[data-act="to-plan"]');
    await page.click('[data-act="start-copy"]');
    for (const name of ['Runic Ward', 'Lightning Resistance', 'Cold Resistance', 'Critical Damage Bonus']) {
      await page.locator('.srow', { hasText: name }).first().locator('[data-act="have-del"]').click();
    }
    for (let k = 0; k < 2; k++) {
      await page.locator('.have.empty [data-act="have-add"][data-s="1"]').first().click();
      await page.click('.pk-junk');
    }
    await page.click('.forge [data-act="forge"]');
    assert.match(await page.locator('.card h3').textContent(), /Sovereign Alloy/);
    await page.click('.card [data-act="out"][data-i="0"]');
    assert.match(await page.locator('.card h3').textContent(), /Make room/);
    await page.screenshot({ path: `${OUT}/${scheme}-plan.png`, fullPage: true });

    // Hand edit makes the plan stale until Reforge
    await page.locator('.have:not(.empty) [data-act="have-del"]').last().click();
    assert.equal(await page.locator('.stale').count(), 1);
    await page.click('.stale [data-act="forge"]');
    assert.equal(await page.locator('.stale').count(), 0);
    await page.click('[data-act="undo"]');

    // The Plan screen is called Forge. Suggest fills in the magic base the plan starts from.
    assert.match(await page.locator('.tabs [data-go="plan"]').innerText(), /^Forge/);
    await page.click('[data-act="rarity"][data-v="magic"]');
    await page.click('[data-act="suggest"]');
    assert.match(await page.locator('#toast').innerText(), /Suggested a magic base with Maximum Life and any suffix/);
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
  await q.click('[data-act="start-copy"]');
  await q.locator('.srow', { hasText: 'Socketed Augment' }).locator('[data-act="have-del"]').click();
  await q.click('.forge [data-act="forge"]');
  assert.match(await q.locator('.card h3').textContent(), /Use Astrid’s Creativity for Effect of Socketed Augment Items/);
  await q.screenshot({ path: `${OUT}/dark-astrid.png`, fullPage: true });
  await q.click('.card [data-act="out"][data-i="0"]');
  assert.match(await q.locator('#toast').innerText(), /Astrid’s Creativity is on/);
  assert.equal(await q.locator('.st', { hasText: 'Socket Astrid’s Creativity' }).count(), 1, 'the plan sockets the rune');
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
  await p.click('[data-act="start-blank"]');
  await p.click('.forge [data-act="forge"]');
  const [sw, w] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= w, 'no sideways scroll on a phone');
  assert.ok(await p.locator('.league-row').isVisible(), 'league switch under the header on a phone');
  assert.equal(await p.locator('#saved').innerText(), 'Saved');
  await p.screenshot({ path: `${OUT}/phone-plan.png`, fullPage: true });
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
