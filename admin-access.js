import { doc, onSnapshot, serverTimestamp, collection } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// An Owner/Management label is never an authorization check.
export function watchAdmin(db, user, callback) {
  let stopAccess = () => {}, generation = 0;
  if (!user) { callback(false); return () => {}; }
  const stop = onSnapshot(doc(db, 'admins', user.uid), snapshot => {
    stopAccess(); const current = ++generation; const grant = snapshot.data();
    if (!snapshot.exists() || grant.enabled === false) { callback(false); return; }
    if (!grant.memberId) { callback(true); return; } // Existing bootstrap administrators.
    stopAccess = onSnapshot(doc(db, 'memberAccess', grant.memberId), access => {
      if (generation !== current) return;
      const a = access.data(); callback(Boolean(a && a.ownerUid === user.uid && a.role === 'admin' && a.status === 'active'));
    }, () => { if (generation === current) callback(false); });
  }, () => callback(false));
  return () => { generation++; stop(); stopAccess(); };
}

// Write alongside the mutation, never after it; failed saves cannot leave a success log.
export function logActivity(db, writer, user, action, targetType, targetId, detail = '') {
  const ref = doc(collection(db, 'adminActivity'));
  writer.set(ref, { actorUid: user.uid, actorEmail: user.email || '', action, targetType, targetId,
    detail: detail.slice(0, 300), createdAt: serverTimestamp() });
  return ref.id;
}
export function notifyMember(db, writer, ownerUid, type, targetId, message) {
  if (!ownerUid) return;
  writer.set(doc(collection(db, 'notifications')), { ownerUid, type, targetId, message: message.slice(0, 600),
    read: false, createdAt: serverTimestamp() });
}
