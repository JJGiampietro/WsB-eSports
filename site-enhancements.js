import { auth, db, localTest } from './firebase-client.js';
import { watchAdmin } from './admin-access.js';
import { subscribePublished } from './site-content.js';
import { millis } from './content-model.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const root = document.body.dataset.siteRoot || '', safeLink = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch (_) { return null; } };
let unsubscribe = () => {}, stopAdmin = () => {}, version = 0;
const inbox = document.createElement('details'); inbox.className = 'site-inbox'; inbox.hidden = true;
inbox.innerHTML = '<summary>Notifications <span id="notificationCount">0</span></summary><div class="site-inbox-panel" aria-live="polite"><h2>Your updates</h2><div id="notificationItems"></div></div>';
document.querySelector('header.nav')?.insertAdjacentElement('afterend', inbox);
onAuthStateChanged(auth, user => {
  const current = ++version; unsubscribe(); stopAdmin(); inbox.hidden = !user;
  document.getElementById('notificationItems').textContent = ''; document.querySelectorAll('.admin-workspace-link').forEach(a => a.remove());
  if (!user) return;
  stopAdmin = watchAdmin(db, user, allowed => {
    if (current !== version) return;
    document.querySelectorAll('.admin-workspace-link').forEach(a => a.remove());
    if (allowed) {
      const link = document.createElement('a'); link.className = 'admin-workspace-link'; link.href = root + 'admin.html'; link.textContent = 'ADMIN WORKSPACE';
      // In the Community menu, not another top-level item.
      document.querySelector('#navlinks .nav-group:last-of-type .nav-menu')?.append(link);
    }
  });
  // No composite index: query only owner, then sort and cap locally.
  unsubscribe = onSnapshot(query(collection(db, 'notifications'), where('ownerUid', '==', user.uid)), snapshot => {
    if (current !== version) return;
    const records = snapshot.docs.sort((a, b) => (b.data().createdAt?.toMillis() || 0) - (a.data().createdAt?.toMillis() || 0));
    document.getElementById('notificationCount').textContent = records.filter(d => !d.data().read).length;
    const list = document.getElementById('notificationItems'); list.textContent = '';
    if (!records.length) list.textContent = 'No updates yet.';
    records.slice(0, 30).forEach(record => {
      const data = record.data(), item = document.createElement('article'), text = document.createElement('p'); text.textContent = data.message;
      const date = document.createElement('small'); date.textContent = data.createdAt?.toDate().toLocaleString() || 'Saving…';
      item.append(text, date);
      if (!data.read) { const mark = document.createElement('button'); mark.textContent = 'Mark read'; mark.onclick = async () => { mark.disabled = true; try { await updateDoc(doc(db, 'notifications', record.id), { read: true }); } catch (_) { mark.disabled = false; mark.textContent = 'Try again'; } }; item.append(mark); }
      list.append(item);
    });
  }, () => { if (current === version) document.getElementById('notificationItems').textContent = 'Updates are unavailable. Please try again later.'; });
});

