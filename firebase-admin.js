import { auth, db, provider } from "./firebase-member.js?v=ingraham-visual-only-20261020";
import { watchAdmin, logActivity, notifyMember } from './admin-access.js?v=membership-permissions-20261020';
import { setupAdminProfileRoles } from './admin-profile-roles.js?v=membership-permissions-20261020';
import { selectMemberView } from './admin-member-editor.js';
import { planAccountRestrictions, enforceInactiveAccounts } from './account-restrictions.js';
import { writePublicMembership, syncPublicMemberships, migrateLegacyMemberships } from './membership-directory.js?v=membership-permissions-20261020';
import { membershipLabels, membershipRoles, membershipRole, hasWebsiteAdmin } from './membership-model.js';
import './display-only-members.js';
import { safeProfileImage, cropProfileIcon } from './profile-image.js?v=1';
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const signedOut = document.getElementById("adminSignedOut");
const authPanel = document.getElementById("adminAuthPanel");
const loading = document.getElementById("adminLoading");
const denied = document.getElementById("adminDenied");
const dashboard = document.getElementById("adminDashboard");
const error = document.getElementById("adminError");
const form = document.getElementById("adminMemberForm");
const signIn = document.getElementById("adminGoogleSignIn");
const signOutButtons = [document.getElementById("adminSignOut"), document.getElementById("adminSignOutDenied")];
const startNew = document.getElementById("adminStartNew");
const memberSearch = document.getElementById("adminMemberSearch");
const memberPicker = document.getElementById("adminMemberPicker");
const formLabel = document.getElementById("adminFormLabel");
const formTitle = document.getElementById("adminFormTitle");
const memberId = document.getElementById("adminMemberId");
const displayName = document.getElementById("adminDisplayName");
const fortniteUsername = document.getElementById("adminFortniteUsername");
const inviteEmail = document.getElementById("adminInviteEmail");
const role = document.getElementById("adminRole");
const saveMembershipRole = document.getElementById('adminSaveMembershipRole');
const membershipRoleStatus = document.getElementById('adminMembershipRoleStatus');
const websiteAdmin = document.getElementById('adminWebsiteAdmin');
const saveWebsiteAccess = document.getElementById('adminSaveWebsiteAccess');
const websiteAccessStatus = document.getElementById('adminWebsiteAccessStatus');
const status = document.getElementById("adminStatus");
const resetAccess = document.getElementById("adminResetAccess");
const save = document.getElementById("adminSave");
const saveStatus = document.getElementById("adminSaveStatus");
const inviteActions = document.getElementById("adminInviteActions");
const inviteSummary = document.getElementById("adminInviteSummary");
const inviteMessage = document.getElementById("adminInviteMessage");
const prepareInvite = document.getElementById("adminPrepareInvite");
const profileImageInput = document.getElementById("adminProfileImageInput");
const profileImagePreview = document.getElementById("adminProfileImagePreview");
const profileImageName = document.getElementById("adminProfileImageName");
const profileImageRemove = document.getElementById("adminProfileImageRemove");
const profileBio = document.getElementById("adminProfileBio");
const profileTikTok = document.getElementById("adminProfileTikTok");
const profileTwitch = document.getElementById("adminProfileTwitch");
const visibilityPanel = document.getElementById('adminProfileVisibility');
const visibilityState = document.getElementById('adminVisibilityState');
const visibilityToggle = document.getElementById('adminToggleVisibility');
const accountAccessPanel = document.getElementById('adminAccountAccess');
const accountAccessToggle = document.getElementById('adminToggleAccountAccess');
function showMemberSummary(record) {
  const names = membershipLabels;
  formLabel.textContent = record ? 'EDIT MEMBER' : 'NEW MEMBER';
  formTitle.textContent = record?.displayName || 'New member.';
  const state = !record?.invitedEmail ? 'No sign-in configured' : record.status === 'inactive' ? 'Login inactive' : record.ownerUid ? 'Account linked' : 'Invitation ready';
  const summary = document.getElementById('adminSelectedStatus'), help = document.getElementById('adminMembershipRoleHelp');
  if (summary) summary.textContent = record ? (names[record.role] || 'Member') + ' membership / ' + state + (hasWebsiteAdmin(record) ? ' / Website Admin' : '') + (record.profileHidden ? ' / Hidden profile' : '') : 'Create a profile and prepare their account invitation.';
  if (help) help.textContent = record ? 'Membership controls their team section, not website permissions. Save without a Gmail; other edits are not saved.' : 'Choose their team membership. Use Save Member after adding their Gmail. Website administration is a separate permission below.';
  const image = safeProfileImage(record?.profileImage);
  const avatar = document.getElementById('adminSelectedAvatar');
  if (avatar) avatar.style.backgroundImage = image ? 'url("' + image + '")' : '';
}
function showAccountAccess(record) {
  accountAccessPanel.hidden = !record;
  const configured = Boolean(record?.hasAccess && record.invitedEmail);
  document.getElementById('adminAccessState').textContent = !configured ? 'No member login has been set up' : record.status === 'inactive' ? 'Inactive — member login blocked' : record.ownerUid ? 'Active member access' : 'Invitation available — not claimed yet';
  accountAccessToggle.disabled = !configured;
  accountAccessToggle.classList.toggle('is-restore', record?.status === 'inactive');
  accountAccessToggle.textContent = !configured ? 'NO ACCESS TO REVOKE' : record.status === 'inactive' ? 'RESTORE ACCESS' : 'DEACTIVATE ACCESS';
}

