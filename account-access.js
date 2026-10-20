// Every page checks member access, not just the profile editor. Firebase rules also
// enforce the block, so retaining an old sign-in token cannot bypass deactivation.
import { auth, db } from './firebase-client.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const message = 'Your WsB account is inactive. You have been signed out and cannot use member or admin features. Contact a WsB admin to restore access. Public pages are still available.';
const storageKey = 'wsb-access-inactive';
let epoch = 0, stops = [], revoking = false;
function notice(show) {
  let banner = document.getElementById('accountAccessNotice');
  if (show && !banner) {
    banner = document.createElement('aside'); banner.id = 'accountAccessNotice';
    banner.className = 'account-access-notice'; banner.setAttribute('role', 'alert');
    document.querySelector('main')?.prepend(banner);
  }
  if (banner) { banner.textContent = show ? message : ''; banner.hidden = !show; }
}
try { notice(sessionStorage.getItem(storageKey) === '1'); } catch (_) {}
onAuthStateChanged(auth, user => {
  stops.forEach(stop => stop()); stops = []; const version = ++epoch; revoking = false;
  if (!user) return;
  const email = (user.email || '').toLowerCase();
  async function revoke() {
    if (version !== epoch || auth.currentUser?.uid !== user.uid || revoking) return;
    revoking = true;
    try { sessionStorage.setItem(storageKey, '1'); } catch (_) {}
    notice(true);
    document.dispatchEvent(new Event('wsb:access-revoked'));
    try { await signOut(auth); } catch (_) { notice(true); }
  }
  if (email && !email.includes('/')) {
    stops.push(onSnapshot(doc(db, 'accountRestrictions', email), snapshot => {
      if (version !== epoch) return;
      if (snapshot.data()?.blocked === true) { revoke(); return; }
      // A successful check for another or reactivated account clears old notices.
      if (!revoking) { try { sessionStorage.removeItem(storageKey); } catch (_) {} notice(false); }
    }, () => { /* Private operations remain protected by server rules if offline. */ }));
  }
  // Also cover legacy inactive records that predate private restriction markers.
  stops.push(onSnapshot(query(collection(db, 'memberAccess'), where('ownerUid', '==', user.uid)), snapshot => {
    if (version === epoch && snapshot.docs.some(entry => entry.data().status === 'inactive')) revoke();
  }, () => {}));
  if (email && user.emailVerified) stops.push(onSnapshot(query(collection(db, 'memberAccess'), where('invitedEmail', '==', email)), snapshot => {
    if (version === epoch && snapshot.docs.some(entry => entry.data().status === 'inactive')) revoke();
  }, () => {}));
});