function setupPreview(form, prefix, loadedEvent, savedEvent) {
  if (!form) return;
  let baseline = '', initialized = false;
  const picker = document.getElementById('adminMemberPicker'); let selected = picker?.value || '';
  const fields = () => [...form.querySelectorAll('input:not([type="file"]), textarea, select')].map(i => [i.id, i.type === 'checkbox' ? i.checked : i.value]);
  const snapshot = () => JSON.stringify([fields(), document.getElementById(prefix + 'ProfileImagePreview')?.style.backgroundImage || document.getElementById('profileImagePreview')?.style.backgroundImage || '']);
  const preview = document.createElement('section'); preview.className = 'public-profile-preview'; preview.innerHTML = '<h3>Public profile preview</h3><div class="preview-icon"></div><strong></strong><p></p><div class="preview-socials"></div><small>Your Gmail, account ID, and access settings are never included in this public preview.</small>';
  form.append(preview);
  const nameId = prefix === 'admin' ? 'adminDisplayName' : 'profileDisplayName';
  const bioId = prefix === 'admin' ? 'adminProfileBio' : 'profileBio';
  function renderPreview() {
    preview.querySelector('strong').textContent = document.getElementById(nameId).value || 'Your display name';
    preview.querySelector('p').textContent = document.getElementById(bioId).value || 'Your bio will appear here.';
    preview.querySelector('.preview-icon').style.backgroundImage = document.getElementById(prefix === 'admin' ? 'adminProfileImagePreview' : 'profileImagePreview').style.backgroundImage;
    const links = preview.querySelector('.preview-socials'); links.textContent = '';
    for (const [platform, id] of prefix === 'admin' ? [['TikTok', 'adminProfileTikTok'], ['Twitch', 'adminProfileTwitch']] : [['TikTok', 'profileTikTok'], ['Twitch', 'profileTwitch'], ['YouTube', 'profileYoutube'], ['Instagram', 'profileInstagram']]) {
      const href = safeLink(document.getElementById(id)?.value); if (!href) continue;
      const link = document.createElement('a'); link.href = href; link.textContent = platform + ' ↗'; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
    }
  }
  const clean = () => { baseline = snapshot(); initialized = true; selected = picker?.value || ''; renderPreview(); };
  const dirty = () => initialized && snapshot() !== baseline;
  document.addEventListener(loadedEvent, clean); document.addEventListener(savedEvent, clean);
  form.addEventListener('input', () => { if (!initialized) { baseline = ''; initialized = true; } renderPreview(); });
  form.addEventListener('change', renderPreview);
  new MutationObserver(renderPreview).observe(document.getElementById(prefix === 'admin' ? 'adminProfileImagePreview' : 'profileImagePreview'), { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('beforeunload', event => { if (!form.hidden && dirty()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target || !dirty() || form.hidden) return;
    if ((target.tagName === 'A' && target.target !== '_blank') || /signOut|adminStartNew|local-test/i.test(target.id)) {
      if (!confirm('You have unsaved profile changes. Discard them?')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  picker?.addEventListener('change', event => { if (dirty() && !confirm('Discard unsaved changes and edit another member?')) { picker.value = selected; event.stopImmediatePropagation(); } else selected = picker.value; }, true);
  form.addEventListener('reset', () => { setTimeout(clean, 0); }); renderPreview();
}
setupPreview(document.getElementById('memberProfileForm'), '', 'wsb:profile-loaded', 'wsb:profile-saved');
setupPreview(document.getElementById('adminMemberForm'), 'admin', 'wsb:admin-profile-loaded', 'wsb:admin-profile-saved');
if (localTest && document.getElementById('memberProfileForm')) {
  const controls = document.createElement('div'); controls.className = 'local-test-controls';
  controls.innerHTML = '<span>Local test account:</span><button data-local-role="member">Member</button><button data-local-role="invited">Invited member</button><button data-local-role="signout">Signed out</button>';
  document.querySelector('.member-account-hero').append(controls);
  controls.addEventListener('click', async event => { const role = event.target.dataset.localRole; if (!role) return; try { if (role === 'signout') await signOut(auth); else await signInWithEmailAndPassword(auth, role + '@wsb-test.invalid', 'Local-test-only-123!'); } catch (_) { alert('Start the local test emulators first. Production is unchanged.'); } });
}

async function currentActivity() {
  const slot = document.getElementById('homeCurrentActivity'); if (!slot) return;
  slot.textContent = '';
  for (const [kind, labelText] of [['events', 'Upcoming event'], ['announcements', 'Latest announcement']]) {
    const anchor = document.createElement('a'); anchor.className = 'current-activity-item'; anchor.href = root + kind + '.html'; const label = document.createElement('span'), title = document.createElement('h3'); label.textContent = labelText; title.textContent = 'Checking the latest updates…'; anchor.append(label, title); slot.append(anchor);
    subscribePublished(kind, records => { const item = kind === 'events' ? records.find(row => row.eventState === 'upcoming' && millis(row.startsAt) > Date.now()) : records.find(row => row.featured) || records[0]; title.textContent = item?.title || (kind === 'events' ? 'No upcoming events announced.' : 'No announcements published yet.'); }, () => { title.textContent = 'Check the latest updates.'; });
  }
  const bountyLink = document.createElement('a'); bountyLink.className = 'current-activity-item'; bountyLink.href = root + 'bounties.html'; bountyLink.innerHTML = '<span>Bounty board</span><h3>Sign in to see open bounties.</h3>'; slot.append(bountyLink);
  let stopBounties = () => {};
  onAuthStateChanged(auth, user => { stopBounties(); bountyLink.querySelector('h3').textContent = 'Sign in to see open bounties.'; if (!user) return;
    stopBounties = onSnapshot(query(collection(db, 'bounties'), where('status', '==', 'open')), snapshot => { const open = snapshot.docs.filter(d => !d.data().expiresAt || d.data().expiresAt.toMillis() > Date.now()); bountyLink.querySelector('h3').textContent = open.length + ' open ' + (open.length === 1 ? 'bounty' : 'bounties') + ' · View the board'; }, () => { bountyLink.querySelector('h3').textContent = 'Explore the bounty board.'; });
  });
}
currentActivity();
