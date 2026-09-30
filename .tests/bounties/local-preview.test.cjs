const { chromium } = require('playwright'), fs = require('node:fs'), assert = require('node:assert/strict');
process.chdir(__dirname);
(async () => {
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8000/admin.html'); await page.locator('[data-test-login="admin"]').click(); await page.locator('#adminDashboard').waitFor({ state: 'visible' }); await page.locator('.admin-metric').first().waitFor();
    fs.mkdirSync('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/local-admin.png', fullPage: true });
    await page.locator('[data-admin-view="members"]').click(); await page.locator('#adminMemberPicker').selectOption('barrelroll'); await page.screenshot({ path: 'artifacts/local-members-editor.png', fullPage: true });
    for (const route of ['index.html', 'management.html', 'members.html', 'stats.html', 'leaderboards.html', 'events.html', 'announcements.html', 'questions.html', 'privacy.html', 'stats/lizzie/', 'stats/bri/', 'bounties.html', 'member-account.html']) {
      await page.goto('http://localhost:8000/' + route); await page.waitForTimeout(400);
      for (const width of [1440, 1040, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Overflow: ' + route + ' at ' + width); }
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('http://localhost:8000/index.html'); await page.locator('#homeCurrentActivity a').first().waitFor(); await page.locator('.current-activity').screenshot({ path: 'artifacts/local-home-activity.png' });
    assert.deepEqual(errors, []); console.log('PASS: real isolated local SDK, seeded Admin login, management controls, 13 pages at desktop/tablet/mobile, home activity, and no browser runtime errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
