// Duplicate names must never share images, stats, links, badges or visibility.
// Runs only against the separate automated-test emulator, never production or
// the interactive demo-wsb-local database.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, deleteDoc } = require('firebase/firestore');
process.chdir(__dirname);
let env, browser;
const ids = ['eliwtw-673abdc', 'wsbkays-goodboy-47ace64', 'wsbkays-goodboy-107e7ba'];
const icons = ['wsb-logo-128.webp', 'wsb-logo.webp'].map(file => 'data:image/webp;base64,' + fs.readFileSync('../../' + file).toString('base64'));
const profiles = new Map([
  [ids[0], { displayName: 'eliwtw', profileImage: icons[0] }],
  [ids[1], { displayName: 'Kays goodboy', profileImage: icons[1] }],
  [ids[2], { displayName: 'Kays original', profileImage: '' }],
  ['lizzie', { displayName: 'Static duplicate A', profileImage: icons[0] }],
  ['jen', { displayName: 'Static duplicate B', profileImage: icons[1] }]
]);
const roster = JSON.parse(fs.readFileSync('../../data/roster.json', 'utf8'));
for (const member of roster) if ([ids[0], ids[1], 'lizzie', 'jen'].includes(member.id)) member.username = 'eliwtw';
const now = new Date().toISOString();
const player = (id, kills) => ({ displayName: profiles.get(id).displayName, username: 'eliwtw', kd: 2, winrate: 10, wins: 10, kills, matches: 100, lastSuccessAt: now });
const latest = { fetchedAt: now, players: { lizzie: player('lizzie', 101), [ids[0]]: player(ids[0], 202), [ids[2]]: player(ids[2], 303) } };