function showVisibility(record) {
  visibilityPanel.hidden = !record;
  visibilityState.textContent = record?.profileHidden ? 'Hidden from the public website' : 'Visible on the website';
  visibilityToggle.textContent = record?.profileHidden ? 'RESTORE PROFILE' : 'HIDE PROFILE';
}

let isAdmin = false;
let editingId = null;
let records = new Map();
let readyInvite = null;
let profileImageData = "";

function hideAuthPanels() {
  signedOut.hidden = true;
  loading.hidden = true;
  denied.hidden = true;
  error.hidden = true;
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function updateStatus(message, problem = false) {
  saveStatus.textContent = message || "";
  saveStatus.classList.toggle("is-problem", problem);
}

function emptyValue(value) {
  return typeof value === "string" ? value : "";
}

function makeMemberId(fortniteName) {
  const base = emptyValue(fortniteName)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "member";
  const suffix = globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 7)
    : Math.random().toString(36).slice(2, 9);
  return base + "-" + suffix;
}

function setProfileImage(value, label) {
  profileImageData = safeProfileImage(value);
  profileImagePreview.style.backgroundImage = profileImageData ? 'url("' + profileImageData + '")' : "";
  profileImagePreview.classList.toggle("member-avatar-preview-empty", !profileImageData);
  profileImageName.textContent = profileImageData ? (label || "Current profile icon") : "No icon selected";
  profileImageRemove.hidden = !profileImageData;
}

