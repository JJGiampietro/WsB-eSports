const assert = require('node:assert/strict'), fs = require('node:fs');
process.chdir(__dirname);
const { chromium } = require('playwright');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
let env, browser; const credentials = {}, errors = [];
const base = () => ({ title: 'Test content', label: 'WsB', body: 'Public details', status: 'draft', order: 0, link: '', linkLabel: '', revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const event = () => ({ ...base(), startsAt: Timestamp.fromMillis(Date.now() + 86400000), endsAt: null, eventState: 'upcoming', result: '', participants: '', mode: 'Reload', reward: '$10' });
const announcement = () => ({ ...base(), publishedAt: Timestamp.now(), countdownAt: null, featured: false });
async function createUser(role) {
  const email = 'content-' + role + '@wsb-test.invalid', password = 'Local-test-only-123!';
  const endpoint = 'http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:';
  const request = async (action, body, admin = false) => { const response = await fetch(endpoint + action + '?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw Error(JSON.stringify(data)); return data; };
  const user = await request('signUp', { email, password, returnSecureToken: true }); await request('update', { localId: user.localId, emailVerified: true }, true); credentials[role] = { email, password, uid: user.localId };
}
async function pageFor(role, route = 'admin.html') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(), sdk = 'https://www.gstatic.com/firebasejs/12.19.0/';
  await page.route('**/firebase-client.js', intercept => intercept.fulfill({ contentType: 'text/javascript', body: `
    import {initializeApp} from '${sdk}firebase-app.js';
    import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,GoogleAuthProvider} from '${sdk}firebase-auth.js';
    import {getFirestore,connectFirestoreEmulator} from '${sdk}firebase-firestore.js';
    export const app=initializeApp({apiKey:'demo-key',projectId:'demo-wsb-bounties',authDomain:'localhost'}),auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider(),localTest=true;
    connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8185); export const authReady=Promise.resolve();
    ${role ? `await signInWithEmailAndPassword(auth,${JSON.stringify(credentials[role].email)},${JSON.stringify(credentials[role].password)});` : ''}
  ` }));
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.goto('http://localhost:8000/' + route); return page;
}
(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wsb-bounties', firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('../../firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'admins', 'content-root'), { enabled: true }));
  const admin = env.authenticatedContext('content-root').firestore(), member = env.authenticatedContext('content-member').firestore(), anon = env.unauthenticatedContext().firestore();
  for (const [name, data] of [['siteEvents', event()], ['siteAnnouncements', announcement()]]) {
    await assertFails(setDoc(doc(member, name, 'forbidden'), data)); await assertFails(setDoc(doc(anon, name, 'forbidden'), data));
    await assertSucceeds(setDoc(doc(admin, name, 'draft'), data)); await assertFails(getDoc(doc(anon, name, 'draft'))); await assertFails(getDoc(doc(member, name, 'draft')));
    await assertFails(setDoc(doc(admin, name, 'javascript'), { ...data, link: 'javascript:alert(1)' }));
    await assertFails(setDoc(doc(admin, name, 'private-id'), { ...data, createdBy: 'content-root' }));
    await assertFails(updateDoc(doc(admin, name, 'draft'), { title: 'Overwrite without a revision', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(admin, name, 'draft'), { status: 'published', revision: 2, updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(anon, name, 'draft'))); await assertSucceeds(getDocs(query(collection(anon, name), where('status', '==', 'published'))));
    await assertFails(getDocs(collection(anon, name))); await assertFails(updateDoc(doc(member, name, 'draft'), { title: 'Not allowed', revision: 3, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(admin, name, 'draft')));
    await assertSucceeds(updateDoc(doc(admin, name, 'draft'), { status: 'archived', revision: 3, updatedAt: serverTimestamp() })); await assertFails(getDoc(doc(anon, name, 'draft')));
  }
  await assertFails(setDoc(doc(admin, 'siteEvents', 'dates'), { ...event(), endsAt: Timestamp.fromMillis(Date.now() - 86400000) }));
  await assertFails(setDoc(doc(admin, 'siteAnnouncements', 'invalid'), { ...announcement(), featured: 'yes' }));
  await assertFails(setDoc(doc(member, 'siteContentState', 'settings'), { eventsManaged: true, announcementsManaged: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(admin, 'siteContentState', 'settings'), { eventsManaged: true, announcementsManaged: true, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(admin, 'siteContentState', 'settings'), { eventsManaged: false, updatedAt: serverTimestamp() }));
  console.log('PASS: Admin-only content mutations, private drafts/archives, public published-only queries, safe links, schemas/dates, immutable creator time, revision guards, and irreversible safe content migration.');
  await env.clearFirestore();
  for (const role of ['admin', 'member', 'owner']) await createUser(role);
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(); await setDoc(doc(db, 'admins', credentials.admin.uid), { enabled: true });
    await setDoc(doc(db, 'memberAccess', 'display-owner'), { ownerUid: credentials.owner.uid, status: 'active', role: 'owner', invitedEmail: credentials.owner.email });
  });
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const signedOut = await pageFor(); await signedOut.locator('#adminSignedOut').waitFor(); assert.equal(await signedOut.locator('#eventsForm').isVisible(), false);
  const owner = await pageFor('owner'); await owner.locator('#adminDenied').waitFor(); assert.equal(await owner.locator('#announcementsForm').isVisible(), false);
  const editor = await pageFor('admin'); await editor.locator('#adminDashboard').waitFor(); await editor.locator('[data-admin-view="events"]').click();
  await editor.locator('#eventsPicker option[value="big-announcement"]').waitFor({ state: 'attached' }); await editor.locator('#eventsPicker').selectOption('big-announcement');
  assert.equal(await editor.locator('#eventsTitle').inputValue(), "Something's Coming.");
  await editor.locator('#eventsStatus').selectOption('draft'); await editor.locator('#eventsSave').click(); await editor.waitForFunction(() => document.getElementById('eventsSaveStatus').textContent.includes('Draft saved'));
  const publicEvents = await pageFor(null, 'events.html'); await publicEvents.locator('[data-content-id="wsb-xcx-scrimmage"]').waitFor(); assert.equal(await publicEvents.locator('[data-content-id="big-announcement"]').count(), 0);
  await editor.locator('#eventsNew').click(); await editor.locator('#eventsTitle').fill('Local live event'); await editor.locator('#eventsBody').fill('Join our test scrimmage.\n\n<img src=x onerror=alert(1)>');
  await editor.locator('#eventsStartsAt').fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16)); await editor.locator('#eventsMode').fill('4v4 Reload'); await editor.locator('#eventsReward').fill('$20'); await editor.locator('#eventsParticipants').fill('Lizzie\nBee'); await editor.locator('#eventsStatus').selectOption('published');
  await editor.locator('#eventsSave').click(); await editor.waitForFunction(() => document.getElementById('eventsSaveStatus').textContent.startsWith('Published'));
  await publicEvents.getByRole('heading', { name: 'Local live event', exact: true }).waitFor(); const eventId = await editor.locator('#eventsPicker').inputValue(), card = publicEvents.locator('[data-content-id="' + eventId + '"]');
  assert.equal(await card.locator('img').count(), 0); assert.match(await card.innerText(), /<img src=x onerror=alert\(1\)>/); await card.locator('summary').click(); assert.match(await card.innerText(), /Lizzie/);
  await publicEvents.waitForFunction(() => document.querySelector('[data-content-id] .cd-num')?.textContent !== '--');
  // A second editor must not silently replace a newer revision.
  const second = await pageFor('admin'); await second.locator('#adminDashboard').waitFor(); await second.locator('[data-admin-view="events"]').click(); await second.locator('#eventsPicker').selectOption(eventId); await second.locator('#eventsTitle').fill('Concurrent stale edit');
  await editor.locator('#eventsTitle').fill('Updated local event'); await editor.locator('#eventsSave').click(); await publicEvents.getByRole('heading', { name: 'Updated local event', exact: true }).waitFor();
  await second.locator('#eventsSave').click(); await second.waitForFunction(() => document.getElementById('eventsSaveStatus').textContent.includes('Another admin changed')); await second.locator('#eventsCancel').click(); assert.equal(await second.locator('#eventsTitle').inputValue(), 'Updated local event');
  await editor.locator('#eventsEventState').selectOption('ended'); await editor.locator('#eventsResult').fill('WsB won the test event'); await editor.locator('#eventsSave').click(); await publicEvents.getByText('WsB won the test event', { exact: true }).waitFor(); assert.equal(await card.locator('.event-countdown').count(), 0);
  await editor.locator('[data-admin-view="announcements"]').click(); await editor.locator('#announcementsTitle').fill('Local team announcement'); await editor.locator('#announcementsBody').fill('A published update for everyone.\n\nFurther details are here.'); await editor.locator('#announcementsFeatured').check(); await editor.locator('#announcementsPublishedAt').fill(new Date().toISOString().slice(0,16));
  await editor.locator('#announcementsSave').click(); await editor.waitForFunction(() => document.getElementById('announcementsSaveStatus').textContent.includes('Draft saved'));
  const news = await pageFor(null, 'announcements.html'); await news.locator('#annFeed [data-content-id="update-1-8"]').waitFor(); assert.equal(await news.getByRole('heading', { name: 'Local team announcement', exact: true }).count(), 0);
  await editor.locator('#announcementsStatus').selectOption('published'); await editor.locator('#announcementsSave').click(); await news.getByRole('heading', { name: 'Local team announcement', exact: true }).waitFor(); assert.equal(await news.locator('#annFeed h3').first().textContent(), 'Local team announcement');
  await news.locator('.cms-announcement').first().locator('summary').click(); await news.getByText('Further details are here.', { exact: true }).waitFor();
  const home = await pageFor(null, 'index.html'); await home.locator('#homeCurrentActivity h3').filter({ hasText: 'Local team announcement' }).waitFor();
  await editor.locator('#announcementsStatus').selectOption('archived'); await editor.locator('#announcementsSave').click(); await news.getByRole('heading', { name: 'Local team announcement', exact: true }).waitFor({ state: 'hidden' });
  for (const page of [editor, news, publicEvents]) for (const width of [1440, 1040, 390]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Content page overflow at ' + width); }
  await editor.setViewportSize({ width: 1440, height: 1000 }); fs.mkdirSync('artifacts', { recursive: true }); await editor.screenshot({ path: 'artifacts/content-admin.png', fullPage: true }); await news.screenshot({ path: 'artifacts/content-public.png', fullPage: true });
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'admins', credentials.admin.uid))); await editor.locator('#adminDashboard').waitFor({ state: 'hidden' }); assert.equal(await editor.locator('#announcementsPreview').textContent(), ''); assert.equal(await editor.locator('#eventsPicker option').count(), 0);
  assert.deepEqual(errors, []); console.log('PASS: existing-content migration, admin-only editors, live public publishing, private drafts, safe text, countdowns/participants/results, concurrent editing protection, announcement pin/archive/home activity, responsive pages and live revocation.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (env) await env.cleanup(); });
