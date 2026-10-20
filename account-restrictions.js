// Server-enforced account blocks are private and independent of public visibility.
import { db } from './firebase-client.js';
import { doc, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { logActivity } from './admin-access.js';
const emailKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

// Call before any transaction writes: all restriction reads must be completed first.
export async function planAccountRestrictions(transaction, memberId, previous, next, actor) {
  const oldEmail = emailKey(previous?.invitedEmail), newEmail = emailKey(next.invitedEmail);
  if (next.status === 'inactive' && (!newEmail || newEmail.includes('/'))) throw new Error('A valid invited Gmail is required to deactivate account access.');
  if (next.status === 'inactive' && newEmail === emailKey(actor?.email)) throw new Error('You cannot deactivate your own account. Ask another admin to manage your access.');
  const keys = [...new Set([oldEmail, newEmail].filter(Boolean))];
  const entries = await Promise.all(keys.map(async email => {
    const ref = doc(db, 'accountRestrictions', email);
    return { email, ref, snapshot: await transaction.get(ref) };
  }));
  const current = entries.find(entry => entry.email === newEmail)?.snapshot.data();
  if (current && current.memberId !== memberId) throw new Error('This Gmail is restricted by another member profile. Resolve that account first.');
  return () => {
    for (const entry of entries) {
      if (entry.email === newEmail && next.status === 'inactive') {
        transaction.set(entry.ref, { memberId, blocked: true, updatedAt: serverTimestamp() });
      } else if (entry.snapshot.data()?.memberId === memberId) transaction.delete(entry.ref);
    }
  };
}

// Bring legacy Inactive records under the same enforcement when an admin loads
// the member editor. This never changes public visibility or a member's profile.
export async function enforceInactiveAccounts(records, actor) {
  if (!actor) return;
  for (const [memberId, access] of records) {
    const email = emailKey(access.invitedEmail);
    if (access.status !== 'inactive' || !email || email.includes('/') || email === emailKey(actor.email)) continue;
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'accountRestrictions', email);
      const [currentAccess, block] = await Promise.all([transaction.get(doc(db, 'memberAccess', memberId)), transaction.get(ref)]);
      if (currentAccess.data()?.status !== 'inactive' || emailKey(currentAccess.data()?.invitedEmail) !== email) return;
      if (block.data()?.blocked === true && block.data().memberId === memberId) return;
      if (block.exists() && block.data().memberId !== memberId) throw new Error('An inactive Gmail is linked to more than one profile. Check member access before continuing.');
      transaction.set(ref, { memberId, blocked: true, updatedAt: serverTimestamp() });
      logActivity(db, transaction, actor, 'inactive-access-enforced', 'memberAccess', memberId);
    });
  }
}
