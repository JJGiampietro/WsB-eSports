const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const yaml = require('../bounties/node_modules/js-yaml');
const { chromium } = require('../bounties/node_modules/playwright');
const root = process.cwd();
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split(/\r?\n/);
const pages = tracked.filter(name => name.endsWith('.html'));
const payload = JSON.parse(execFileSync(process.execPath, ['.github/scripts/deploy-firebase-preview.mjs', '--dry-run'], { encoding: 'utf8' }));
assert(payload.files.includes('/deployment.json'));
assert(payload.config.headers.some(rule => rule.glob === '/' && rule.headers['Cache-Control'] === 'no-cache'));
assert(!payload.files.some(name => /(?:^\/scripts\/|\/\.|gha-creds-|\.md$|firestore.rules|firebase.json)/.test(name)));
for (const name of pages) {
  assert(payload.files.includes('/' + name), `Missing deployed page: ${name}`);
  const html = fs.readFileSync(name, 'utf8');
  const block = html.match(/<script>\s*\/\/ Preserve old GitHub Pages links[\s\S]*?<\/script>/)?.[0];
  assert(block, `Missing old-link redirect: ${name}`);
  const code = block.replace(/^<script>|<\/script>$/g, '');
  for (const hostname of ['adetrick7.github.io', 'wsb-esports.web.app', 'wsb-esports.firebaseapp.com', 'localhost', 'other.github.io']) {
    let destination;
    const pathname = hostname === 'adetrick7.github.io' ? '/WsB-eSports/' + name : '/' + name;
    const location = { hostname, pathname, search: '?from=old%20link', hash: '#details', replace: value => { destination = value; } };
    vm.runInNewContext(code, { location });
    assert.equal(destination, hostname === 'adetrick7.github.io' ? `https://wsb-esports.web.app/${name}?from=old%20link#details` : undefined);
  }
}
const production = yaml.load(fs.readFileSync('.github/workflows/firebase-hosting-production.yml', 'utf8'));
const recovery = yaml.load(fs.readFileSync('.github/workflows/firebase-hourly-stats-sync.yml', 'utf8'));
assert.equal(production.concurrency.group, recovery.concurrency.group);
assert.deepEqual(production.on.workflow_run.workflows, ['Fortnite Stats Refresh']);
for (const name of ['firebase-hosting-production', 'firebase-hourly-stats-sync', 'firebase-hosting-preview', 'weekly-stats']) {
  const workflow = yaml.load(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
  const job = Object.values(workflow.jobs)[0];
  assert(job.if.includes("github.repository == 'adetrick7/WsB-eSports'"));
  assert.equal(job.steps[0].with.ref, 'main');
}
assert(fs.readFileSync('firebase-admin.js', 'utf8').includes('const profileUrl = "https://wsb-esports.web.app/member-account.html"'));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.route('https://adetrick7.github.io/WsB-eSports/**', route => {
      const requested = new URL(route.request().url()).pathname.replace('/WsB-eSports/', '') || 'index.html';
      const local = path.join(root, requested.endsWith('/') ? requested + 'index.html' : requested);
      return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(local, 'utf8') });
    });
    await context.route('https://wsb-esports.web.app/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Firebase destination</body></html>' }));
    for (const suffix of ['', 'stats/lizzie/?source=discord#bio', 'stats/bri/', 'member-account.html', 'events/reload-custom-solo/']) {
      await page.goto('https://adetrick7.github.io/WsB-eSports/' + suffix);
      await page.waitForURL('https://wsb-esports.web.app/' + suffix);
      assert.equal(page.url(), 'https://wsb-esports.web.app/' + suffix);
    }
    await context.close();
    const localContext = await browser.newContext();
    const localPage = await localContext.newPage();
    const runtimeErrors = [];
    localPage.on('pageerror', error => runtimeErrors.push(error.message));
    for (const suffix of ['index.html', 'members.html', 'management.html', 'leaderboards.html', 'bounties.html', 'admin-members.html', 'member-account.html', 'stats/lizzie/', 'stats/bri/', 'events.html']) {
      const response = await localPage.goto('http://localhost:8000/' + suffix, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, suffix);
      await localPage.waitForTimeout(700);
      assert(localPage.url().startsWith('http://localhost:8000/'), 'Local site must not redirect');
      if (suffix.startsWith('stats/')) {
        const account = await localPage.locator('a[href$="member-account.html"]').first().getAttribute('href');
        assert.equal(new URL(account, localPage.url()).pathname, '/member-account.html');
        const management = await localPage.getByRole('link', { name: /^management$/i }).first().getAttribute('href');
        assert.equal(new URL(management, localPage.url()).pathname, '/management.html');
      }
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(`PASS: ${pages.length} redirects, deploy assets/config, canonical workflow guards, 5 browser redirects, 10 local pages and nested navigation.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
