const assert = require('node:assert/strict'), fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore');
const { preserveResult } = require('../../scripts/stats-resilience.cjs');
const { status } = require('../../sync-status.js');
const stats = { kd: 2, winrate: 20, wins: 10, kills: 100, matches: 50 };
const player = { id: 'member', displayName: 'Member', username: 'new-name', accountId: 'stable-id' };
const previous = { fetchedAt: '2026-09-29T10:00:00Z', players: { member: { ...stats, username: 'old-name' } } };
const failure = preserveResult(player, null, previous, '2026-09-30T10:00:00Z', 'Private stats');
assert.deepEqual(Object.fromEntries(Object.keys(stats).map(k => [k, failure.stats[k]])), stats);
assert.equal(failure.sync.state, 'stale'); assert.equal(failure.sync.lastSuccessAt, previous.fetchedAt);
assert.equal(preserveResult(player, null, null, '2026-09-30T10:00:00Z').stats, null);
assert.equal(preserveResult(player, { stats }, previous, '2026-09-30T10:00:00Z').sync.failures, 0);
assert.equal(preserveResult(player, { stats: { ...stats, wins: NaN } }, previous, '2026-09-30T10:00:00Z').sync.state, 'stale');
assert.equal(status({ fetchedAt: '2026-09-30T10:00:00Z', players: { member: stats } }, 'member', Date.parse('2026-09-30T14:00:00Z')).state, 'stale');
assert.equal(status({}, 'member').state, 'waiting');

