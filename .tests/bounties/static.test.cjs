const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.name.startsWith('.') || ['node_modules', 'templates', 'scripts'].includes(entry.name)) return [];
  const file = path.join(directory, entry.name); return entry.isDirectory() ? walk(file) : entry.name.endsWith('.html') ? [file] : [];
}); }
const pages = walk(root);
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  if (path.basename(file) === 'admin-members.html') continue;
  assert.equal((html.match(/id="navlinks"/g) || []).length, 1, file);
  assert.equal((html.match(/>MANAGEMENT<\/a>/g) || []).length, 1, file);
  assert.equal((html.match(/>BOUNTIES<\/a>/g) || []).length, 1, file);
  assert(!/>CREATORS<\/a>/.test(html), file);
  for (const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    const href = match[1].split(/[?#]/)[0]; if (/^(https?:|mailto:|tel:|data:|blob:)/.test(href) || !href) continue;
    let target = path.resolve(path.dirname(file), href); if (href.endsWith('/')) target = path.join(target, 'index.html');
    assert(fs.existsSync(target), 'Broken local asset/link: ' + file + ' -> ' + href);
  }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json')));
assert(config.hosting.ignore.includes('templates/**'));
assert(config.hosting.headers.some(rule => rule.headers.some(h => h.key === 'Content-Security-Policy-Report-Only')));
assert(!config.hosting.headers.some(rule => rule.headers.some(h => h.key === 'Content-Security-Policy')));
assert(fs.readFileSync(path.join(root, 'firebase-client.js'), 'utf8').includes('demo-wsb-local'));
const yaml = require('js-yaml');
for (const name of ['firebase-hosting-production', 'firebase-hourly-stats-sync', 'firebase-hosting-preview']) {
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/' + name + '.yml'), 'utf8'));
  const steps = Object.values(workflow.jobs)[0].steps;
  const verify = steps.findIndex(step => step.uses === './.github/actions/verify');
  const deploy = steps.findIndex(step => step.run?.includes('deploy-firebase-preview.mjs'));
  assert(verify >= 0 && verify < deploy, 'Publish path must run tests: ' + name);
}
console.log('PASS: ' + pages.length + ' shared navigation pages, local links/assets, emulator isolation, report-only protection, and all deployment test gates.');