(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wsb-bounties', firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('../../firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, profile] of profiles) await setDoc(doc(db, 'members', id), { ...profile, bio: 'Identity test for ' + id, socials: {} });
    await setDoc(doc(db, 'memberMemberships', ids[0]), { role: 'owner' });
    await setDoc(doc(db, 'memberMemberships', ids[1]), { role: 'management' });
    await setDoc(doc(db, 'memberMemberships', ids[2]), { role: 'developer' });
    await setDoc(doc(db, 'memberMemberships', 'lizzie'), { role: 'creator' });
    await setDoc(doc(db, 'memberMemberships', 'jen'), { role: 'hr' });
    await setDoc(doc(db, 'profileRoles', 'identity-hunter'), { name: 'Identity Hunter', tone: 'gold' });
    await setDoc(doc(db, 'memberRoles', ids[0]), { roleIds: ['identity-hunter'] });
  });
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const sdk = 'https://www.gstatic.com/firebasejs/12.19.0/';
  await page.route('**/firebase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import {initializeApp} from '${sdk}firebase-app.js';
    import {getAuth,connectAuthEmulator,GoogleAuthProvider} from '${sdk}firebase-auth.js';
    import {getFirestore,connectFirestoreEmulator} from '${sdk}firebase-firestore.js';
    import {getFirestore as getDirectFirestore,connectFirestoreEmulator as connectDirect} from '${sdk}firebase-firestore-lite.js';
    export const app=initializeApp({apiKey:'demo-key',projectId:'demo-wsb-bounties',authDomain:'localhost'});
    export const auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider(),localTest=true;
    export const restrictionDb=getDirectFirestore(app);connectDirect(restrictionDb,'127.0.0.1',8185);
    connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8185);
    export const authReady=Promise.resolve();
  ` }));
  for (const [file, value] of [['roster', roster], ['latest', latest], ['history', { snapshots: [] }]]) {
    await page.route('**/data/' + file + '.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) }));
  }
  const memberCard = id => page.locator('#membersGrid .member-card[data-member-id="' + id + '"]');
  async function openMembers() {
    await page.goto('http://localhost:8000/members.html');
    await memberCard(ids[0]).locator('[data-profile-role-badges]').waitFor({ state: 'visible' });
    for (const [id, profile] of profiles) {
      const card = memberCard(id); assert.equal(await card.count(), 1, 'Exactly one card per stable ID: ' + id);
      await page.waitForFunction(({ id, name }) => document.querySelector('#membersGrid [data-member-id="' + id + '"] .member-name')?.textContent === name, { id, name: profile.displayName });
      assert.equal(await card.getAttribute('data-public-member-id'), id);
      if (profile.profileImage) assert((await card.locator('.member-emblem').getAttribute('style')).includes(profile.profileImage), 'Correct image: ' + id);
    }
  }
  await openMembers();
  for (const [id, label] of [[ids[0], 'Owner'], [ids[1], 'Management'], [ids[2], 'Developer'], ['lizzie', 'Creator'], ['jen', 'HR'], ['dmo', 'Member'], ['ingraham', 'Developer']]) {
    await page.waitForFunction(({id,label})=>document.querySelector('#membersGrid [data-member-id="'+id+'"] .member-meta b')?.textContent===label,{id,label});
  }
  assert.equal(await page.locator('#membersGrid').evaluate(grid=>/Team-set|Unreal|MEMBER PROFILE/.test(grid.innerText)),false);
  assert.equal(await memberCard(ids[1]).locator('[data-profile-role-badges]').count(), 0, 'Badges cannot transfer by name');
  await page.waitForFunction(() => document.querySelector('[data-member-id="lizzie"] [data-stat="kills"]')?.textContent === '101');
  assert.equal(await page.locator('.member-sync-status, .member-card.sync-issue').count(), 0, 'Public member cards have no operational messages');
  assert.equal(await memberCard('jen').locator('[data-stat="kills"]').textContent(), '-', 'No other same-named player supplies stats');
  assert.equal(await memberCard('lizzie').locator('[data-stat="kills"]').textContent(), '101');
  await page.locator('#memberFilter').selectOption('synced');
  assert.equal(await memberCard(ids[0]).isVisible(), true);
  assert.equal(await memberCard(ids[1]).isVisible(), false, 'Sync filters use IDs, not the shared name');
  await page.locator('#memberFilter').selectOption('all');
  await page.locator('#memberSearch').fill(ids[1]);
  assert.equal(await memberCard(ids[1]).isVisible(), true);
  assert.equal(await memberCard(ids[0]).isVisible(), false);
  await page.locator('#memberSearch').fill('');
  // Membership changes are live, keyed by ID, and never confer admin access.
  const writeMembership = role => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'memberMemberships', ids[0]), {role}));
  for (const [role,label,inStaff] of [['member','Member',false],['creator','Creator',false],['management','Management',true],['owner','Owner',true],['hr','HR',true],['developer','Developer',true],['admin','Member',false]]) {
    await writeMembership(role);
    await page.waitForFunction(({id,label})=>document.querySelector('#membersGrid [data-member-id="'+id+'"] .member-meta b')?.textContent===label,{id:ids[0],label});
    await page.locator('#memberFilter').selectOption('management');
    assert.equal(await memberCard(ids[0]).isVisible(),inStaff,'Staff filter follows live membership: '+role);
    assert.equal(await memberCard(ids[1]).locator('.member-meta b').textContent(),'Management','Duplicate name cannot transfer memberships');
    assert.equal(await memberCard(ids[0]).locator('[data-profile-role-badges] .profile-role-badge').textContent(),'Identity Hunter');
    await page.locator('#memberFilter').selectOption('all');
  }
  await env.withSecurityRulesDisabled(context=>deleteDoc(doc(context.firestore(),'memberMemberships',ids[0])));
  await page.waitForFunction(id=>document.querySelector('#membersGrid [data-member-id="'+id+'"]')?.dataset.membershipRole==='member',ids[0]);
  await writeMembership('owner');
  await page.waitForFunction(id=>document.querySelector('#membersGrid [data-member-id="'+id+'"]')?.dataset.membershipRole==='owner',ids[0]);
  for (const id of [ids[0], ids[1], 'lizzie', 'jen']) {
    await memberCard(id).click();
    await page.waitForURL('**/stats/' + id + '/');
    await page.locator('.profile-hero-bio').waitFor();
    assert.equal(await page.locator('.profile-hero-card h1').textContent(), profiles.get(id).displayName);
    assert((await page.locator('.profile-avatar').getAttribute('style')).includes(profiles.get(id).profileImage));
    await openMembers();
  }
  // Live visibility updates may reload the page; only this ID should disappear.
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'memberVisibility', ids[1]), { hidden: true }));
  await memberCard(ids[1]).waitFor({ state: 'hidden' });
  await memberCard(ids[0]).waitFor({ state: 'visible' });
  assert.equal(await memberCard(ids[0]).getAttribute('data-public-member-id'), ids[0]);
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'memberVisibility', ids[1]), { hidden: false }));
  await openMembers();
  await page.goto('http://localhost:8000/stats.html');
  await page.locator('a.stats-player').first().waitFor();
  assert.equal(await page.locator('#statsDirectory .stats-sync-state, #statsDirectory .sync-detail, #statsDirectory .stats-issue-copy, #statsDirectory .stats-player-issue').count(), 0);
  for (const id of ids.slice(0, 2)) {
    await page.locator('#statsSearch').fill(id);
    const card = page.locator('a.stats-player[href="stats/' + id + '/"]');
    await page.waitForFunction(({ id, name }) => document.querySelector('a.stats-player[href="stats/' + id + '/"] h3')?.textContent === name, { id, name: profiles.get(id).displayName });
    assert((await card.locator('.stats-avatar').getAttribute('style')).includes(profiles.get(id).profileImage));
  }
  await page.goto('http://localhost:8000/leaderboards.html');
  for (const id of [ids[0], ids[2]]) {
    await page.locator('#lbLifetimeGrid a.lb-name[href="stats/' + id + '/"]').first().waitFor();
  }
  await page.goto('http://localhost:8000/management.html');
  for (const [id, group] of [[ids[0], 'owners'], [ids[1], 'management']]) {
    const card = page.locator('.management-grid-' + group + ' [data-public-member-id="' + id + '"]');
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.locator('.tier-name').textContent(), profiles.get(id).displayName);
    assert((await card.getAttribute('style')).includes(profiles.get(id).profileImage));
  }
  // Reordering duplicate names and changing a username cannot reassign a card.
  roster.reverse(); roster.find(member => member.id === ids[0]).username = 'RenamedEpicPlayer';
  await openMembers();
  assert.equal(await memberCard(ids[0]).getAttribute('data-fn-user'), 'RenamedEpicPlayer');
  assert.equal(await memberCard(ids[1]).getAttribute('data-fn-user'), 'eliwtw');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS: separate same-name identities; six live membership labels, safe Member defaults, no public Admin role, live staff filters, independent custom badges, clean cards, ID-based stats/management, Epic rename, mobile, and no browser errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (env) await env.cleanup(); });