(async () => {
  const cryptoModule = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('../../backup-crypto.js', 'utf8')).toString('base64'));
  const payload = { schemaVersion: 1, projectId: 'demo-wsb-bounties', createdAt: new Date().toISOString(), collections: {
    members: [{ id: 'member', data: { displayName: 'Member', bio: 'Backup bio', socials: {}, profileImage: 'data:image/png;base64,YQ==', updatedAt: { $timestamp: [1000, 123000] } } }],
    memberAccess: [{ id: 'member', data: { memberId: 'member', invitedEmail: 'member@wsb-test.invalid', ownerUid: 'member', role: 'member', status: 'active' } }],
    memberVisibility: [{ id: 'member', data: { hidden: true, updatedAt: { $timestamp: [1000, 0] } } }],
    bounties: [{ id: 'target', data: { targetName: 'Backup target', amount: 10, status: 'archived' } }],
    bountyClaims: [{ id: 'target_member', data: { ownerUid: 'member', bountyId: 'target', clipUrl: 'https://youtu.be/test', status: 'approved' } }],
    adminActivity: [{ id: 'history', data: { actorUid: 'root', action: 'claim-approved' } }],
    siteEvents: [{ id: 'saved-event', data: { title: 'Private event draft', status: 'draft', startsAt: { $timestamp: [1000, 0] } } }],
    siteAnnouncements: [{ id: 'saved-news', data: { title: 'Saved news', status: 'published', body: 'Announcement history.' } }],
    siteContentState: [{ id: 'settings', data: { eventsManaged: true, announcementsManaged: true } }]
  } };
  const password = 'A private recovery test passphrase!';
  const envelope = await cryptoModule.encryptBackup(payload, password);
  assert(!JSON.stringify(envelope).includes('member@wsb-test.invalid'));
  assert.deepEqual(await cryptoModule.decryptBackup(envelope, password, payload.projectId), payload);
  await assert.rejects(() => cryptoModule.decryptBackup(envelope, 'incorrect password long enough', payload.projectId));
  await assert.rejects(() => cryptoModule.decryptBackup(envelope, password, 'production-project'));
  const altered = { ...envelope, ciphertext: 'A' + envelope.ciphertext.slice(1) };
  await assert.rejects(() => cryptoModule.decryptBackup(altered, password, payload.projectId));
  const env = await initializeTestEnvironment({ projectId: 'demo-wsb-bounties', firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('../../firestore.rules', 'utf8') } });
  try {
    await env.clearFirestore();
    // Full recovery drill: privilege-disabled writes are permitted ONLY in this isolated demo emulator.
    const recovered = await cryptoModule.decryptBackup(envelope, password, payload.projectId);
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [name, documents] of Object.entries(recovered.collections)) for (const entry of documents) await setDoc(doc(db, name, entry.id), cryptoModule.decodeData(entry.data, Timestamp));
      for (const [name, documents] of Object.entries(payload.collections)) for (const entry of documents) assert.deepEqual(cryptoModule.encodeData((await getDoc(doc(db, name, entry.id))).data()), entry.data);
      await setDoc(doc(db, 'admins', 'root'), { enabled: true });
      await setDoc(doc(db, 'memberAccess', 'new-admin'), { ownerUid: null, invitedEmail: 'new@wsb-test.invalid', status: 'invited', role: 'admin' });
      await setDoc(doc(db, 'memberAccess', 'display-owner'), { ownerUid: 'display-owner', role: 'owner', status: 'active' });
    });
    const member = env.authenticatedContext('member', { email: 'member@wsb-test.invalid', email_verified: true }).firestore();
    const owner = env.authenticatedContext('display-owner', { email: 'owner@wsb-test.invalid', email_verified: true }).firestore();
    const invited = env.authenticatedContext('new', { email: 'new@wsb-test.invalid', email_verified: true }).firestore();
    const root = env.authenticatedContext('root', { email: 'root@wsb-test.invalid' }).firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(anonymous, 'memberVisibility')));
    for (const db of [anonymous, member, owner]) {
      await assertFails(setDoc(doc(db, 'memberVisibility', 'other'), { hidden: true, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, 'memberVisibility', 'member'), { hidden: false, updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(db, 'memberVisibility', 'member')));
    }
    await assertFails(setDoc(doc(root, 'memberVisibility', 'malformed'), { hidden: 'yes', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(root, 'memberVisibility', 'private-data'), { hidden: true, invitedEmail: 'private@example.com', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(root, 'memberVisibility', 'member'), { hidden: false, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(root, 'memberVisibility', 'other'), { hidden: true, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(root, 'memberVisibility', 'other')));
    await assertFails(setDoc(doc(member, 'admins', 'member'), { enabled: true, memberId: 'member' }));
    await assertFails(getDocs(collection(owner, 'memberAccess')));
    await assertFails(updateDoc(doc(member, 'memberAccess', 'member'), { role: 'admin' }));
    await assertFails(updateDoc(doc(owner, 'memberAccess', 'display-owner'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(member, 'members', 'member'), { displayName: 'Member', bio: 'Edited', socials: {}, profileImage: '', updatedAt: serverTimestamp() }));
    const batch = writeBatch(invited);
    batch.update(doc(invited, 'memberAccess', 'new-admin'), { ownerUid: 'new', status: 'active', claimedAt: serverTimestamp() });
    batch.set(doc(invited, 'admins', 'new'), { enabled: true, memberId: 'new-admin' });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(invited, 'memberAccess')));
    await assertFails(updateDoc(doc(invited, 'memberAccess', 'new-admin'), { role: 'member' }));
    await assertSucceeds(updateDoc(doc(root, 'memberAccess', 'new-admin'), { role: 'owner' }));
    await assertFails(getDocs(collection(invited, 'memberAccess')));
    await assertFails(setDoc(doc(member, 'adminActivity', 'spoof'), { actorUid: 'root', actorEmail: 'root@wsb-test.invalid', action: 'role-changed', targetType: 'memberAccess', targetId: 'member', detail: '', createdAt: serverTimestamp() }));
    await assertFails(getDocs(collection(member, 'adminActivity')));
    await assertSucceeds(setDoc(doc(root, 'adminActivity', 'event'), { actorUid: 'root', actorEmail: 'root@wsb-test.invalid', action: 'member-edited', targetType: 'memberAccess', targetId: 'member', detail: '', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(root, 'adminActivity', 'event'), { detail: 'rewritten' }));
    await assertSucceeds(setDoc(doc(root, 'notifications', 'private-note'), { ownerUid: 'member', type: 'claim-approved', targetId: 'target_member', message: 'Approved', read: false, createdAt: serverTimestamp() }));
    await assertFails(getDoc(doc(owner, 'notifications', 'private-note')));
    await assertSucceeds(updateDoc(doc(member, 'notifications', 'private-note'), { read: true }));
    await assertFails(updateDoc(doc(member, 'notifications', 'private-note'), { message: 'Fake approval' }));
    await assertFails(setDoc(doc(member, 'bountyRewards', 'target_member'), { ownerUid: 'member', claimId: 'target_member', status: 'delivered', note: '', updatedAt: serverTimestamp(), updatedBy: 'member' }));
    await assertSucceeds(setDoc(doc(root, 'bountyRewards', 'target_member'), { ownerUid: 'member', claimId: 'target_member', status: 'delivered', note: 'Sent', updatedAt: serverTimestamp(), updatedBy: 'root' }));
    // Claiming an invitation requires both the exact email and verified ownership.
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'memberAccess', 'unclaimed'), { ownerUid: null, invitedEmail: 'right@wsb-test.invalid', status: 'invited', role: 'member' });
      await setDoc(doc(db, 'bounties', 'expired'), { targetName: 'Expired target', amount: 10, mode: 'Reload', instructions: 'Show the elimination', image: 'wsb-logo.png', status: 'open', winningClaimId: '', createdBy: 'root', createdAt: Timestamp.now(), updatedAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() - 60000) });
      await setDoc(doc(db, 'bountyClaims', 'denied_member'), { ownerUid: 'member', status: 'denied' });
    });
    const unverified = env.authenticatedContext('unverified', { email: 'right@wsb-test.invalid', email_verified: false }).firestore();
    const wrongEmail = env.authenticatedContext('wrong', { email: 'wrong@wsb-test.invalid', email_verified: true }).firestore();
    await assertFails(getDocs(query(collection(unverified, 'memberAccess'), where('invitedEmail', '==', 'right@wsb-test.invalid'))));
    await assertFails(updateDoc(doc(unverified, 'memberAccess', 'unclaimed'), { ownerUid: 'unverified', status: 'active', claimedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(wrongEmail, 'memberAccess', 'unclaimed'), { ownerUid: 'wrong', status: 'active', claimedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(member, 'bountyClaims', 'expired_member'), { bountyId: 'expired', ownerUid: 'member', memberId: 'member', claimantName: 'Member', targetName: 'Expired target', amount: 10, mode: 'Reload', clipUrl: 'https://youtu.be/test', notes: '', status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), reviewedAt: null, reviewerUid: '', reason: '' }));
    const dispute = { ownerUid: 'member', claimId: 'denied_member', message: 'Please review the visible player name.', status: 'open', resolution: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(owner, 'claimDisputes', 'denied_member'), dispute));
    await assertSucceeds(setDoc(doc(member, 'claimDisputes', 'denied_member'), dispute));
    await assertFails(getDoc(doc(owner, 'claimDisputes', 'denied_member')));
    await assertFails(updateDoc(doc(member, 'claimDisputes', 'denied_member'), { status: 'resolved', resolution: 'Self-approved', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(root, 'claimDisputes', 'denied_member'), { status: 'resolved', resolution: 'Reviewed by the team.', updatedAt: serverTimestamp() }));
    console.log('PASS: stats retention/recovery, per-player freshness, encrypted/tamper-resistant full restore drill including visibility, Admin-only hide/restore permissions, Admin privileges, demotion, immutable audit, private notifications, reward separation.');
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
