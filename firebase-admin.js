import { auth, db, provider } from "./firebase-member.js?v=20260927-account-indicator";
import { onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
const list = document.getElementById("adminMemberList");
const count = document.getElementById("adminDirectoryCount");
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

function safeProfileImage(value) {
  const image = emptyValue(value);
  return image.length <= 200000 && /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image) ? image : "";
}

function setProfileImage(value, label) {
  profileImageData = safeProfileImage(value);
  profileImagePreview.style.backgroundImage = profileImageData ? 'url("' + profileImageData + '")' : "";
  profileImagePreview.classList.toggle("member-avatar-preview-empty", !profileImageData);
  profileImageName.textContent = profileImageData ? (label || "Current profile icon") : "No icon selected";
  profileImageRemove.hidden = !profileImageData;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function canvasAsBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

async function makeProfileIcon(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error("The image could not be opened."));
      source.src = objectUrl;
    });
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const startX = Math.max(0, (image.naturalWidth - crop) / 2);
    const startY = Math.max(0, (image.naturalHeight - crop) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.getContext("2d").drawImage(image, startX, startY, crop, crop, 0, 0, 256, 256);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await canvasAsBlob(canvas, quality);
      if (blob && blob.size <= 145000) return fileAsDataUrl(blob);
    }
    throw new Error("That image could not be made small enough. Try another image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function buildInviteMessage(invite) {
  const profileUrl = new URL("member-account.html", window.location.href).href;
  return `Hi ${invite.displayName},\n\nYour WsB member profile is ready to claim. Open this link and select Continue with Google:\n${profileUrl}\n\nPlease sign in with this exact Gmail address: ${invite.email}\n\nAfter you claim it, you can update your public display name, bio, and social links.\n\n- WsB eSports`;
}

function showInviteMessage(invite) {
  if (!invite || !invite.email) return;
  inviteSummary.textContent = `Copy this message and send it to ${invite.email}.`;
  inviteMessage.value = buildInviteMessage(invite);
}

function resetForm() {
  editingId = null;
  readyInvite = null;
  form.reset();
  setProfileImage("", "");
  memberId.disabled = false;
  formLabel.textContent = "NEW MEMBER";
  formTitle.innerHTML = "CREATE<br>ACCESS.";
  startNew.hidden = true;
  inviteActions.hidden = true;
  updateStatus("");
}

function showEditor(record) {
  editingId = record.id;
  readyInvite = { id: record.id, email: emptyValue(record.invitedEmail), displayName: emptyValue(record.displayName) || record.id };
  memberId.value = record.id;
  memberId.disabled = true;
  displayName.value = emptyValue(record.displayName);
  fortniteUsername.value = emptyValue(record.fortniteUsername);
  inviteEmail.value = emptyValue(record.invitedEmail);
  role.value = ["member", "creator", "management", "owner"].includes(record.role) ? record.role : "member";
  status.value = ["invited", "active", "inactive"].includes(record.status) ? record.status : "invited";
  setProfileImage(record.profileImage, record.profileImage ? "Current profile icon" : "");
  resetAccess.checked = false;
  formLabel.textContent = "EDIT MEMBER";
  formTitle.innerHTML = "UPDATE<br>ACCESS.";
  startNew.hidden = false;
  if (readyInvite.email) showInviteMessage(readyInvite);
  inviteActions.hidden = !readyInvite.email;
  updateStatus("");
  document.querySelector(".admin-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDirectory() {
  const items = Array.from(records.values()).sort((a, b) => emptyValue(a.displayName || a.id).localeCompare(emptyValue(b.displayName || b.id)));
  count.textContent = `${items.length} ${items.length === 1 ? "MEMBER" : "MEMBERS"}`;
  list.textContent = "";
  if (!items.length) {
    list.innerHTML = '<p class="admin-directory-empty">No member profile access has been created yet.</p>';
    return;
  }
  items.forEach((record) => {
    const card = document.createElement("article");
    card.className = "admin-member-row";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = record.displayName || record.id;
    const meta = document.createElement("p");
    const inviteState = record.invitedEmail || (record.hasAccess ? "No Gmail added" : "Not invited yet");
    meta.textContent = [inviteState, record.status || "not invited", record.role || "member"].join(" · ");
    details.append(title, meta);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "member-text-button";
    action.textContent = "EDIT →";
    action.addEventListener("click", () => showEditor(record));
    card.append(details, action);
    list.append(card);
  });
}

async function loadRecords() {
  const [accessSnapshot, profileSnapshot, roster] = await Promise.all([
    getDocs(collection(db, "memberAccess")),
    getDocs(collection(db, "members")),
    fetch("data/roster.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : [])
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
      fortniteUsername: memberAccess.fortniteUsername || member.username,
      ...memberAccess,
      hasAccess: access.has(member.id),
      hasProfile: profiles.has(member.id)
    }];
  }));
  access.forEach((memberAccess, id) => {
    if (records.has(id)) return;
    const profile = profiles.get(id) || {};
    records.set(id, { id, ...profile, ...memberAccess, hasAccess: true, hasProfile: profiles.has(id) });
  });
  renderDirectory();
}

async function verifyAdmin(user) {
  authPanel.hidden = false;
  hideAuthPanels();
  loading.hidden = false;
  try {
    const adminDoc = await getDoc(doc(db, "admins", user.uid));
    if (!adminDoc.exists()) {
      isAdmin = false;
      hideAuthPanels();
      authPanel.hidden = false;
      denied.hidden = false;
      dashboard.hidden = true;
      return;
    }
    isAdmin = true;
    hideAuthPanels();
    authPanel.hidden = true;
    dashboard.hidden = false;
    resetForm();
    await loadRecords();
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

profileImageInput.addEventListener("change", async () => {
  const file = profileImageInput.files && profileImageInput.files[0];
  if (!file) return;
  profileImageInput.disabled = true;
  updateStatus("Preparing the profile icon...");
  try {
    setProfileImage(await makeProfileIcon(file), file.name);
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
  const id = (editingId || memberId.value.trim().toLowerCase()).trim();
  if (!/^[a-z0-9-]+$/.test(id)) {
    updateStatus("Member ID can use lowercase letters, numbers, and hyphens only.", true);
    memberId.focus();
    return;
  }
  const name = displayName.value.trim();
  const email = inviteEmail.value.trim().toLowerCase();
  if (!name || !email) {
    updateStatus("Display name and Gmail are required.", true);
    return;
  }
  save.disabled = true;
  updateStatus("Saving member access...");
  try {
    const existing = records.get(id);
    const shouldReset = !existing || !existing.hasAccess || resetAccess.checked;
    const access = {
      memberId: id,
      fortniteUsername: fortniteUsername.value.trim(),
      invitedEmail: email,
      role: role.value,
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
    await Promise.all([
      setDoc(doc(db, "memberAccess", id), access, { merge: true }),
      setDoc(doc(db, "members", id), {
        displayName: name,
        profileImage: profileImageData,
        ...(!existing || !existing.hasProfile ? { bio: "", socials: {}, createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp()
      }, { merge: true })
    ]);
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
  isAdmin = false;
  dashboard.hidden = true;
  if (!user) {
    authPanel.hidden = false;
    hideAuthPanels();
    signedOut.hidden = false;
    return;
  }
  verifyAdmin(user);
});