function buildInviteMessage(invite) {
  const profileUrl = ['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin + '/member-account.html' : 'https://wsb-esports.web.app/member-account.html';
  return `Hi ${invite.displayName},\n\nYour WsB member profile is ready to claim. Open this link and select Continue with Google:\n${profileUrl}\n\nPlease sign in with this exact Gmail address: ${invite.email}\n\nAfter you claim it, you can update your public display name, bio, and social links.\n\n- WsB eSports`;
}

function showInviteMessage(invite) {
  if (!invite || !invite.email) return;
  inviteSummary.textContent = `Copy this message and send it to ${invite.email}.`;
  inviteMessage.value = buildInviteMessage(invite);
}

function resetForm() {
  editingId = null;
  saveMembershipRole.disabled = true; membershipRoleStatus.textContent = '';
  saveWebsiteAccess.disabled = true; websiteAccessStatus.textContent = '';
  showVisibility(null);
  showAccountAccess(null);
  readyInvite = null;
  form.reset();
  memberId.value = "";
  setProfileImage("", "");
  showMemberSummary(null); selectMemberView('profile');
  startNew.hidden = true;
  memberSearch.value = "";
  renderMemberPicker();
  memberPicker.value = "";
  inviteActions.hidden = true;
  updateStatus("");
}

function showEditor(record) {
  editingId = record.id;
  saveMembershipRole.disabled = false; membershipRoleStatus.textContent = '';
  saveWebsiteAccess.disabled = false; websiteAccessStatus.textContent = '';
  showVisibility(record);
  showAccountAccess(record);
  readyInvite = { id: record.id, email: emptyValue(record.invitedEmail), displayName: emptyValue(record.displayName) || record.id };
  memberId.value = record.id;
  displayName.value = emptyValue(record.displayName);
  fortniteUsername.value = emptyValue(record.fortniteUsername);
  inviteEmail.value = emptyValue(record.invitedEmail);
  profileBio.value = emptyValue(record.bio);
  const socials = record.socials || {};
  profileTikTok.value = emptyValue(socials.tiktok);
  profileTwitch.value = emptyValue(socials.twitch);
  role.value = membershipRole(record);
  websiteAdmin.checked = hasWebsiteAdmin(record);
  status.value = ["invited", "active", "inactive"].includes(record.status) ? record.status : "invited";
  setProfileImage(record.profileImage, record.profileImage ? "Current profile icon" : "");
  resetAccess.checked = false;
  showMemberSummary(record);
  startNew.hidden = false;
  memberSearch.value = "";
  renderMemberPicker();
  memberPicker.value = record.id;
  if (readyInvite.email) showInviteMessage(readyInvite);
  inviteActions.hidden = !readyInvite.email || record.status === 'inactive';
  updateStatus("");
  document.dispatchEvent(new Event('wsb:admin-profile-loaded'));
}

function renderMemberPicker() {
  const items = Array.from(records.values()).sort((a, b) => emptyValue(a.displayName || a.id).localeCompare(emptyValue(b.displayName || b.id)));
  const filter = emptyValue(memberSearch.value).trim().toLocaleLowerCase();
  const matches = items.filter((record) => [record.displayName, record.fortniteUsername, record.invitedEmail, record.id].join(" ").toLocaleLowerCase().includes(filter));
  const count = document.getElementById('adminRosterCount');
  if (count) count.textContent = items.length ? (filter ? matches.length + ' matching / ' : '') + items.length + ' members in the roster' : 'Loading the roster…';
  const selectedId = editingId || memberPicker.value;
  memberPicker.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = matches.length ? "Choose a member to edit" : "No matching members";
  placeholder.disabled = !matches.length;
  memberPicker.append(placeholder);
  matches.forEach((record) => {
    const option = document.createElement("option");
    option.value = record.id;
    const username = emptyValue(record.fortniteUsername);
    option.textContent = (username ? `${record.displayName || record.id} (${username})` : (record.displayName || record.id)) + (record.profileHidden ? ' — Hidden profile' : '') + (record.status === 'inactive' ? ' — Inactive access' : '');
    memberPicker.append(option);
  });
  memberPicker.disabled = !items.length;
  if (selectedId && matches.some((record) => record.id === selectedId)) memberPicker.value = selectedId;
}

async function loadRecords() {
  const [accessSnapshot, profileSnapshot, roster, visibilitySnapshot] = await Promise.all([
    getDocs(collection(db, "memberAccess")),
    getDocs(collection(db, "members")),
    fetch("data/roster.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
    getDocs(collection(db, 'memberVisibility'))
  ]);
  const profiles = new Map(profileSnapshot.docs.map((entry) => [entry.id, entry.data()]));
  const access = new Map(accessSnapshot.docs.filter(entry => !globalThis.WsbDisplayOnly.isDisplayOnlyMember(entry.id)).map((entry) => [entry.id, entry.data()]));
  if (await migrateLegacyMemberships(access, auth.currentUser)) return loadRecords();
  await enforceInactiveAccounts(access, auth.currentUser);
  await syncPublicMemberships(access);
  records = new Map(roster.filter(member => !globalThis.WsbDisplayOnly.isDisplayOnlyMember(member.id)).map((member) => {
    const profile = profiles.get(member.id) || {};
    const memberAccess = access.get(member.id) || {};
    return [member.id, {
      id: member.id,
      displayName: profile.displayName || member.displayName,
      profileImage: profile.profileImage,
      bio: profile.bio || "",
      socials: profile.socials || {},
      fortniteUsername: memberAccess.fortniteUsername || member.username,
      ...memberAccess,
      displayName: profile.displayName || memberAccess.displayName || member.displayName,
      hasAccess: access.has(member.id),
      hasProfile: profiles.has(member.id), accessVersion: memberAccess.updatedAt || null, profileVersion: profile.updatedAt || null
    }];
  }));
  access.forEach((memberAccess, id) => {
    if (records.has(id)) return;
    const profile = profiles.get(id) || {};
    records.set(id, { id, ...profile, ...memberAccess, displayName: profile.displayName || memberAccess.displayName, hasAccess: true, hasProfile: profiles.has(id), accessVersion: memberAccess.updatedAt || null, profileVersion: profile.updatedAt || null });
  });
  const hiddenIds = new Set(visibilitySnapshot.docs.filter(entry => entry.data().hidden === true).map(entry => entry.id));
  records.forEach(record => { record.profileHidden = hiddenIds.has(record.id); });
  renderMemberPicker();
}

let stopAdmin = () => {}, authEpoch = 0;
async function verifyAdmin(user, version) {
  authPanel.hidden = false;
  hideAuthPanels();
  loading.hidden = false;
  try {
    stopAdmin = watchAdmin(db, user, async allowed => {
    if (version !== authEpoch) return;
    if (!allowed) {
      isAdmin = false;
      hideAuthPanels();
      authPanel.hidden = false;
      denied.hidden = false;
      dashboard.hidden = true;
      records.clear(); memberPicker.textContent = ''; form.reset();
      return;
    }
    if (isAdmin) return;
    isAdmin = true;
    hideAuthPanels();
    authPanel.hidden = true;
    dashboard.hidden = false;
    resetForm();
    try {
      await loadRecords();
      if (version !== authEpoch || !isAdmin || auth.currentUser?.uid !== user.uid) return;
      document.dispatchEvent(new Event('wsb:admin-ready'));
    } catch (loadError) {
      // Revocation can reject an in-flight read before the access watcher fires.
      // Hide the workspace safely; never leak an unhandled rejection or reopen it.
      if (version !== authEpoch || !isAdmin || !auth.currentUser) return;
      isAdmin = false; records.clear(); memberPicker.textContent = ''; form.reset();
      hideAuthPanels(); authPanel.hidden = false; dashboard.hidden = true; signedOut.hidden = false;
      showError('Admin access changed or team data could not be loaded. Reload the page to try again.');
    }
    });
  } catch (loadError) {
    hideAuthPanels();
    authPanel.hidden = false;
    signedOut.hidden = false;
    showError(loadError.message || "Admin access could not be verified.");
  }
}

signIn.addEventListener("click", async () => {
  authPanel.hidden = false;
  hideAuthPanels();
  loading.hidden = false;
  try {
    await signInWithPopup(auth, provider);
  } catch (signInError) {
    hideAuthPanels();
    signedOut.hidden = false;
    showError(signInError.code === "auth/popup-closed-by-user" ? "Sign-in was cancelled." : "Google sign-in could not be completed. Please try again.");
  }
});

signOutButtons.forEach((button) => button && button.addEventListener("click", () => signOut(auth)));
startNew.addEventListener("click", resetForm);
memberSearch.addEventListener("input", renderMemberPicker);
memberPicker.addEventListener("change", () => {
  const record = records.get(memberPicker.value);
  if (record) showEditor(record);
});

saveMembershipRole.addEventListener('click', async () => {
  const record = records.get(editingId), user = auth.currentUser, version = authEpoch, nextRole = role.value;
  if (!isAdmin || !record || !user || !membershipRoles.includes(nextRole)) return;
  const report = (message, problem = false) => { membershipRoleStatus.textContent = message; membershipRoleStatus.classList.toggle('is-problem', problem); };
  saveMembershipRole.disabled = true; saveWebsiteAccess.disabled = true; save.disabled = true; accountAccessToggle.disabled = true;
  report('Saving membership role…');
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'memberAccess', record.id), snapshot = await transaction.get(ref), current = snapshot.data();
      if (!isAdmin || version !== authEpoch) throw new Error('Admin access changed. Sign in again.');
      const sameTime = (a, b) => (!a && !b) || Boolean(a?.isEqual?.(b));
      if (snapshot.exists() !== record.hasAccess || (current && (!sameTime(current.updatedAt, record.accessVersion) || current.role !== record.role || current.status !== record.status || current.ownerUid !== record.ownerUid))) throw new Error('This member’s access changed. Refresh and select the member again before saving.');
      if (current) transaction.update(ref, { role: nextRole, websiteAdmin: hasWebsiteAdmin(current), updatedAt: serverTimestamp() });
      else transaction.set(ref, {
        memberId: record.id, displayName: record.displayName || record.id, fortniteUsername: record.fortniteUsername || '',
        role: nextRole, websiteAdmin: false, invitedEmail: '', ownerUid: null, claimedAt: null, status: 'invited', rosterStatus: 'active',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      writePublicMembership(transaction, record.id, nextRole);
      // A membership-only change never grants or revokes website administration.
      logActivity(db, transaction, user, 'member-role-changed', 'memberAccess', record.id, 'Role: ' + nextRole);
    });
    const snapshot = await getDoc(doc(db, 'memberAccess', record.id));
    if (!isAdmin || version !== authEpoch) return;
    Object.assign(record, snapshot.data(), { hasAccess: true, accessVersion: snapshot.data().updatedAt });
    renderMemberPicker();
    if (editingId === record.id) {
      showAccountAccess(record);
      showMemberSummary(record);
      document.dispatchEvent(new Event('wsb:admin-membership-saved'));
      report('Membership role saved.' + (!record.invitedEmail ? ' No login invitation was created. Add a Gmail when they want account access.' : '') + ' Other profile edits were not saved.');
    }
  } catch (error) { if (version === authEpoch && editingId === record.id) report(error.message || 'Membership role could not be saved.', true); }
  finally { save.disabled = false; saveMembershipRole.disabled = !editingId || !isAdmin; saveWebsiteAccess.disabled = !editingId || !isAdmin; showAccountAccess(records.get(editingId)); }
});

