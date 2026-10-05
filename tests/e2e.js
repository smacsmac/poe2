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

    await page.click('.tabs [data-go="ref"]');
    await page.screenshot({ path: `${OUT}/${scheme}-reference.png` });
    await ctx.close();
  }

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
  await p.screenshot({ path: `${OUT}/phone-plan.png`, fullPage: true });

  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('e2e passed. Screenshots in tests/shots/');
})().catch((e) => { console.error(e); process.exit(1); });
