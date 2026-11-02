// Browser contract: main-series filters include subseries and intersect sizes/sale status.
const { chromium } = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'images/khech-gallery/works.json')));
(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}, colorScheme:'light', reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('127.0.0.1') && response.status() >= 400) errors.push(response.url()); });
    await page.goto('http://127.0.0.1:4175/gallery/');
    await page.waitForSelector('.artwork');
    const ids = () => page.locator('.artwork').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.workId))].sort());
    const series = value => page.locator(`[data-series="${value}"]`);
    assert.equal(await series('Streets').count(), 1, 'A Streets filter must exist');
    for (const viewport of [{width:1440,height:900}, {width:390,height:844}, {width:320,height:568}, {width:844,height:390}]) {
      await page.setViewportSize(viewport);
      await page.locator('#menu-filters').click();
      const assertIds = async predicate => assert.deepEqual(await ids(), catalog.filter(predicate).map(w => w.id).sort());
      await assertIds(() => true);
      await series('Streets').click();
      await assertIds(w => w.series === 'Streets');
      assert.equal((await ids()).length, 23);
      for (const size of ['M','L']) await page.locator(`[data-filter="${size}"]`).click();
      await assertIds(w => w.series === 'Streets' && w.sizeCategory === 'S');
      assert.equal((await ids()).length, 7, 'Streets includes all seven Mini paintings');
      await page.locator('[data-filter="available"]').click();
      assert.deepEqual(await ids(), ['STR-M-BEG-26-01']);
      await series('Abstract Tbilisi').click();
      assert.deepEqual(await ids(), [], 'Empty intersection remains usable');
      for (const size of ['M','L']) await page.locator(`[data-filter="${size}"]`).click();
      await assertIds(w => w.series === 'Abstract Tbilisi' && !w.sold && w.price);
      await page.locator('[data-filter="available"]').click();
      await series('Abstract Begining').click();
      await assertIds(w => w.series === 'Abstract Begining');
      const options = await page.locator('#filter-options').boundingBox();
      assert.ok(options.x >= 0 && options.y >= 0 && options.x + options.width <= viewport.width && options.y + options.height <= viewport.height, 'Filters fit the viewport');
      await series('all').click();
      await assertIds(() => true);
      await page.locator('#menu-filters').click();
      // Focus scrolls the actual ribbon to this work, then Enter opens its information.
      const work = page.locator('.artwork[data-work-id="STR-M-TBS-26-01"]').nth(2);
      await work.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('#viewer[open]');
      assert.equal(await page.locator('#viewer-title').textContent(), 'Saturday');
      assert.equal(await page.locator('#viewer-series').textContent(), 'Streets');
      const meta = await page.locator('#viewer-meta p').allTextContents();
      assert.ok(meta.includes('2026 · Tbilisi'));
      const layout = await page.evaluate(() => {
        const title = document.querySelector('#viewer-title').getBoundingClientRect();
        const series = document.querySelector('#viewer-series');
        const row = document.querySelector('#viewer-meta p');
        const s = series.getBoundingClientRect();
        const image = document.querySelector('#viewer-image').getBoundingClientRect();
        const info = document.querySelector('#viewer-info').getBoundingClientRect();
        return {gap:s.top-title.bottom, font:getComputedStyle(series).fontSize, metaFont:getComputedStyle(row).fontSize,
          weight:getComputedStyle(series).fontWeight,
          contained: [s, image, info].every(r => r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1)};
      });
      assert.ok(layout.gap >= 10, 'Series has space below the title');
      assert.equal(layout.font, layout.metaFont);
      assert.equal(layout.weight, '400');
      assert.ok(layout.contained, 'Image and information fit the viewport');
      await page.screenshot({path:path.join(root, `99_Agent/khech-gallery/series-${viewport.width}x${viewport.height}.png`)});
      await page.keyboard.press('Escape');
      await page.waitForSelector('#viewer:not([open])', {state:'attached'});
    }
    for (const work of catalog) {
      for (const view of work.views) {
        for (const file of [view.preview, view.image]) assert.ok(fs.existsSync(path.join(root, file)), file);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: series/subseries, size/sale intersections, empty recovery, card typography and four viewport layouts; all exported assets exist.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
