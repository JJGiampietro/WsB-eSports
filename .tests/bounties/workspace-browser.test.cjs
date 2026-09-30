const assert = require('node:assert/strict'), fs = require('node:fs');
process.chdir(__dirname);
const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, Timestamp, deleteDoc } = require('firebase/firestore');
let env, browser; const credentials = {}, errors = [];
async function createUser(role) {
  const email = 'workspace-' + role + '@wsb-test.invalid', password = 'Local-test-only-123!';
  const endpoint = 'http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:';
  const request = async (action, data, admin = false) => { const response = await fetch(endpoint + action + '?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw Error(JSON.stringify(result)); return result; };
  const user = await request('signUp', { email, password, returnSecureToken: true });
  await request('update', { localId: user.localId, emailVerified: true }, true);
  credentials[role] = { email, password, uid: user.localId };
}
async function pageFor(role, route = 'admin.html') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(); const sdk = 'https://www.gstatic.com/firebasejs/12.19.0/';
  await page.route('**/firebase-client.js', intercept => intercept.fulfill({ contentType: 'text/javascript', body: `
    import {initializeApp,getApps} from '${sdk}firebase-app.js';
    import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,GoogleAuthProvider} from '${sdk}firebase-auth.js';
    import {getFirestore,connectFirestoreEmulator} from '${sdk}firebase-firestore.js';
    export const app=initializeApp({apiKey:'demo-key',projectId:'demo-wsb-bounties',authDomain:'localhost'});
    export const auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider(),localTest=true;
    connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8185);
    export const authReady=Promise.resolve();
    ${role ? `await signInWithEmailAndPassword(auth,${JSON.stringify(credentials[role].email)},${JSON.stringify(credentials[role].password)});` : ''}
  ` }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://localhost:8000/' + route);
  return page;
}
(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wsb-bounties', firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('../../firestore.rules', 'utf8') } });
  await env.clearFirestore();
  for (const role of ['admin', 'member', 'owner', 'invited']) await createUser(role);
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), now = Timestamp.now();
    await setDoc(doc(db, 'admins', credentials.admin.uid), { enabled: true });
    for (const [role, id] of [['member', 'barrelroll'], ['owner', 'bri']]) {
      await setDoc(doc(db, 'members', id), { displayName: 'TEST ' + role, bio: 'Test bio', socials: { tiktok: '', twitch: '' }, profileImage: '', createdAt: now, updatedAt: now });
      await setDoc(doc(db, 'memberAccess', id), { memberId: id, displayName: 'TEST ' + role, fortniteUsername: 'Test_' + role, invitedEmail: credentials[role].email, ownerUid: credentials[role].uid, role: role === 'owner' ? 'owner' : 'member', status: 'active', rosterStatus: 'active', createdAt: now, updatedAt: now, claimedAt: now });
    }
  });
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  const anon = await pageFor(); await anon.locator('#adminSignedOut').waitFor({ state: 'visible' }); assert.equal(await anon.locator('#adminDashboard').isVisible(), false);
  const owner = await pageFor('owner'); await owner.locator('#adminDenied').waitFor({ state: 'visible' }); assert.equal(await owner.locator('#adminMemberForm').isVisible(), false);
  const admin = await pageFor('admin'); await admin.locator('#adminDashboard').waitFor({ state: 'visible' }); await admin.locator('.admin-metric').first().waitFor();
  assert.equal(await admin.locator('#adminAuthPanel').isVisible(), false);
  assert.equal(await admin.locator('[data-admin-view]').count(), 9);
  await admin.locator('[data-admin-view="members"]').click(); await admin.locator('#adminMemberPicker').waitFor({ state: 'visible' });
  await admin.waitForFunction(() => !document.getElementById('adminMemberPicker').disabled);
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('#adminProfileBio').fill('Admin edited biography');
  admin.removeAllListeners('dialog'); admin.on('dialog', dialog => dialog.dismiss());
  await admin.locator('#adminMemberPicker').selectOption('bri');
  assert.equal(await admin.locator('#adminMemberPicker').inputValue(), 'barrelroll');
  assert.equal(await admin.locator('#adminProfileBio').inputValue(), 'Admin edited biography');
  await admin.locator('#navlinks a').filter({ hasText: 'MANAGEMENT' }).click();
  assert.equal(new URL(admin.url()).pathname, '/admin.html');
  admin.removeAllListeners('dialog'); admin.on('dialog', dialog => dialog.accept());
  await admin.locator('#adminProfileTikTok').fill('https://www.tiktok.com/@test-member');
  await admin.locator('#adminProfileImageInput').setInputFiles('../../kato.png');
  await admin.locator('.image-crop-dialog').waitFor(); await admin.locator('.image-crop-dialog input[name="zoom"]').fill('1.5'); await admin.locator('[data-crop-use]').click();
  await admin.waitForFunction(() => document.getElementById('adminProfileImagePreview').style.backgroundImage.includes('data:image'));
  assert.match(await admin.locator('.public-profile-preview').innerText(), /Admin edited biography/);
  await admin.locator('#adminSave').click(); await admin.waitForFunction(() => document.getElementById('adminSaveStatus').textContent.includes('saved'));
  const member = await pageFor('member', 'member-account.html'); await member.locator('#memberProfileForm').waitFor({ state: 'visible' });
  assert.equal(await member.locator('#profileBio').inputValue(), 'Admin edited biography');
  await member.locator('#profileBio').fill('Member edited biography'); await member.locator('#profileSave').click(); await member.waitForFunction(() => document.getElementById('memberSaveStatus').textContent.includes('saved'));
  const detail = await pageFor('member', 'stats/barrelroll/'); await detail.locator('.profile-hero-bio').waitFor(); assert.match(await detail.locator('.profile-hero-bio').textContent(), /Member edited biography/);
  assert.equal(new URL(await detail.locator('.firebase-account-link').getAttribute('href'), detail.url()).pathname, '/member-account.html');
  // Create an Admin invitation; verified Google-equivalent test email can claim it securely.
  await admin.locator('#adminStartNew').click(); await admin.locator('#adminDisplayName').fill('TEST INVITED ADMIN'); await admin.locator('#adminFortniteUsername').fill('InvitedTestPlayer'); await admin.locator('#adminInviteEmail').fill(credentials.invited.email); await admin.locator('#adminRole').selectOption('admin'); await admin.locator('#adminSave').click();
  await admin.waitForFunction(() => document.getElementById('adminInviteActions').hidden === false);
  const invited = await pageFor('invited', 'member-account.html'); await invited.locator('#memberProfileForm').waitFor({ state: 'visible' });
  await env.withSecurityRulesDisabled(async context => { const grant = await getDoc(doc(context.firestore(),'admins',credentials.invited.uid)); assert(grant.exists()); });
  await invited.locator('#profileAdminLink').waitFor({ state: 'visible' });
  assert.equal(await invited.locator('#accountNotLinked').isVisible(), false);
  await invited.goto('http://localhost:8000/admin.html'); await invited.locator('#adminDashboard').waitFor({ state: 'visible' });
  // All bounty management and reviewing happen inside the same admin page.
  await admin.locator('[data-admin-view="bounties"]').click(); await admin.locator('#tab-manage').click(); await admin.locator('#addBounty').click(); await admin.locator('#editTarget').fill('Workspace Bounty'); await admin.locator('#editAmount').fill('10'); await admin.locator('#saveBounty').click(); await admin.locator('#editorDialog').waitFor({ state: 'hidden' });
  const board = await pageFor('member', 'bounties.html'); await board.locator('[data-target]').waitFor(); await board.locator('[data-target]').click(); await board.locator('#claimClipUrl').fill('https://youtu.be/workspace'); await board.locator('#claimConfirm').check(); await board.locator('#submitClaim').click(); await board.locator('#claimDialog').waitFor({ state: 'hidden' });
  await admin.locator('#tab-review').click(); await admin.locator('[data-decision="approved"]').click(); await board.locator('#claimList .approved').waitFor(); assert.match(await board.locator('#claimList').innerText(), /Awaiting delivery/);
  await admin.locator('[data-admin-view="rewards"]').click(); await admin.locator('[data-deliver]').click(); await board.waitForFunction(() => document.getElementById('claimList').textContent.includes('Delivered'));
  await board.locator('.site-inbox summary').click(); await board.getByText(/was marked delivered/).waitFor();
  await admin.locator('[data-admin-view="backups"]').click(); await admin.locator('#backupPassphrase').fill('Private browser recovery passphrase!'); const download = admin.waitForEvent('download'); await admin.locator('#backupExport').click(); const file = await download; const location = await file.path();
  assert(!fs.readFileSync(location, 'utf8').includes(credentials.member.email));
  await admin.locator('#backupFile').setInputFiles(location); await admin.locator('#backupInspect').click(); await admin.waitForFunction(() => document.getElementById('backupSummary').textContent.startsWith('Verified'));
  await admin.locator('#backupConfirm').check(); await admin.locator('#backupRestore').click(); await admin.waitForFunction(() => document.getElementById('backupStatus').textContent.includes('restored'));
  await admin.locator('[data-admin-view="overview"]').click();
  fs.mkdirSync('artifacts', { recursive: true }); await admin.screenshot({ path: 'artifacts/workspace-desktop.png', fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 }); assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await admin.screenshot({ path: 'artifacts/workspace-mobile.png', fullPage: true });
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'admins', credentials.admin.uid))); await admin.locator('#adminDashboard').waitFor({ state: 'hidden' }); assert.equal(await admin.locator('#adminRewards').textContent(), '');
  await require('./member-layout.cjs')(anon);
  assert.deepEqual(errors, []);
  console.log('PASS: signed-out/Owner/admin gating, single workspace, cropped profile preview and persistence, member editing and stats bio, secure Admin invite/claim, bounty approval, reward delivery, inbox, encrypted backup download/verification/local restore, responsive layout, live privilege revocation.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (env) await env.cleanup(); });
