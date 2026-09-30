import { auth, db, localTest } from './firebase-client.js';
import { watchAdmin, logActivity, notifyMember } from './admin-access.js';
import { BACKUP_COLLECTIONS, encryptBackup, decryptBackup, encodeData, decodeData } from './backup-crypto.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDocs, query, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const $ = id => document.getElementById(id), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = v => v?.toDate ? v.toDate().toLocaleString() : v ? new Date(v).toLocaleString() : 'Not yet';
let allowed = false, epoch = 0, subscriptions = [], stopRole = () => {}, state = {}, roster = [], latest = null, manifest = null, inspected = null;
const showStatus = (id, message) => { $(id).textContent = message; };
function selectView(view, focus = false) {
  const tabs = [...document.querySelectorAll('[data-admin-view]')];
  if (!tabs.some(t => t.dataset.adminView === view)) view = 'overview';
  tabs.forEach(t => { const selected = t.dataset.adminView === view; t.setAttribute('aria-selected', String(selected)); t.tabIndex = selected ? 0 : -1; if (selected && focus) t.focus(); });
  document.querySelectorAll('[data-admin-panel]').forEach(p => { p.hidden = p.dataset.adminPanel !== view; });
  history.replaceState(null, '', '#' + view);
}
document.querySelectorAll('[data-admin-view]').forEach(tab => {
  tab.addEventListener('click', () => selectView(tab.dataset.adminView));
  tab.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-admin-view]')], i = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (i + 1) % tabs.length : event.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next !== null) { event.preventDefault(); selectView(tabs[next].dataset.adminView, true); }
  });
});
selectView(location.hash.slice(1));
const array = name => state[name] || [];
function render() {
  if (!allowed) return;
  const drafts = new Map([...document.querySelectorAll('#adminRewards input, #adminDisputes textarea')].map(input => [input.id, input.value]));
  const access = array('memberAccess'), claims = array('bountyClaims'), bountyIds = new Set(array('bounties').filter(b => b.status !== 'archived').map(b => b.id));
  const rows = [...roster, ...access.filter(a => !roster.some(r => r.id === a.id)).map(a => ({ id: a.id, displayName: a.displayName }))];
  const issues = rows.filter(r => window.WsbSync.status(latest, r.id).state !== 'synced');
  const metrics = [['Pending invites', access.filter(a => !a.ownerUid && a.status === 'invited').length, 'members'], ['Stats need attention', issues.length, 'overview'], ['Claims to review', claims.filter(c => c.status === 'pending' && bountyIds.has(c.bountyId)).length, 'bounties'], ['Rewards to deliver', claims.filter(c => c.status === 'approved' && !array('bountyRewards').some(r => r.id === c.id && r.status === 'delivered')).length, 'rewards']];
  $('adminOverview').innerHTML = metrics.map(([label, count, view]) => '<button class="admin-metric" data-open-view="' + view + '"><strong>' + count + '</strong><span>' + label + '</span></button>').join('');
  const search = $('adminSyncSearch').value.trim().toLowerCase(), filter = $('adminSyncFilter').value;
  const visible = rows.filter(r => (filter === 'all' || filter === 'issues' && window.WsbSync.status(latest, r.id).state !== 'synced' || filter === 'synced' && window.WsbSync.status(latest, r.id).state === 'synced') && [r.id, r.displayName].join(' ').toLowerCase().includes(search));
  $('adminSyncList').innerHTML = visible.map(r => '<div class="admin-table-row"><strong>' + esc(r.displayName || r.id) + '</strong><p>' + esc(window.WsbSync.describe(latest, r.id)) + '</p><button class="member-text-button" data-edit-member="' + esc(r.id) + '">REVIEW MEMBER →</button></div>').join('') || '<p>No members match this filter.</p>';
  const term = $('adminActivitySearch').value.trim().toLowerCase();
  $('adminActivityList').innerHTML = array('adminActivity').filter(e => [e.actorEmail, e.action, e.targetId, e.detail].join(' ').toLowerCase().includes(term)).map(e => '<div class="admin-table-row"><strong>' + esc(e.action.replaceAll('-', ' ')) + '</strong><p>' + esc(e.actorEmail || e.actorUid) + ' · ' + esc(when(e.createdAt)) + '</p><p>' + esc(e.targetType + '/' + e.targetId) + (e.detail ? ' · ' + esc(e.detail) : '') + '</p></div>').join('') || '<p>No matching activity yet.</p>';
  $('adminRewards').innerHTML = claims.filter(c => c.status === 'approved').map(c => {
    const reward = array('bountyRewards').find(r => r.id === c.id);
    return '<div class="admin-table-row"><h3>' + esc(c.claimantName) + ' · $' + c.amount + '</h3><p>' + esc(c.targetName) + ' · ' + (reward?.status === 'delivered' ? 'Delivered ' + esc(when(reward.updatedAt)) : 'Approved; not yet delivered') + '</p>' + (reward?.note ? '<p>' + esc(reward.note) + '</p>' : '') + (reward?.status !== 'delivered' ? '<label>Delivery note (no codes or private payment information)<input id="reward-note-' + esc(c.id) + '" maxlength="300"></label><button class="bounty-btn secondary" data-deliver="' + esc(c.id) + '">MARK DELIVERED</button>' : '') + '</div>';
  }).join('') || '<p>No approved rewards yet.</p>';
  $('adminDisputes').innerHTML = array('claimDisputes').map(d => '<div class="admin-table-row"><strong>' + esc(d.status) + ' · ' + esc(d.claimId) + '</strong><p>' + esc(d.message) + '</p>' + (d.status === 'open' ? '<label>Resolution<textarea id="dispute-resolution-' + esc(d.id) + '" maxlength="600" required></textarea></label><button class="bounty-btn secondary" data-resolve="' + esc(d.id) + '">RESOLVE REQUEST</button>' : '<p>' + esc(d.resolution) + '</p>') + '</div>').join('') || '<p>No dispute requests.</p>';
  $('adminPublishStatus').innerHTML = '<p><strong>' + (localTest ? 'Local preview — not published' : 'Firebase production') + '</strong></p>' + (manifest ? '<p>Last deployed source: ' + esc(manifest.sourceCommit?.slice(0, 12)) + '<br>Published: ' + esc(when(manifest.publishedAt)) + '<br>Deployed stats snapshot: ' + esc(when(manifest.statsFetchedAt)) + '</p>' : '<p>No deployment manifest available locally. This preview does not publish changes.</p>') + '<p>Loaded stats snapshot: ' + esc(when(latest?.fetchedAt)) + (latest?.fetchedAt && Date.now() - Date.parse(latest.fetchedAt) > 7200000 ? ' · Refresh delayed; investigate publishing runs.' : '') + '</p>';
  drafts.forEach((value, id) => { if ($(id)) $(id).value = value; });
}
$('adminActivitySearch').addEventListener('input', render);
$('adminSyncSearch').addEventListener('input', render); $('adminSyncFilter').addEventListener('change', render);
document.getElementById('adminDashboard').addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || !allowed) return;
  if (button.dataset.openView) { selectView(button.dataset.openView, true); return; }
  if (button.dataset.editMember) { selectView('members', true); const picker = $('adminMemberPicker'); $('adminMemberSearch').value = ''; $('adminMemberSearch').dispatchEvent(new Event('input')); picker.value = button.dataset.editMember; picker.dispatchEvent(new Event('change')); return; }
  if (!button.dataset.deliver && !button.dataset.resolve) return;
  button.disabled = true; const version = epoch;
  try {
    const batch = writeBatch(db), user = auth.currentUser;
    if (button.dataset.deliver) {
      const id = button.dataset.deliver, claim = array('bountyClaims').find(c => c.id === id);
      if (!claim || claim.status !== 'approved') throw new Error('This claim is not approved.');
      const note = $('reward-note-' + id).value.trim();
      if (!confirm('Confirm the $' + claim.amount + ' reward has actually been delivered to ' + claim.claimantName + '?')) return;
      batch.set(doc(db, 'bountyRewards', id), { claimId: id, ownerUid: claim.ownerUid, status: 'delivered', note, updatedAt: serverTimestamp(), updatedBy: user.uid });
      logActivity(db, batch, user, 'reward-delivered', 'bountyClaims', id, note);
      notifyMember(db, batch, claim.ownerUid, 'reward-delivered', id, 'Your $' + claim.amount + ' reward for ' + claim.targetName + ' was marked delivered.' + (note ? ' ' + note : ''));
    } else {
      const id = button.dataset.resolve, dispute = array('claimDisputes').find(d => d.id === id), resolution = $('dispute-resolution-' + id).value.trim();
      if (!resolution) throw new Error('Add a resolution for the member.');
      batch.update(doc(db, 'claimDisputes', id), { status: 'resolved', resolution, updatedAt: serverTimestamp() });
      logActivity(db, batch, user, 'dispute-resolved', 'claimDisputes', id, resolution);
      notifyMember(db, batch, dispute.ownerUid, 'dispute-resolved', id, resolution);
    }
    await batch.commit();
  } catch (error) { if (version === epoch) alert(error.message); }
  finally { button.disabled = false; }
});
function clearPrivate() {
  subscriptions.forEach(stop => stop()); subscriptions = []; state = {}; inspected = null; $('backupRestore').disabled = true;
  ['adminOverview', 'adminSyncList', 'adminActivityList', 'adminRewards', 'adminDisputes', 'adminPublishStatus', 'backupSummary'].forEach(id => { $(id).textContent = ''; });
  $('backupPassphrase').value = ''; $('backupFile').value = '';
}
onAuthStateChanged(auth, user => {
  const version = ++epoch; stopRole(); allowed = false; clearPrivate();
  stopRole = watchAdmin(db, user, async isAdmin => {
    if (version !== epoch) return;
    if (!isAdmin) { allowed = false; clearPrivate(); return; }
    if (allowed) return; allowed = true;
    for (const name of ['memberAccess', 'bounties', 'bountyClaims', 'bountyRewards', 'claimDisputes', 'adminActivity']) {
      const source = name === 'adminActivity' ? query(collection(db, name), orderBy('createdAt', 'desc'), limit(100)) : collection(db, name);
      subscriptions.push(onSnapshot(source, snapshot => { if (version !== epoch || !allowed) return; state[name] = snapshot.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, error => { if (version === epoch) { state[name] = []; render(); $('adminError').textContent = error.message; $('adminError').hidden = false; } }));
    }
    await refreshHealth(version);
  });
});
async function refreshHealth(version = epoch) {
  if (!allowed) return;
  const read = url => fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  const result = await Promise.all([read('data/roster.json'), read('data/latest.json'), read('deployment.json')]);
  if (version !== epoch || !allowed) return;
  roster = result[0] || roster; latest = result[1] || latest; manifest = result[2] || manifest; render();
  $('adminHealthStatus').textContent = result[1] ? 'Status checked ' + new Date().toLocaleTimeString() + '. Rechecks once a minute; this does not call the Fortnite API.' : 'Could not refresh status. Showing previously loaded data.';
}
$('adminRefreshHealth').addEventListener('click', () => refreshHealth());
setInterval(() => { if (allowed && !document.hidden) refreshHealth(); }, 60000);
function download(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('backupExport').addEventListener('click', async () => {
  if (!allowed) return; const version = epoch, button = $('backupExport'); button.disabled = true;
  try {
    const password = $('backupPassphrase').value; if (password.length < 16) throw new Error('Use a passphrase of at least 16 characters.');
    showStatus('backupStatus', 'Reading and encrypting your private data…');
    const entries = await Promise.all(BACKUP_COLLECTIONS.map(async name => {
      // Notifications are owner-readable only. An admin exports each member inbox separately through backup-specific rules.
      const snapshot = await getDocs(collection(db, name));
      return [name, snapshot.docs.map(d => ({ id: d.id, data: encodeData(d.data()) }))];
    }));
    if (version !== epoch || !allowed) throw new Error('Admin access changed. Backup cancelled.');
    const result = await encryptBackup({ schemaVersion: 1, projectId: db.app.options.projectId, createdAt: new Date().toISOString(), collections: Object.fromEntries(entries) }, password);
    download(result, 'wsb-private-backup-' + new Date().toISOString().slice(0, 10) + '.json');
    const batch = writeBatch(db); logActivity(db, batch, auth.currentUser, 'backup-exported', 'backup', 'encrypted-download'); await batch.commit();
    showStatus('backupStatus', 'Encrypted backup downloaded. Keep the file and passphrase in separate private locations.');
  } catch (error) { showStatus('backupStatus', error.message); } finally { button.disabled = false; }
});
$('backupFile').addEventListener('change', () => { inspected = null; $('backupRestore').disabled = true; $('backupSummary').textContent = ''; });
$('backupInspect').addEventListener('click', async () => {
  inspected = null; $('backupRestore').disabled = true;
  try {
    const file = $('backupFile').files[0]; if (!file || file.size > 50000000) throw new Error('Select an encrypted backup smaller than 50 MB.');
    inspected = await decryptBackup(JSON.parse(await file.text()), $('backupPassphrase').value, db.app.options.projectId);
    showStatus('backupSummary', 'Verified ' + inspected.createdAt + ': ' + Object.entries(inspected.collections).map(([name, docs]) => name + ' (' + docs.length + ')').join(', ') + '.');
    $('backupRestore').disabled = !localTest;
  } catch (error) { showStatus('backupSummary', error.message); }
});
$('backupRestore').addEventListener('click', async () => {
  if (!allowed || !localTest || !inspected || !$('backupConfirm').checked) { showStatus('backupStatus', 'Verify a backup and confirm the local merge first.'); return; }
  const button = $('backupRestore'); button.disabled = true;
  try {
    const records = ['members', 'memberAccess'].flatMap(name => (inspected.collections[name] || []).map(d => ({ ...d, name })));
    for (let offset = 0; offset < records.length; offset += 200) {
      const batch = writeBatch(db);
      for (const row of records.slice(offset, offset + 200)) {
        const data = decodeData(row.data, Timestamp);
        // Never import grants or overwrite the administrator doing the restore.
        if (row.name === 'memberAccess' && (data.role === 'admin' || data.ownerUid === auth.currentUser.uid)) continue;
        batch.set(doc(db, row.name, row.id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      }
      logActivity(db, batch, auth.currentUser, 'backup-restored', 'backup', 'local-merge'); await batch.commit();
    }
    showStatus('backupStatus', 'Local profiles and account links restored. Full history restoration is tested separately using the isolated emulator recovery test. No records were deleted.');
  } catch (error) { showStatus('backupStatus', error.message); } finally { button.disabled = false; }
});
if (localTest) {
  const controls = document.createElement('div'); controls.className = 'local-test-controls';
  controls.innerHTML = '<span>Test as:</span><button data-test-login="admin">Admin</button><button data-test-login="member">Member</button><button data-test-login="owner">Owner (display only)</button><button data-test-login="invited">Invited member</button><button data-test-login="signout">Signed out</button><span id="localLoginStatus" role="status"></span>';
  document.querySelector('.admin-workspace-heading').append(controls);
  controls.addEventListener('click', async event => {
    const role = event.target.dataset.testLogin; if (!role) return;
    try { if (role === 'signout') await signOut(auth); else await signInWithEmailAndPassword(auth, role + '@wsb-test.invalid', 'Local-test-only-123!'); $('localLoginStatus').textContent = ''; }
    catch (_) { $('localLoginStatus').textContent = 'Start and seed the local emulators first. No live account was used.'; }
  });
}
