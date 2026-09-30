// This tool can only address the loopback demo project. It has no production credentials.
const fs = require('node:fs'), path = require('node:path');
const { initializeTestEnvironment } = require('../.tests/bounties/node_modules/@firebase/rules-unit-testing');
const { doc, setDoc, Timestamp } = require('../.tests/bounties/node_modules/firebase/firestore');
const projectId = 'demo-wsb-local';
async function account(role) {
  const email = role + '@wsb-test.invalid', password = 'Local-test-only-123!';
  const endpoint = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:';
  const post = async (action, body, admin = false) => {
    const response = await fetch(endpoint + action + '?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body) });
    return { ok: response.ok, data: await response.json() };
  };
  let result = await post('signUp', { email, password, returnSecureToken: true });
  if (!result.ok) result = await post('signInWithPassword', { email, password, returnSecureToken: true });
  if (!result.ok) throw new Error('Local Auth emulator is unavailable. No live data was contacted.');
  const uid = result.data.localId;
  const verified = await post('update', { localId: uid, emailVerified: true }, true);
  if (!verified.ok) throw new Error('Could not verify local test email: ' + JSON.stringify(verified.data));
  return { uid, email };
}
(async () => {
  const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8186, rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') } });
  try {
    const users = {};
    for (const role of ['admin', 'member', 'owner', 'invited']) users[role] = await account(role);
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), now = Timestamp.now();
      for (const [role, user] of Object.entries(users)) {
        const id = role === 'member' ? 'barrelroll' : 'test-' + role;
        await setDoc(doc(db, 'members', id), { displayName: 'LOCAL ' + role.toUpperCase(), bio: 'Local test profile. No real member data is changed.', socials: { tiktok: '', twitch: '' }, profileImage: '', createdAt: now, updatedAt: now });
        await setDoc(doc(db, 'memberAccess', id), { memberId: id, displayName: 'LOCAL ' + role.toUpperCase(), fortniteUsername: 'LocalTest_' + role, invitedEmail: user.email, ownerUid: role === 'invited' ? null : user.uid, role: role === 'admin' ? 'admin' : role === 'owner' ? 'owner' : 'member', status: role === 'invited' ? 'invited' : 'active', rosterStatus: 'active', createdAt: now, updatedAt: now, claimedAt: role === 'invited' ? null : now });
        if (role === 'admin') await setDoc(doc(db, 'admins', user.uid), { enabled: true, memberId: id });
      }
      await setDoc(doc(db, 'bounties', 'local-demo'), { targetName: 'LOCAL DEMO TARGET', amount: 10, mode: 'Reload', instructions: 'Test only. Show both names and the elimination.', image: 'wsb-logo.png', status: 'open', winningClaimId: '', createdBy: users.admin.uid, createdAt: now, updatedAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000), eligibility: 'Active test members. No staged eliminations.', disputePolicy: 'Use Request a review for denied claims.' });
    });
    console.log('Seeded local Admin, Member, Owner (display role only), and Invited member test accounts. No production writes.');
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
