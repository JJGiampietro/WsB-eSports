// Public presentation metadata only. Never copy emails, account links or grants.
import { db } from './firebase-client.js';
import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const roles = new Set(['member', 'creator', 'management', 'owner', 'admin']);
export function writePublicMembership(writer, memberId, role) {
  if (!roles.has(role)) throw new Error('Invalid membership role.');
  writer.set(doc(db, 'memberMemberships', memberId), { role, updatedAt: serverTimestamp() });
}
// Backfill existing assignments (including pre-release changes) on admin load.
// Re-read private membership inside each transaction to avoid stale overwrites.
export async function syncPublicMemberships(records) {
  const snapshot = await getDocs(collection(db, 'memberMemberships'));
  const published = new Map(snapshot.docs.map(entry => [entry.id, entry.data().role]));
  for (const [id, access] of records) {
    if (!roles.has(access.role) || published.get(id) === access.role) continue;
    await runTransaction(db, async transaction => {
      const [current, publicRole] = await Promise.all([
        transaction.get(doc(db, 'memberAccess', id)), transaction.get(doc(db, 'memberMemberships', id))
      ]);
      const role = current.data()?.role;
      if (roles.has(role) && publicRole.data()?.role !== role) writePublicMembership(transaction, id, role);
    });
  }
}