saveWebsiteAccess.addEventListener('click', async () => {
  const record = records.get(editingId), user = auth.currentUser, version = authEpoch, enabled = websiteAdmin.checked;
  if (!isAdmin || !record || !user) return;
  const report = (message, problem = false) => { websiteAccessStatus.textContent = message; websiteAccessStatus.classList.toggle('is-problem', problem); };
  if (!enabled && (record.ownerUid === user.uid || record.invitedEmail?.toLowerCase() === user.email?.toLowerCase())) { report('You cannot remove your own admin access. Ask another admin.', true); return; }
  if (enabled && !hasWebsiteAdmin(record) && !confirm('Grant website administration to ' + record.displayName + '? They can manage members, permissions, events, announcements and bounties once their linked account is active.')) return;
  saveWebsiteAccess.disabled = true; saveMembershipRole.disabled = true; save.disabled = true; accountAccessToggle.disabled = true;
  report('Saving website permission…');
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'memberAccess', record.id), snapshot = await transaction.get(ref), current = snapshot.data();
      const sameTime = (a, b) => (!a && !b) || Boolean(a?.isEqual?.(b));
      if (!isAdmin || version !== authEpoch) throw new Error('Admin access changed. Sign in again.');
      if (snapshot.exists() !== record.hasAccess || (current && (!sameTime(current.updatedAt, record.accessVersion) || current.ownerUid !== record.ownerUid || current.status !== record.status || current.role !== record.role))) throw new Error('This member’s access changed. Refresh and select the member again before saving.');
      if (current) transaction.update(ref, { websiteAdmin: enabled, updatedAt: serverTimestamp() });
      else transaction.set(ref, { memberId: record.id, displayName: record.displayName || record.id, fortniteUsername: record.fortniteUsername || '', role: membershipRole(record), websiteAdmin: enabled, invitedEmail: '', ownerUid: null, claimedAt: null, status: 'invited', rosterStatus: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (!current) writePublicMembership(transaction, record.id, membershipRole(record));
      if (current?.ownerUid) {
        if (enabled && current.status === 'active') transaction.set(doc(db, 'admins', current.ownerUid), { enabled: true, memberId: record.id });
        else if (!enabled) transaction.delete(doc(db, 'admins', current.ownerUid));
      }
      logActivity(db, transaction, user, 'website-admin-permission-changed', 'memberAccess', record.id, 'Website Admin: ' + (enabled ? 'enabled' : 'disabled'));
    });
    const snapshot = await getDoc(doc(db, 'memberAccess', record.id));
    if (!isAdmin || version !== authEpoch) return;
    Object.assign(record, snapshot.data(), { hasAccess: true, accessVersion: snapshot.data().updatedAt });
    renderMemberPicker();
    if (editingId === record.id) {
      showAccountAccess(record); showMemberSummary(record);
      document.dispatchEvent(new Event('wsb:admin-permission-saved'));
      report('Website permission saved. Membership and other profile edits were not changed.' + (enabled && record.status !== 'active' ? ' Admin tools become available after their linked account is active.' : ''));
    }
  } catch (error) { if (version === authEpoch && editingId === record.id) report(error.message || 'Website permission could not be saved.', true); }
  finally { save.disabled = false; saveMembershipRole.disabled = !editingId || !isAdmin; saveWebsiteAccess.disabled = !editingId || !isAdmin; showAccountAccess(records.get(editingId)); }
});

