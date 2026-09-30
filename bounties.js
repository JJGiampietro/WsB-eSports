import { auth, db, provider } from './firebase-member.js?v=workspace-1';
import { safeProfileImage, makeProfileIcon } from './profile-image.js?v=1';
import { watchAdmin, logActivity, notifyMember } from './admin-access.js';
import { onAuthStateChanged, signInWithPopup } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, doc, getDoc, onSnapshot, query, where, runTransaction, serverTimestamp, setDoc, writeBatch, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const images = ['wsb-logo.png', 'elusion.png', 'mysterious.png', 'mello.png', 'kato.png'];
const clipPattern = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|streamable\.com|clips\.twitch\.tv)\/[A-Za-z0-9_/?&=.%#~+\-]+$/;
let user = null, admin = false, memberId = '', memberName = '', memberReady = false;
let bounties = [], claims = [], boardReady = false, claimsReady = false;
let view = 'board', activeTarget = '', editingId = '', removingId = '', toastTimer;
let epoch = 0, roleKnown = false, subscriptions = [], claimsUnsubscribe = null, claimsGeneration = 0, editorVersion = null;
let submitting = false, saving = false, removing = false, reviewing = false;
let editorImage = 'wsb-logo.png', imageProcessing = false, imageGeneration = 0;
let rewards = [], disputes = [], supportSubscriptions = [];
const expired = bounty => Boolean(bounty?.expiresAt && bounty.expiresAt.toMillis() <= Date.now());

function readableError(error) {
  if (error.code === 'permission-denied') return 'Access denied. Your role may have changed, or bounty permissions are not available yet. Refresh and try again.';
  if (error.code === 'unavailable') return 'Firebase is unavailable. Check your connection and try again.';
  if (error.code === 'auth/popup-closed-by-user') return 'Google sign-in was cancelled. Please try again.';
  return error.message || 'Something went wrong. Please try again.';
}
function showError(error) { $('bountyError').textContent = readableError(error); $('bountyError').hidden = false; }
function toast(message) {
  clearTimeout(toastTimer); $('bountyToast').textContent = message; $('bountyToast').hidden = false;
  toastTimer = setTimeout(() => { $('bountyToast').hidden = true; }, 6000);
}
function empty(title, message) { return '<div class="bounty-empty"><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p></div>'; }
function canSubmit() { return Boolean(user && (admin || memberReady)); }
function ownClaim(id) { return claims.find(c => c.bountyId === id && c.ownerUid === user?.uid); }
function date(value) { return value?.toDate ? value.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Saving…'; }
function imageFor(value) { return safeProfileImage(value) || (images.includes(value) && value !== 'wsb-logo.png' ? value : 'wsb-logo.webp'); }

function setView(next, focus = false) {
  if (!user && next !== 'board') next = 'board';
  if (!admin && ['review', 'manage'].includes(next)) next = 'board';
  view = next;
  document.querySelectorAll('[data-view]').forEach(tab => {
    const selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $('panel-' + tab.dataset.view).hidden = !selected;
    if (selected && focus) tab.focus();
  });
}

function renderBoard() {
  const active = bounties.filter(t => t.status !== 'archived');
  $('openCount').textContent = active.filter(t => t.status === 'open' && !expired(t)).length;
  if (!user) {
    $('bountyGrid').innerHTML = empty('Sign in to see the board.', 'Use your Google account linked to WsB to claim a bounty.');
    $('resultCount').textContent = 'Sign in to see current bounties.'; return;
  }
  if (!boardReady) { $('bountyGrid').innerHTML = empty('Loading bounties…', 'Retrieving the latest board.'); return; }
  const search = $('bountySearch').value.trim().toLowerCase(), filter = $('bountyFilter').value;
  const visible = active.filter(t => t.targetName.toLowerCase().includes(search) && (filter === 'all' || t.status === filter));
  $('resultCount').textContent = visible.length + ' ' + (visible.length === 1 ? 'bounty' : 'bounties') + ' · Rewards subject to admin approval';
  $('bountyGrid').innerHTML = visible.map(t => {
    const c = ownClaim(t.id), pending = c?.status === 'pending', approved = c?.status === 'approved';
    const claimable = canSubmit() && t.status === 'open' && !expired(t) && !pending;
    const action = pending || approved ? 'claim' : claimable ? 'target' : '';
    const label = pending || approved ? 'VIEW YOUR CLAIM' : claimable ? (c?.status === 'denied' ? 'RESUBMIT CLAIM' : 'VIEW BOUNTY') : t.status === 'open' ? 'MEMBER ACCESS REQUIRED' : t.status.toUpperCase();
    return '<article class="bounty-card"><img class="bounty-card-image" src="' + imageFor(t.image) + '" alt="" width="447" height="308"><div class="bounty-card-content"><div class="bounty-card-meta"><span class="bounty-status ' + (t.status === 'claimed' ? 'approved' : '') + '">' + esc(expired(t) && t.status === 'open' ? 'expired' : t.status) + '</span></div><h3>' + esc(t.targetName) + '</h3><p class="bounty-card-mode">' + esc(t.mode) + '</p><p class="bounty-help">' + (t.expiresAt ? 'Deadline: ' + esc(date(t.expiresAt)) : 'No deadline set') + '</p><div class="bounty-card-reward"><strong>$' + t.amount + '</strong><span>V-BUCKS REWARD<br>USD VALUE</span></div><button class="bounty-btn ' + (action === 'claim' ? 'secondary' : '') + '" ' + (action ? 'data-' + action + '="' + esc(t.id) + '"' : 'disabled') + '>' + (expired(t) && !action ? 'EXPIRED' : label) + ' <span aria-hidden="true">↗</span></button></div></article>';
  }).join('') || empty(active.length ? 'No matching bounties.' : 'The board is clear.', active.length ? 'Try another name or status filter.' : admin ? 'Open Manage bounties to add the first target.' : 'Check back for the next bounty.');
}

function claimMarkup(c, review) {
  const bounty = bounties.find(b => b.id === c.bountyId);
  const closed = !bounty || bounty.status !== 'open';
  const removed = !bounty || bounty.status === 'archived';
  const reward = rewards.find(r => r.id === c.id);
  const dispute = disputes.find(d => d.id === c.id);
  const clip = clipPattern.test(c.clipUrl) ? '<a class="bounty-btn secondary" href="' + esc(c.clipUrl) + '" target="_blank" rel="noopener noreferrer">OPEN CLIP ↗</a>' : '<p class="bounty-error">The saved clip link is invalid.</p>';
  return '<article class="bounty-claim"><div class="bounty-claim-head"><div><h3>' + esc(c.targetName) + ' / $' + c.amount + '</h3><p>' + esc(c.claimantName) + ' · ' + esc(date(c.updatedAt)) + '</p></div><span class="bounty-status ' + esc(c.status) + '">' + (c.status === 'pending' ? 'Pending review' : esc(c.status)) + '</span></div><p>' + esc(c.mode) + '. Reward and target details shown are from the submitted claim.</p>' + clip
    + (c.notes ? '<p><strong>Member notes:</strong> ' + esc(c.notes) + '</p>' : '')
    + (c.reason ? '<p><strong>Admin feedback:</strong> ' + esc(c.reason) + '</p>' : '')
    + (c.status === 'approved' ? '<p><strong>Reward: ' + (reward?.status === 'delivered' ? 'Delivered' : 'Awaiting delivery') + '</strong>' + (reward?.note ? ' · ' + esc(reward.note) : '') + '</p>' : '')
    + (dispute ? '<p><strong>Dispute: ' + esc(dispute.status) + '</strong> · ' + esc(dispute.message) + (dispute.resolution ? '<br>Resolution: ' + esc(dispute.resolution) : '') + '</p>' : !review && c.status === 'denied' ? '<button class="bounty-btn secondary" data-dispute="' + esc(c.id) + '">REQUEST A REVIEW</button>' : '')
    + (removed ? '<p><strong>Removed bounty — retained for admin history only.</strong></p>' : closed && c.status === 'pending' ? '<p>This bounty is no longer open. It cannot award another claim.</p>' : '')
    + (!review && c.status === 'denied' && !closed && canSubmit() ? '<button class="bounty-btn secondary" data-target="' + esc(c.bountyId) + '">RESUBMIT CLAIM</button>' : '')
    + (review && !removed && c.status === 'pending' ? '<label>Review notes (required when denying)<textarea class="bounty-review-note" id="reason-' + esc(c.id) + '" maxlength="600" rows="2" placeholder="Explain the decision to the member"></textarea></label><p id="review-error-' + esc(c.id) + '" class="bounty-error" role="alert"></p><div class="bounty-review-actions"><button class="bounty-btn" data-decision="approved" data-review="' + esc(c.id) + '" ' + (closed ? 'disabled' : '') + '>APPROVE CLAIM</button><button class="bounty-btn secondary" data-decision="denied" data-review="' + esc(c.id) + '">DENY CLAIM</button></div>' : '') + '</article>';
}
function renderClaims() {
  // Preserve typed review notes when a realtime update arrives.
  const drafts = new Map([...document.querySelectorAll('#reviewList textarea')].map(t => [t.id, t.value]));
  const available = new Set(bounties.filter(b => b.status !== 'archived').map(b => b.id));
  const mine = claims.filter(c => c.ownerUid === user?.uid && available.has(c.bountyId));
  const reviews = admin && $('showRemovedClaims').checked ? claims : claims.filter(c => available.has(c.bountyId));
  $('claimCount').textContent = mine.length;
  $('claimList').innerHTML = !user ? '' : !claimsReady || !boardReady ? empty('Loading claims…', 'Retrieving your submissions.') : mine.map(c => claimMarkup(c, false)).join('') || empty('Your first claim starts here.', 'Choose an open bounty and submit your clip link for review. Claims for removed bounties are hidden here.');
  $('reviewList').innerHTML = !admin ? '' : !claimsReady || !boardReady ? empty('Loading reviews…', 'Retrieving submitted claims.') : reviews.map(c => claimMarkup(c, true)).join('') || empty('The review queue is clear.', 'New member claims will appear here. Enable removed bounty history to see archived claims.');
  if (admin) drafts.forEach((value, id) => { if ($(id)) $(id).value = value; });
}
function renderManagement() {
  $('manageList').innerHTML = !admin ? '' : bounties.map(t => '<article class="bounty-claim"><div class="bounty-claim-head"><div><h3>' + esc(t.targetName) + ' / $' + t.amount + '</h3><p>' + esc(t.mode) + '</p></div><span class="bounty-status">' + esc(t.status) + '</span></div><p>' + esc(t.instructions) + '</p><div class="bounty-manage-actions">'
    + (['open', 'paused'].includes(t.status) ? '<button class="bounty-btn secondary" data-edit="' + esc(t.id) + '">EDIT BOUNTY</button>' : '')
    + (t.status !== 'archived' ? '<button class="bounty-btn secondary" data-remove="' + esc(t.id) + '">REMOVE BOUNTY</button>' : '<p>Removed from the board. Claim history is retained.</p>') + '</div></article>').join('') || empty('Create the first bounty.', 'Add a target, a $5-$20 reward value, and the requirements for a valid elimination.');
}
function renderAll() { renderBoard(); renderClaims(); renderManagement(); }

function updateAccess() {
  $('tab-claims').hidden = !user; $('tab-review').hidden = !admin; $('tab-manage').hidden = !admin;
  $('bountySignIn').hidden = Boolean(user);
  $('bountyAccountStatus').textContent = !user ? 'Sign in with Google to view the bounty board.' : !roleKnown ? 'Checking your account access…' : admin ? 'Admin access · ' + (user.email || user.displayName) : memberReady ? 'Member access · ' + (memberName || user.email) : 'Signed in. An active WsB member profile is required to submit claims. Visit My profile or contact an admin.';
  setView(view); renderAll();
}
function subscribeClaims(version) {
  if (claimsUnsubscribe) claimsUnsubscribe();
  supportSubscriptions.forEach(stop => stop()); supportSubscriptions = []; rewards = []; disputes = [];
  const generation = ++claimsGeneration;
  claims = []; claimsReady = false;
  const source = admin ? collection(db, 'bountyClaims') : query(collection(db, 'bountyClaims'), where('ownerUid', '==', user.uid));
  claimsUnsubscribe = onSnapshot(source, snapshot => {
    if (version !== epoch || generation !== claimsGeneration) return;
    claims = snapshot.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    claimsReady = true; renderBoard(); renderClaims();
  }, error => { if (version === epoch && generation === claimsGeneration) { claims = []; claimsReady = true; renderClaims(); showError(error); } });
  ['bountyRewards', 'claimDisputes'].forEach(name => supportSubscriptions.push(onSnapshot(admin ? collection(db, name) : query(collection(db, name), where('ownerUid', '==', user.uid)), snapshot => {
    if (version !== epoch || generation !== claimsGeneration) return;
    const values = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    if (name === 'bountyRewards') rewards = values; else disputes = values;
    renderClaims();
  }, error => { if (version === epoch && generation === claimsGeneration) { if (name === 'bountyRewards') rewards = []; else disputes = []; renderClaims(); showError(error); } })));
}
onAuthStateChanged(auth, nextUser => {
  const version = ++epoch;
  subscriptions.forEach(unsubscribe => unsubscribe()); subscriptions = [];
  if (claimsUnsubscribe) { claimsUnsubscribe(); claimsUnsubscribe = null; }
  supportSubscriptions.forEach(stop => stop()); supportSubscriptions = [];
  ++claimsGeneration;
  ['claimDialog', 'editorDialog', 'removeDialog', 'disputeDialog'].forEach(id => { if ($(id)?.open) $(id).close(); });
  user = nextUser; admin = false; roleKnown = false; memberReady = false; memberId = ''; memberName = '';
  $('showRemovedClaims').checked = false;
  bounties = []; claims = []; rewards = []; disputes = []; boardReady = false; claimsReady = false;
  $('bountyError').hidden = true; updateAccess();
  if (!user) return;
  subscriptions.push(watchAdmin(db, user, allowed => {
    if (version !== epoch) return;
    const changed = admin !== allowed || !roleKnown;
    admin = allowed; roleKnown = true;
    if (!admin) ['editorDialog', 'removeDialog'].forEach(id => { if ($(id).open) $(id).close(); });
    if (changed) subscribeClaims(version);
    updateAccess();
  }));
  subscriptions.push(onSnapshot(query(collection(db, 'memberAccess'), where('ownerUid', '==', user.uid)), async snapshot => {
    if (version !== epoch) return;
    const active = snapshot.docs.filter(d => d.data().status === 'active');
    memberReady = active.length === 1; memberId = memberReady ? active[0].id : ''; memberName = '';
    if (!memberReady && !admin && $('claimDialog').open) $('claimDialog').close();
    updateAccess();
    if (memberId) {
      const selectedId = memberId;
      try {
        const profile = await getDoc(doc(db, 'members', memberId));
        if (version !== epoch || memberId !== selectedId) return;
        memberName = profile.data()?.fortniteUsername || profile.data()?.displayName || '';
        if ($('claimDialog').open && !$('claimName').value.trim()) $('claimName').value = memberName;
        updateAccess();
      } catch (error) { if (version === epoch) showError(error); }
    }
  }, error => { if (version === epoch) { memberReady = false; memberId = ''; updateAccess(); showError(error); } }));
  subscriptions.push(onSnapshot(collection(db, 'bounties'), snapshot => {
    if (version !== epoch) return;
    bounties = snapshot.docs.map(d => ({ ...d.data(), id: d.id })).sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    boardReady = true; renderAll();
  }, error => { if (version === epoch) { bounties = []; boardReady = true; renderAll(); showError(error); } }));
});
$('bountySignIn').addEventListener('click', async () => {
  $('bountySignIn').disabled = true;
  try { await signInWithPopup(auth, provider); } catch (error) { showError(error); }
  finally { $('bountySignIn').disabled = false; }
});

function openTarget(id) {
  const target = bounties.find(t => t.id === id);
  if (!canSubmit() || !target || target.status !== 'open' || expired(target)) return;
  const previous = ownClaim(id);
  if (previous && previous.status !== 'denied') { setView('claims', true); return; }
  activeTarget = id; $('claimForm').reset(); $('claimError').textContent = '';
  $('dialogTitle').textContent = target.targetName; $('dialogImage').src = imageFor(target.image);
  $('dialogReward').textContent = '$' + target.amount + ' V-Bucks reward value';
  $('dialogRules').textContent = target.mode + ': ' + target.instructions + '\nEligibility: ' + (target.eligibility || 'Active WsB members. Your own legitimate gameplay only; no staged eliminations or cheating.') + '\nDeadline: ' + (target.expiresAt ? date(target.expiresAt) : 'No deadline set') + '\nDisputes: ' + (target.disputePolicy || 'Use Request a review on a denied claim. An admin reviews the evidence and replies on the site.');
  $('claimName').value = previous?.claimantName || memberName || user.displayName || '';
  $('claimClipUrl').value = previous?.clipUrl || ''; $('claimNotes').value = previous?.notes || '';
  $('claimDialog').showModal();
}
$('closeDialog').addEventListener('click', () => { if (!submitting) $('claimDialog').close(); });
$('claimDialog').addEventListener('cancel', e => { if (submitting) e.preventDefault(); });
$('claimForm').addEventListener('submit', async e => {
  e.preventDefault(); if (submitting || !canSubmit()) return;
  const version = epoch, target = bounties.find(t => t.id === activeTarget);
  const name = $('claimName').value.trim(), clipUrl = $('claimClipUrl').value.trim();
  if (!name || !clipPattern.test(clipUrl)) { $('claimError').textContent = 'Enter your Fortnite name and a valid HTTPS YouTube, Streamable, or Twitch Clips link.'; return; }
  if (!target || target.status !== 'open' || expired(target)) { $('claimError').textContent = 'This bounty is closed or its deadline has passed. Refresh the board.'; return; }
  const previous = ownClaim(target.id);
  if (previous && previous.status !== 'denied') { $('claimError').textContent = 'You already have a claim for this bounty.'; return; }
  submitting = true; $('submitClaim').disabled = true; $('submitClaim').textContent = 'SAVING CLAIM…'; $('claimError').textContent = '';
  try {
    // Deterministic ID and server rules prevent duplicate or overwritten pending claims.
    await setDoc(doc(db, 'bountyClaims', target.id + '_' + user.uid), {
      bountyId: target.id, ownerUid: user.uid, memberId: memberReady ? memberId : '', claimantName: name,
      targetName: target.targetName, amount: target.amount, mode: target.mode, clipUrl, notes: $('claimNotes').value.trim(),
      status: 'pending', createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp(),
      reviewedAt: null, reviewerUid: '', reason: ''
    });
    if (version !== epoch) return;
    $('claimDialog').close(); setView('claims', true); toast('Claim saved. The WsB team can now review your clip.');
  } catch (error) { if (version === epoch) $('claimError').textContent = readableError(error); }
  finally { submitting = false; $('submitClaim').disabled = false; $('submitClaim').textContent = 'SUBMIT CLAIM ↗'; }
});

function updateImageControls() {
  $('saveBounty').disabled = saving || imageProcessing;
  $('editImageFile').disabled = saving || imageProcessing;
  $('removeBountyImage').disabled = saving;
}
function setEditorImage(value, label) {
  editorImage = safeProfileImage(value) || (images.includes(value) ? value : 'wsb-logo.png');
  $('editImagePreview').src = imageFor(editorImage);
  $('editImageStatus').textContent = label || (editorImage === 'wsb-logo.png' ? 'Default WsB logo' : 'Current bounty image');
  $('removeBountyImage').hidden = editorImage === 'wsb-logo.png';
}
$('editImageFile').addEventListener('change', async () => {
  const file = $('editImageFile').files?.[0];
  if (!file || !admin || saving) return;
  const generation = ++imageGeneration, version = epoch;
  imageProcessing = true; updateImageControls(); $('editorError').textContent = '';
  $('editImageStatus').textContent = 'Preparing image…';
  try {
    const data = await makeProfileIcon(file);
    if (generation !== imageGeneration || version !== epoch || !admin || !$('editorDialog').open) return;
    setEditorImage(data, 'Image ready — save the bounty to apply it.');
  } catch (error) {
    if (generation === imageGeneration && version === epoch) {
      setEditorImage(editorImage); $('editorError').textContent = error.message;
    }
  } finally {
    if (generation === imageGeneration) { imageProcessing = false; $('editImageFile').value = ''; updateImageControls(); }
  }
});
$('removeBountyImage').addEventListener('click', () => {
  if (!admin || saving) return;
  ++imageGeneration; imageProcessing = false; $('editImageFile').value = '';
  setEditorImage('wsb-logo.png'); $('editorError').textContent = ''; updateImageControls();
});
$('editorDialog').addEventListener('close', () => {
  ++imageGeneration; imageProcessing = false; $('editImageFile').value = ''; updateImageControls();
});

function openEditor(id = '') {
  if (!admin) return;
  const target = bounties.find(t => t.id === id);
  if (id && (!target || !['open', 'paused'].includes(target.status))) return;
  editingId = id; editorVersion = target?.updatedAt || null;
  $('bountyEditor').reset(); $('editorError').textContent = ''; $('editorTitle').textContent = id ? 'EDIT BOUNTY' : 'ADD BOUNTY';
  $('editTarget').value = target?.targetName || ''; $('editAmount').value = target?.amount || 5;
  $('editMode').value = target?.mode || 'Any mode';
  ++imageGeneration; imageProcessing = false;
  setEditorImage(target?.image || 'wsb-logo.png'); updateImageControls();
  $('editInstructions').value = target?.instructions || "Show your in-game name, the target's exact name, and the elimination clearly in your clip.";
  $('editStatus').value = target?.status || 'open'; $('editorDialog').showModal();
  if ($('editExpiry')) {
    const deadline = target?.expiresAt?.toDate();
    $('editExpiry').value = deadline ? new Date(deadline.getTime() - deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    $('editEligibility').value = target?.eligibility || 'Active WsB members. Your own gameplay only. No staged eliminations, teaming, or cheating.';
    $('editDisputePolicy').value = target?.disputePolicy || 'Use Request a review on a denied claim. Admins respond on the site; keep your clip available until resolved.';
  }
}
$('addBounty').addEventListener('click', () => openEditor());
$('closeEditor').addEventListener('click', () => { if (!saving) $('editorDialog').close(); });
$('editorDialog').addEventListener('cancel', e => { if (saving) e.preventDefault(); });
$('bountyEditor').addEventListener('submit', async e => {
  e.preventDefault(); if (!admin || saving || imageProcessing) return;
  const version = epoch;
  const changes = { targetName: $('editTarget').value.trim(), amount: Number($('editAmount').value), mode: $('editMode').value, instructions: $('editInstructions').value.trim(), image: editorImage, status: $('editStatus').value, updatedAt: serverTimestamp() };
  if ($('editExpiry')) {
    const expiry = $('editExpiry').value ? new Date($('editExpiry').value) : null;
    if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) { $('editorError').textContent = 'Choose a future deadline or leave it blank.'; return; }
    changes.expiresAt = expiry ? Timestamp.fromDate(expiry) : null;
    changes.eligibility = $('editEligibility').value.trim(); changes.disputePolicy = $('editDisputePolicy').value.trim();
  }
  if (!changes.targetName || !changes.instructions || !Number.isInteger(changes.amount) || changes.amount < 5 || changes.amount > 20) { $('editorError').textContent = 'Enter a target, requirements, and a whole-dollar reward from $5 to $20.'; return; }
  saving = true; $('saveBounty').disabled = true; $('editorError').textContent = '';
  updateImageControls();
  try {
    if (editingId) {
      const reference = doc(db, 'bounties', editingId);
      await runTransaction(db, async transaction => {
        const current = await transaction.get(reference);
        if (!current.exists() || !['open', 'paused'].includes(current.data().status)) throw new Error('This bounty has closed. Refresh the board.');
        if (!current.data().updatedAt?.isEqual(editorVersion)) throw new Error('Another admin changed this bounty. Close the editor and reopen it to load the latest details.');
        transaction.update(reference, changes);
        logActivity(db, transaction, user, 'bounty-edited', 'bounties', editingId, changes.targetName);
      });
    } else {
      const reference = doc(collection(db, 'bounties')), batch = writeBatch(db);
      batch.set(reference, { ...changes, winningClaimId: '', createdAt: serverTimestamp(), createdBy: user.uid });
      logActivity(db, batch, user, 'bounty-created', 'bounties', reference.id, changes.targetName);
      await batch.commit();
    }
    if (version !== epoch) return;
    $('editorDialog').close(); toast('Bounty saved.');
  } catch (error) { if (version === epoch) $('editorError').textContent = readableError(error); }
  finally { saving = false; updateImageControls(); }
});

async function reviewClaim(id, decision, button) {
  if (!admin || reviewing) return;
  const reason = $('reason-' + id)?.value.trim() || '';
  if (decision === 'denied' && !reason) { $('review-error-' + id).textContent = 'Add a reason so the member understands the decision.'; $('reason-' + id).focus(); return; }
  const claim = claims.find(c => c.id === id); if (!claim || claim.status !== 'pending') return;
  const version = epoch, reviewerUid = user.uid;
  reviewing = true; button.disabled = true;
  try {
    await runTransaction(db, async transaction => {
      const claimRef = doc(db, 'bountyClaims', id), bountyRef = doc(db, 'bounties', claim.bountyId);
      const current = await transaction.get(claimRef), bounty = await transaction.get(bountyRef);
      if (!current.exists() || current.data().status !== 'pending') throw new Error('This claim was already reviewed. Refresh the list.');
      if (decision === 'approved') {
        if (!bounty.exists() || bounty.data().status !== 'open' || bounty.data().winningClaimId) throw new Error('This bounty is no longer open or already has a winner.');
        transaction.update(bountyRef, { status: 'claimed', winningClaimId: id, updatedAt: serverTimestamp() });
      }
      transaction.update(claimRef, { status: decision, reason, reviewedAt: serverTimestamp(), reviewerUid, updatedAt: serverTimestamp() });
      logActivity(db, transaction, user, 'claim-' + decision, 'bountyClaims', id, reason);
      notifyMember(db, transaction, current.data().ownerUid, 'claim-' + decision, id, 'Your claim for ' + current.data().targetName + ' was ' + decision + (reason ? ': ' + reason : '. Reward delivery is tracked separately.'));
    });
    if (version === epoch) toast(decision === 'approved' ? 'Claim approved. The bounty is now closed; arrange the reward separately.' : 'Claim denied. Your feedback is visible to the member.');
  } catch (error) {
    if (version === epoch) { const output = $('review-error-' + id); if (output) output.textContent = readableError(error); else showError(error); }
  } finally { reviewing = false; button.disabled = false; }
}
$('cancelRemove').addEventListener('click', () => { if (!removing) $('removeDialog').close(); });
$('removeDialog').addEventListener('cancel', e => { if (removing) e.preventDefault(); });
$('confirmRemove').addEventListener('click', async () => {
  if (!admin || !removingId || removing) return;
  const version = epoch;
  removing = true; $('confirmRemove').disabled = true; $('removeError').textContent = '';
  try {
    await runTransaction(db, async transaction => {
      const reference = doc(db, 'bounties', removingId), current = await transaction.get(reference);
      if (!current.exists()) throw new Error('This bounty no longer exists.');
      transaction.update(reference, { status: 'archived', updatedAt: serverTimestamp() });
      logActivity(db, transaction, user, 'bounty-removed', 'bounties', removingId, current.data().targetName);
    });
    if (version === epoch) { $('removeDialog').close(); toast('Bounty removed from the board. Claim history is preserved.'); }
  } catch (error) { if (version === epoch) $('removeError').textContent = readableError(error); }
  finally { removing = false; $('confirmRemove').disabled = false; }
});
document.querySelectorAll('[data-view]').forEach(tab => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
  tab.addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('[data-view]')].filter(t => !t.hidden); let next;
    if (e.key === 'ArrowRight') next = (tabs.indexOf(tab) + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (tabs.indexOf(tab) + tabs.length - 1) % tabs.length;
    if (e.key === 'Home') next = 0; if (e.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { e.preventDefault(); setView(tabs[next].dataset.view, true); }
  });
});
$('bountySearch').addEventListener('input', renderBoard);
$('showRemovedClaims').addEventListener('change', renderClaims);
$('bountyFilter').addEventListener('change', renderBoard);
$('board').addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.target) openTarget(button.dataset.target);
  if (button.dataset.claim) setView('claims', true);
  if (button.dataset.edit && admin) openEditor(button.dataset.edit);
  if (button.dataset.remove && admin) {
    const target = bounties.find(t => t.id === button.dataset.remove); if (!target) return;
    removingId = target.id; $('removeDescription').textContent = 'Remove ' + target.targetName + "'s $" + target.amount + ' bounty?';
    $('removeError').textContent = ''; $('removeDialog').showModal();
  }
  if (button.dataset.review) reviewClaim(button.dataset.review, button.dataset.decision, button);
  if (button.dataset.dispute) {
    $('disputeClaimId').value = button.dataset.dispute; $('disputeMessage').value = ''; $('disputeError').textContent = '';
    $('disputeDialog').showModal();
  }
});

$('disputeForm')?.addEventListener('submit', async event => {
  event.preventDefault(); if (!user) return;
  const id = $('disputeClaimId').value, message = $('disputeMessage').value.trim();
  if (!message) return;
  const button = $('submitDispute'); button.disabled = true;
  try { await setDoc(doc(db, 'claimDisputes', id), { claimId: id, ownerUid: user.uid, message, status: 'open', resolution: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); $('disputeDialog').close(); toast('Review requested. An admin will respond here.'); }
  catch (error) { $('disputeError').textContent = readableError(error); } finally { button.disabled = false; }
});
$('closeDispute')?.addEventListener('click', () => $('disputeDialog').close());
setInterval(() => { if (boardReady) renderBoard(); }, 30000);
