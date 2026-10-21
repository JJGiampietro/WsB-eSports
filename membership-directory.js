// Public presentation metadata only. Never copy emails, account links or grants.
import { db } from './firebase-client.js';
import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { membershipRoles, membershipRole, validAdminGrant } from './membership-model.js';
import { logActivity } from './admin-access.js';
const roles = new Set(membershipRoles);
export function writePublicMembership(writer, memberId, role) {
  if (!roles.has(role)) throw new Error('Invalid membership role.');
  writer.set(doc(db, 'memberMemberships', memberId), { role, updatedAt: serverTimestamp() });
}
// Old Admin memberships contained no team membership. Use Member, preserve the
// explicit permission, and let the admin choose the correct team membership.
export async function migrateLegacyMemberships(records, actor) {
  const grants = new Map((await getDocs(collection(db, 'admins'))).docs.map(entry => [entry.id, entry.data()]));
  let changed = false;
  for (const [id, access] of records) {
    const grant = grants.get(access.ownerUid);
    const existingGrant = validAdminGrant(grant) && (!Object.hasOwn(grant, 'memberId') || grant.memberId === id);
    if (access.role !== 'admin' && !(typeof access.websiteAdmin !== 'boolean' && existingGrant)) continue;
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'memberAccess', id), snapshot = await transaction.get(ref), current = snapshot.data();
      if (!current) return;
      const grantRef = current.ownerUid ? doc(db, 'admins', current.ownerUid) : null;
      const savedGrant = grantRef ? await transaction.get(grantRef) : null;
      const grantData = savedGrant?.data();
      const granted = savedGrant?.exists() && validAdminGrant(grantData) && (!Object.hasOwn(grantData, 'memberId') || grantData.memberId === id);
      if (current.role !== 'admin' && !(typeof current.websiteAdmin !== 'boolean' && granted)) return;
      // An active legacy account whose grant was removed must stay revoked.
      // Unclaimed invitations and deactivated accounts retain their prior intent.
      const legacyIntent = current.role === 'admin' && (!current.ownerUid || granted || (current.status === 'inactive' && !savedGrant?.exists()));
      const websiteAdmin = typeof current.websiteAdmin === 'boolean' ? current.websiteAdmin : Boolean(legacyIntent || granted);
      const role = membershipRole(current);
      transaction.update(ref, { role, websiteAdmin, updatedAt: serverTimestamp() });
      writePublicMembership(transaction, id, role);
      if (grantRef && websiteAdmin && current.status === 'active') transaction.set(grantRef, { enabled: true, memberId: id });
      else if (grantRef && granted) transaction.delete(grantRef);
      logActivity(db, transaction, actor, 'membership-permission-separated', 'memberAccess', id, current.role === 'admin' ? 'Legacy Admin membership changed to Member; prior website access or revocation preserved.' : 'Existing administrator permission preserved separately from team membership.');
      changed = true;
    });
  }
  return changed;
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