visibilityToggle.addEventListener('click', async () => {
  const record = records.get(editingId), user = auth.currentUser, version = authEpoch;
  if (!isAdmin || !record || !user) return;
  const hidden = !record.profileHidden;
  if (!confirm((hidden ? 'Hide ' : 'Restore ') + record.displayName + '? ' + (hidden ? 'Their public profile and stats will no longer appear on the website.' : 'Their public profile and saved stats will appear again.') + ' No data is deleted, and account access stays unchanged. Other unsaved edits will not be saved.')) return;
  visibilityToggle.disabled = true;
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'memberVisibility', record.id), current = await transaction.get(ref);
      if (version !== authEpoch || !isAdmin) throw new Error('Admin access changed. Sign in again.');
      if ((current.data()?.hidden === true) !== Boolean(record.profileHidden)) throw new Error('Visibility changed while you were editing. Refresh and select the member again.');
      transaction.set(ref, { hidden, updatedAt: serverTimestamp() });
      logActivity(db, transaction, user, hidden ? 'member-hidden' : 'member-restored', 'memberVisibility', record.id);
    });
    if (version !== authEpoch || !isAdmin) return;
    record.profileHidden = hidden;
    renderMemberPicker();
    if (editingId === record.id) {
      showVisibility(record);
      showMemberSummary(record);
      updateStatus(hidden ? 'Profile hidden. Saved data and sign-in access are unchanged.' : 'Profile restored to the public website.');
    }
  } catch (visibilityError) {
    if (version === authEpoch) updateStatus(visibilityError.message || 'Profile visibility could not be changed.', true);
  } finally { visibilityToggle.disabled = false; }
});

