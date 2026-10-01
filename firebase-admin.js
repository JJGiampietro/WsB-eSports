import { auth, db, provider } from "./firebase-member.js?v=workspace-1";
import { watchAdmin, logActivity, notifyMember } from './admin-access.js';
import { safeProfileImage, cropProfileIcon } from './profile-image.js?v=1';
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDocs, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
  showVisibility(null);
  readyInvite = null;
  form.reset();
  memberId.value = "";
  setProfileImage("", "");
  formLabel.textContent = "NEW MEMBER";
  formTitle.innerHTML = "CREATE<br>ACCESS.";
  startNew.hidden = true;
  memberSearch.value = "";
  renderMemberPicker();
  memberPicker.value = "";
  inviteActions.hidden = true;
  updateStatus("");
}

function showEditor(record) {
  editingId = record.id;
  showVisibility(record);
  readyInvite = { id: record.id, email: emptyValue(record.invitedEmail), displayName: emptyValue(record.displayName) || record.id };
  memberId.value = record.id;
  displayName.value = emptyValue(record.displayName);
  fortniteUsername.value = emptyValue(record.fortniteUsername);
  inviteEmail.value = emptyValue(record.invitedEmail);
  profileBio.value = emptyValue(record.bio);
  const socials = record.socials || {};
  profileTikTok.value = emptyValue(socials.tiktok);
  profileTwitch.value = emptyValue(socials.twitch);
  role.value = ["member", "creator", "management", "owner", "admin"].includes(record.role) ? record.role : "member";
  status.value = ["invited", "active", "inactive"].includes(record.status) ? record.status : "invited";
  setProfileImage(record.profileImage, record.profileImage ? "Current profile icon" : "");
  resetAccess.checked = false;
  formLabel.textContent = "EDIT MEMBER";
  formTitle.innerHTML = "UPDATE<br>ACCESS.";
  startNew.hidden = false;
  memberSearch.value = "";
  renderMemberPicker();
  memberPicker.value = record.id;
  if (readyInvite.email) showInviteMessage(readyInvite);
  inviteActions.hidden = !readyInvite.email;
  updateStatus("");
  document.dispatchEvent(new Event('wsb:admin-profile-loaded'));
}

function renderMemberPicker() {
  const items = Array.from(records.values()).sort((a, b) => emptyValue(a.displayName || a.id).localeCompare(emptyValue(b.displayName || b.id)));
  const filter = emptyValue(memberSearch.value).trim().toLocaleLowerCase();
  const matches = items.filter((record) => [record.displayName, record.fortniteUsername, record.invitedEmail, record.id].join(" ").toLocaleLowerCase().includes(filter));
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
    option.textContent = (username ? `${record.displayName || record.id} (${username})` : (record.displayName || record.id)) + (record.profileHidden ? ' — Hidden profile' : '');
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
  const access = new Map(accessSnapshot.docs.map((entry) => [entry.id, entry.data()]));
  records = new Map(roster.map((member) => {
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
    await loadRecords();
    document.dispatchEvent(new Event('wsb:admin-ready'));
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
      updateStatus(hidden ? 'Profile hidden. Saved data and sign-in access are unchanged.' : 'Profile restored to the public website.');
    }
  } catch (visibilityError) {
    if (version === authEpoch) updateStatus(visibilityError.message || 'Profile visibility could not be changed.', true);
  } finally { visibilityToggle.disabled = false; }
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
  updateStatus("Saving member access...");
  try {
    const existing = records.get(id);
    if (existing?.ownerUid === auth.currentUser.uid && existing.role === 'admin'
      && (role.value !== 'admin' || status.value !== 'active' || resetAccess.checked)) throw new Error('You cannot remove your own admin access. Ask another admin to manage this account.');
    if (existing?.ownerUid && email !== existing.invitedEmail && !resetAccess.checked) throw new Error('To change the linked Gmail, select Reset profile access. The old account will lose access.');
    const shouldReset = !existing || !existing.hasAccess || resetAccess.checked;
    const existingSocials = existing && existing.socials ? existing.socials : {};
    const access = {
      memberId: id,
      displayName: name,
      fortniteUsername: username,
      invitedEmail: email,
      role: role.value,
      rosterStatus: existing ? (existing.rosterStatus || "active") : "pending",
      status: shouldReset ? "invited" : status.value,
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
    batch.set(doc(db, 'memberAccess', id), access, { merge: true });
    batch.set(doc(db, "members", id), {
        displayName: name,
        bio: profileBio.value.trim(),
        socials: {
          ...existingSocials,
          tiktok: profileTikTok.value.trim(),
          twitch: profileTwitch.value.trim()
        },
        profileImage: profileImageData,
        ...(!existing || !existing.hasProfile ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp()
      }, { merge: true });
    if (existing?.ownerUid) {
      if (!shouldReset && role.value === 'admin' && access.status === 'active') batch.set(doc(db, 'admins', existing.ownerUid), { enabled: true, memberId: id });
      else if (existing.role === 'admin') batch.delete(doc(db, 'admins', existing.ownerUid));
      if (existing.role !== role.value || shouldReset || existing.status !== access.status)
        logActivity(db, batch, auth.currentUser, 'member-access-changed', 'memberAccess', id, 'Role: ' + role.value + '; status: ' + access.status + (shouldReset ? '; account link reset' : ''));
    }
    logActivity(db, batch, auth.currentUser, existing ? 'member-edited' : 'member-invited', 'memberAccess', id, 'Role: ' + role.value);
    });
    document.dispatchEvent(new Event('wsb:admin-profile-saved'));
    readyInvite = { id, email, displayName: name };
    showInviteMessage(readyInvite);
    inviteActions.hidden = false;
    updateStatus(shouldReset && existing ? "Access reset and ready for the new Gmail invite." : "Member saved and ready to invite.");
    await loadRecords();
    if (!editingId) showEditor(records.get(id));
  } catch (saveError) {
    updateStatus(saveError.message || "Member access could not be saved.", true);
  } finally {
    save.disabled = false;
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

onAuthStateChanged(auth, (user) => {
  stopAdmin(); const version = ++authEpoch;
  isAdmin = false;
  dashboard.hidden = true;
  if (!user) {
    authPanel.hidden = false;
    hideAuthPanels();
    signedOut.hidden = false;
    return;
  }
  verifyAdmin(user, version);
});
