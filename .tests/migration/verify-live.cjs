const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('../bounties/node_modules/playwright');
async function get(url) {
  const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'verify=' + Date.now(), {
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  return response;
}
(async () => {
  const origin = 'https://wsb-esports.web.app';
  const manifest = await (await get(origin + '/deployment.json')).json();
  const commit = execFileSync('gh', ['api', 'repos/adetrick7/WsB-eSports/commits/main', '--jq', '.sha'], { encoding: 'utf8' }).trim();
  assert.equal(manifest.sourceCommit, commit);
  const current = await (await get(origin + '/data/latest.json')).json();
  const canonical = await (await get('https://adetrick7.github.io/WsB-eSports/data/latest.json')).json();
  assert.equal(manifest.statsFetchedAt, current.fetchedAt);
  assert.deepEqual(current, canonical, 'Both hosts must serve the same player statistics');
  const pages = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(name => name.endsWith('.html'));
  for (let offset = 0; offset < pages.length; offset += 5) {
    await Promise.all(pages.slice(offset, offset + 5).map(async name => {
      const response = await get(origin + '/' + name);
      assert.equal(response.status, 200, name);
      assert((await response.text()).includes('Preserve old GitHub Pages links'), name);
    }));
  }
  for (const target of ['/', '/events/reload-custom-solo/', '/stats/lizzie/', '/member-account.html', '/admin-members.html']) {
    const response = await get(origin + target);
    assert.equal(response.status, 200, target);
    assert(response.headers.get('cache-control').includes('no-cache'), target + ' cache policy');
  }
  for (const privatePath of ['/scripts/fetch-weekly-stats.js', '/firebase.json', '/firestore.rules', '/.tests/migration/configure-trust.cjs']) {
    assert.equal((await get(origin + privatePath)).status, 404, privatePath);
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const suffix of ['', 'stats/lizzie/?from=old#profile', 'stats/bri/', 'bounties.html', 'member-account.html']) {
      await page.goto('https://adetrick7.github.io/WsB-eSports/' + suffix, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(origin + '/' + suffix, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      assert.equal(page.url(), origin + '/' + suffix);
    }
    await page.goto(origin + '/stats/lizzie/', { waitUntil: 'domcontentloaded' });
    const account = page.locator('a[href$="member-account.html"]').first();
    await account.click();
    await page.waitForURL(origin + '/member-account.html');
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
  console.log(JSON.stringify({ result: 'PASS', canonicalCommit: commit, statsFetchedAt: current.fetchedAt, livePages: pages.length, checks: 'same stats on both hosts; cache policies; private file exclusions; real GitHub forwarding; nested account navigation; no runtime errors' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