accountAccessToggle.addEventListener('click', async () => {
  const record = records.get(editingId), user = auth.currentUser, version = authEpoch;
  if (!isAdmin || !user || !record?.hasAccess || !record.invitedEmail) return;
  const nextStatus = record.status === 'inactive' ? (record.ownerUid ? 'active' : 'invited') : 'inactive';
  if (nextStatus === 'inactive' && (record.ownerUid === user.uid || record.invitedEmail.toLowerCase() === user.email?.toLowerCase())) { updateStatus('You cannot deactivate your own account. Ask another admin.', true); return; }
  if (!confirm((nextStatus === 'inactive' ? 'Deactivate ' : 'Restore access for ') + record.displayName + '? ' + (nextStatus === 'inactive' ? 'They will be signed out and blocked from member/admin features.' : 'They can sign in again with their linked Gmail.') + ' Saved data and public visibility stay unchanged. Other unsaved edits are not saved.')) return;
  accountAccessToggle.disabled = true; save.disabled = true; saveWebsiteAccess.disabled = true;
  saveMembershipRole.disabled = true;
  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, 'memberAccess', record.id), snapshot = await transaction.get(ref), current = snapshot.data();
      if (!isAdmin || version !== authEpoch) throw new Error('Admin access changed. Sign in again.');
      const sameVersion = (!current?.updatedAt && !record.accessVersion) || Boolean(current?.updatedAt?.isEqual?.(record.accessVersion));
      if (!snapshot.exists() || current.status !== record.status || current.ownerUid !== record.ownerUid || !sameVersion) throw new Error('This account changed while you were editing. Refresh and select the member again.');
      const next = { ...current, status: nextStatus };
      const writeRestrictions = await planAccountRestrictions(transaction, record.id, current, next, user);
      transaction.update(ref, { status: nextStatus, updatedAt: serverTimestamp() });
      writeRestrictions();
      if (current.ownerUid && hasWebsiteAdmin(current)) {
        if (nextStatus === 'active') transaction.set(doc(db, 'admins', current.ownerUid), { enabled: true, memberId: record.id });
        else transaction.delete(doc(db, 'admins', current.ownerUid));
      }
      logActivity(db, transaction, user, nextStatus === 'inactive' ? 'member-deactivated' : 'member-reactivated', 'memberAccess', record.id, 'Status: ' + nextStatus);
    });
    const snapshot = await getDoc(doc(db, 'memberAccess', record.id));
    if (!isAdmin || version !== authEpoch) return;
    Object.assign(record, snapshot.data(), { accessVersion: snapshot.data().updatedAt });
    renderMemberPicker();
    if (editingId === record.id) {
      status.value = nextStatus; showAccountAccess(record); showMemberSummary(record);
      inviteActions.hidden = nextStatus === 'inactive' || !readyInvite?.email;
      document.dispatchEvent(new Event('wsb:admin-access-saved'));
      updateStatus(nextStatus === 'inactive' ? 'Access deactivated. Member sessions are signed out; protected features are blocked.' : 'Account access restored. The member can sign in again.');
    }
  } catch (error) { if (version === authEpoch) updateStatus(error.message || 'Account access could not be changed.', true); }
  finally { save.disabled = false; saveMembershipRole.disabled = !editingId || !isAdmin; saveWebsiteAccess.disabled = !editingId || !isAdmin; if (editingId === record.id) showAccountAccess(record); }
});

profileImageInput.addEventListener("change", async () => {
  const file = profileImageInput.files && profileImageInput.files[0];
  if (!file) return;
  const imageEpoch = authEpoch, imageMember = editingId;
  profileImageInput.disabled = true;
  updateStatus("Preparing the profile icon...");
  try {
    const image = await cropProfileIcon(file); if (imageEpoch !== authEpoch || imageMember !== editingId || !isAdmin) return; if (!image) { updateStatus('Image selection cancelled.'); return; }
    setProfileImage(image, file.name);
    updateStatus("Icon ready. Save member to publish it.");
  } catch (imageError) {
    profileImageInput.value = "";
    updateStatus(imageError.message || "That image could not be used.", true);
  } finally {
    profileImageInput.disabled = false;
  }
});

profileImageRemove.addEventListener("click", () => {
  profileImageInput.value = "";
  setProfileImage("", "");
  updateStatus("Icon will be removed when you save the member.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin) return;
  const name = displayName.value.trim();
  const email = inviteEmail.value.trim().toLowerCase();
  const username = fortniteUsername.value.trim();
  if (!name || !email || !username) {
    updateStatus("Display name, Fortnite username, and Gmail are required.", true);
    return;
  }
  const id = editingId || memberId.value || makeMemberId(username);
  memberId.value = id;
  save.disabled = true;
  accountAccessToggle.disabled = true;
  saveMembershipRole.disabled = true;
  saveWebsiteAccess.disabled = true;
  updateStatus("Saving member access...");
  try {
    const existing = records.get(id);
    if ((existing?.ownerUid === auth.currentUser.uid || existing?.invitedEmail?.toLowerCase() === auth.currentUser.email?.toLowerCase())
      && (!websiteAdmin.checked || status.value !== 'active' || resetAccess.checked)) throw new Error('You cannot remove your own admin access. Ask another admin to manage this account.');
    if (!membershipRoles.includes(role.value)) throw new Error('Choose a valid membership.');
    if (websiteAdmin.checked && !hasWebsiteAdmin(existing) && !confirm('Grant website administration to ' + name + '? This permission is separate from their membership.')) return;
    if (existing?.ownerUid && email !== existing.invitedEmail && !resetAccess.checked) throw new Error('To change the linked Gmail, select Reset profile access. The old account will lose access.');
    const shouldReset = !existing || !existing.hasAccess || resetAccess.checked;
    const existingSocials = existing && existing.socials ? existing.socials : {};
    const profileDraft = { displayName: name, bio: profileBio.value.trim(), socials: { ...existingSocials, tiktok: profileTikTok.value.trim(), twitch: profileTwitch.value.trim() }, profileImage: profileImageData };
    const access = {
      memberId: id,
      displayName: name,
      fortniteUsername: username,
      invitedEmail: email,
      role: role.value,
      websiteAdmin: websiteAdmin.checked,
      rosterStatus: existing ? (existing.rosterStatus || "active") : "pending",
      status: status.value === 'inactive' ? 'inactive' : shouldReset ? "invited" : status.value,
      updatedAt: serverTimestamp()
    };
    if (!existing || !existing.hasAccess) {
      access.ownerUid = null;
      access.claimedAt = null;
      access.createdAt = serverTimestamp();
    } else if (shouldReset) {
      access.ownerUid = null;
      access.claimedAt = null;
    }
    await runTransaction(db, async batch => {
    const currentAccess = await batch.get(doc(db, 'memberAccess', id)), currentProfile = await batch.get(doc(db, 'members', id));
    const sameTime = (a, b) => (!a && !b) || Boolean(a?.isEqual?.(b));
    if (existing?.hasAccess && (!currentAccess.exists() || !sameTime(existing.accessVersion, currentAccess.data().updatedAt)
      || existing.ownerUid !== currentAccess.data().ownerUid || existing.status !== currentAccess.data().status || existing.role !== currentAccess.data().role))
      throw new Error('This member’s access changed while you were editing. Select the member again after refreshing to load the latest record.');
    if (existing?.hasProfile && (!currentProfile.exists() || !sameTime(existing.profileVersion, currentProfile.data().updatedAt)))
      throw new Error('The public profile changed while you were editing. Refresh and select the member again to avoid overwriting their changes.');
    const writeRestrictions = await planAccountRestrictions(batch, id, currentAccess.data(), access, auth.currentUser);
    batch.set(doc(db, 'memberAccess', id), access, { merge: true });
    writePublicMembership(batch, id, access.role);
    writeRestrictions();
    batch.set(doc(db, "members", id), {
        ...profileDraft,
        ...(!existing || !existing.hasProfile ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp()
      }, { merge: true });
    if (existing?.ownerUid) {
      if (!shouldReset && access.websiteAdmin && access.status === 'active') batch.set(doc(db, 'admins', existing.ownerUid), { enabled: true, memberId: id });
      else if (hasWebsiteAdmin(existing)) batch.delete(doc(db, 'admins', existing.ownerUid));
      if (existing.role !== access.role || shouldReset || existing.status !== access.status)
        logActivity(db, batch, auth.currentUser, 'member-access-changed', 'memberAccess', id, 'Role: ' + access.role + '; status: ' + access.status + (shouldReset ? '; account link reset' : ''));
    }
    logActivity(db, batch, auth.currentUser, existing ? 'member-edited' : 'member-invited', 'memberAccess', id, 'Role: ' + access.role);
    if (hasWebsiteAdmin(existing) !== access.websiteAdmin) logActivity(db, batch, auth.currentUser, 'website-admin-permission-changed', 'memberAccess', id, 'Website Admin: ' + (access.websiteAdmin ? 'enabled' : 'disabled'));
    if (existing?.status !== access.status && (access.status === 'inactive' || existing?.status === 'inactive'))
      logActivity(db, batch, auth.currentUser, access.status === 'inactive' ? 'member-deactivated' : 'member-reactivated', 'memberAccess', id, 'Status: ' + access.status);
    });
    document.dispatchEvent(new Event('wsb:admin-profile-saved'));
    await loadRecords();
    if (editingId) { showAccountAccess(records.get(editingId)); showMemberSummary(records.get(editingId)); }
    if (!editingId) showEditor(records.get(id));
    readyInvite = { id, email, displayName: name };
    showInviteMessage(readyInvite);
    inviteActions.hidden = access.status === 'inactive';
    updateStatus(access.status === 'inactive' ? 'Member saved with inactive access. Login and protected features are blocked.' : shouldReset && existing ? "Access reset and ready for the new Gmail invite." : "Member saved and ready to invite.");
  } catch (saveError) {
    updateStatus(saveError.message || "Member access could not be saved.", true);
  } finally {
    save.disabled = false;
    saveMembershipRole.disabled = !editingId || !isAdmin;
    saveWebsiteAccess.disabled = !editingId || !isAdmin;
    showAccountAccess(records.get(editingId));
  }
});

prepareInvite.addEventListener("click", () => {
  if (!readyInvite || !readyInvite.email) return;
  const message = buildInviteMessage(readyInvite);
  inviteMessage.value = message;
  navigator.clipboard.writeText(message).then(() => {
    prepareInvite.innerHTML = "INVITE COPIED <b>✓</b>";
    window.setTimeout(() => { prepareInvite.innerHTML = "COPY INVITE MESSAGE <b>⧉</b>"; }, 2000);
  }).catch(() => {
    inviteMessage.focus();
    inviteMessage.select();
    prepareInvite.innerHTML = "MESSAGE SELECTED <b>→</b>";
  });
});

setupAdminProfileRoles();

onAuthStateChanged(auth, (user) => {
  stopAdmin(); const version = ++authEpoch;
  isAdmin = false;
  dashboard.hidden = true;
  records.clear(); resetForm();
  if (!user) {
    authPanel.hidden = false;
    hideAuthPanels();
    signedOut.hidden = false;
    return;
  }
  verifyAdmin(user, version);
});
