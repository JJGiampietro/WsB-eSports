import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { GoogleAuthProvider, browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUWKr1e9ZIcW0iCr08ykhTvmCqEcr2qGI",
  authDomain: "wsb-esports.firebaseapp.com",
  projectId: "wsb-esports",
  storageBucket: "wsb-esports.firebasestorage.app",
  messagingSenderId: "999242676867",
  appId: "1:999242676867:web:64488c17d1109c5d03f9b6",
  measurementId: "G-HMPPEWJ4NM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const authReady = setPersistence(auth, browserLocalPersistence);

const signedOut = document.getElementById("accountSignedOut");
const loading = document.getElementById("accountLoading");
const notLinked = document.getElementById("accountNotLinked");
const adminOnly = document.getElementById("accountAdminOnly");
const form = document.getElementById("memberProfileForm");
const error = document.getElementById("accountError");
const signInButton = document.getElementById("googleSignIn");
const signOutButtons = [document.getElementById("signOut"), document.getElementById("signOutForm"), document.getElementById("signOutAdmin")];
const uidOutput = document.getElementById("accountUid");
const copyUidButton = document.getElementById("copyAccountUid");
const emailOutput = document.getElementById("accountEmail");
const unlinkedEmailOutput = document.getElementById("unlinkedAccountEmail");
const adminEmailOutput = document.getElementById("adminAccountEmail");
const displayName = document.getElementById("profileDisplayName");
const bio = document.getElementById("profileBio");
const bioCount = document.getElementById("bioCount");
const saveStatus = document.getElementById("memberSaveStatus");
const saveButton = document.getElementById("profileSave");
const profileImageInput = document.getElementById("profileImageInput");
const profileImagePreview = document.getElementById("profileImagePreview");
const profileImageName = document.getElementById("profileImageName");
const profileImageRemove = document.getElementById("profileImageRemove");
const isAccountPage = Boolean(signedOut && loading && notLinked && form && signInButton);

let linkedMemberId = null;
let profileImageData = "";
let publicProfiles = null;
let publicRoster = null;

function hideAll() {
  signedOut.hidden = true;
  loading.hidden = true;
  notLinked.hidden = true;
  adminOnly.hidden = true;
  form.hidden = true;
  error.hidden = true;
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function safeText(value) {
  return typeof value === "string" ? value : "";
}

function safeProfileImage(value) {
  const image = safeText(value);
  return image.length <= 200000 && /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image) ? image : "";
}

function setProfileImage(value, label) {
  profileImageData = safeProfileImage(value);
  if (!profileImagePreview || !profileImageName || !profileImageRemove) return;
  profileImagePreview.style.backgroundImage = profileImageData ? 'url("' + profileImageData + '")' : "";
  profileImagePreview.classList.toggle("member-avatar-preview-empty", !profileImageData);
  profileImageName.textContent = profileImageData ? (label || "Current profile icon") : "No icon selected";
  profileImageRemove.hidden = !profileImageData;
}

function fileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error("The image could not be read.")); };
    reader.readAsDataURL(file);
  });
}

function canvasAsBlob(canvas, quality) {
  return new Promise(function (resolve) {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

async function makeProfileIcon(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise(function (resolve, reject) {
      const source = new Image();
      source.onload = function () { resolve(source); };
      source.onerror = function () { reject(new Error("The image could not be opened.")); };
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

function updateBioCount() {
  bioCount.textContent = String(bio.value.length);
}

function setSaving(message, isProblem) {
  saveStatus.textContent = message || "";
  saveStatus.classList.toggle("is-problem", Boolean(isProblem));
}

async function loadLinkedProfile(user) {
  hideAll();
  loading.hidden = false;
  try {
    const accessQuery = query(collection(db, "memberAccess"), where("ownerUid", "==", user.uid));
    const accessSnapshot = await getDocs(accessQuery);
    if (accessSnapshot.empty) {
      const inviteQuery = query(collection(db, "memberAccess"), where("invitedEmail", "==", user.email || ""));
      const inviteSnapshot = await getDocs(inviteQuery);
      if (inviteSnapshot.size === 1) {
        const inviteRef = inviteSnapshot.docs[0].ref;
        await updateDoc(inviteRef, {
          ownerUid: user.uid,
          status: "active",
          claimedAt: serverTimestamp()
        });
        return loadLinkedProfile(user);
      }
      const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
      if (adminSnapshot.exists()) {
        if (adminEmailOutput) adminEmailOutput.textContent = user.email || "Your Google account";
        hideAll();
        adminOnly.hidden = false;
        return;
      }
      hideAll();
      uidOutput.textContent = user.uid;
      if (unlinkedEmailOutput) unlinkedEmailOutput.textContent = user.email || "your Google account";
      notLinked.hidden = false;
      return;
    }
    if (accessSnapshot.size !== 1) throw new Error("More than one member profile is linked to this account. Please contact a WsB admin.");

    linkedMemberId = accessSnapshot.docs[0].id;
    const profileSnapshot = await getDoc(doc(db, "members", linkedMemberId));
    if (!profileSnapshot.exists()) throw new Error("Your member profile record is not ready yet. Please contact a WsB admin.");
    const profile = profileSnapshot.data();
    const socials = profile.socials || {};
    displayName.value = safeText(profile.displayName) || user.displayName || "";
    bio.value = safeText(profile.bio);
    document.getElementById("profileTikTok").value = safeText(socials.tiktok);
    document.getElementById("profileTwitch").value = safeText(socials.twitch);
    document.getElementById("profileYoutube").value = safeText(socials.youtube);
    document.getElementById("profileInstagram").value = safeText(socials.instagram);
    setProfileImage(profile.profileImage, profile.profileImage ? "Current profile icon" : "");
    emailOutput.textContent = user.email || "Google account";
    updateBioCount();
    hideAll();
    form.hidden = false;
  } catch (loadError) {
    hideAll();
    signedOut.hidden = false;
    showError(loadError.message || "We could not load your member profile. Please try again.");
  }
}

if (isAccountPage) {
signInButton.addEventListener("click", async function () {
  hideAll();
  loading.hidden = false;
  try {
    await authReady;
    await signInWithPopup(auth, provider);
  } catch (signInError) {
    hideAll();
    signedOut.hidden = false;
    showError(signInError.code === "auth/popup-closed-by-user" ? "The Google sign-in window was closed before it finished." : "Google sign-in could not be completed. Please try again.");
  }
});

signOutButtons.forEach(function (button) {
  if (!button) return;
  button.addEventListener("click", function () { signOut(auth); });
});

copyUidButton.addEventListener("click", async function () {
  try {
    await navigator.clipboard.writeText(uidOutput.textContent);
    copyUidButton.textContent = "ACCOUNT ID COPIED";
  } catch (_) {
    copyUidButton.textContent = "SELECT AND COPY THE ID";
  }
});

bio.addEventListener("input", updateBioCount);

profileImageInput.addEventListener("change", async function () {
  const file = profileImageInput.files && profileImageInput.files[0];
  if (!file) return;
  profileImageInput.disabled = true;
  setSaving("Preparing your profile icon...");
  try {
    setProfileImage(await makeProfileIcon(file), file.name);
    setSaving("Icon ready. Save your profile to publish it.");
  } catch (imageError) {
    profileImageInput.value = "";
    setSaving(imageError.message || "That image could not be used.", true);
  } finally {
    profileImageInput.disabled = false;
  }
});

profileImageRemove.addEventListener("click", function () {
  profileImageInput.value = "";
  setProfileImage("", "");
  setSaving("Icon will be removed when you save your profile.");
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!linkedMemberId) return;
  const nextName = displayName.value.trim();
  if (!nextName) {
    setSaving("Display name is required.", true);
    displayName.focus();
    return;
  }
  const socials = {
    tiktok: document.getElementById("profileTikTok").value.trim(),
    twitch: document.getElementById("profileTwitch").value.trim(),
    youtube: document.getElementById("profileYoutube").value.trim(),
    instagram: document.getElementById("profileInstagram").value.trim()
  };
  saveButton.disabled = true;
  setSaving("Saving your profile...");
  try {
    await updateDoc(doc(db, "members", linkedMemberId), {
      displayName: nextName,
      bio: bio.value.trim(),
      socials: socials,
      profileImage: profileImageData,
      updatedAt: serverTimestamp()
    });
    setSaving("Profile saved.");
  } catch (_) {
    setSaving("Your profile could not be saved. Please try again.", true);
  } finally {
    saveButton.disabled = false;
  }
});

onAuthStateChanged(auth, function (user) {
  linkedMemberId = null;
  if (!user) {
    hideAll();
    signedOut.hidden = false;
    return;
  }
  loadLinkedProfile(user);
});
}

function memberIdFromStatsLink(link) {
  const match = link.getAttribute("href").match(/stats\/([^/]+)\//);
  return match ? decodeURIComponent(match[1]) : null;
}

function appendPublicProfile(memberId, profile) {
  const detail = document.getElementById("playerDetail") || document.getElementById("profileDetail");
  if (!detail || detail.querySelector(".member-public-profile") || !profile) return;
  const heading = detail.querySelector(".profile-hero-card h1");
  if (heading && profile.displayName) heading.textContent = profile.displayName;
  const profileAvatar = detail.querySelector(".profile-hero-card .profile-avatar");
  const profileImage = safeProfileImage(profile.profileImage);
  if (profileAvatar && profileImage) {
    profileAvatar.style.backgroundImage = 'url("' + profileImage + '")';
    profileAvatar.textContent = "";
    profileAvatar.classList.remove("profile-avatar-initial");
  }
  const hasBio = safeText(profile.bio).trim();
  const socials = profile.socials || {};
  const links = [["TIKTOK", socials.tiktok], ["TWITCH", socials.twitch], ["YOUTUBE", socials.youtube], ["INSTAGRAM", socials.instagram]]
    .filter(function (entry) { return /^https:\/\//i.test(safeText(entry[1])); });
  if (!hasBio && !links.length) return;
  const panel = document.createElement("section");
  panel.className = "profile-panel member-public-profile";
  const label = document.createElement("p");
  label.className = "label";
  label.textContent = "ABOUT THE MEMBER";
  panel.append(label);
  if (hasBio) {
    const copy = document.createElement("p");
    copy.className = "member-public-bio";
    copy.textContent = hasBio;
    panel.append(copy);
  }
  if (links.length) {
    const socialList = document.createElement("div");
    socialList.className = "member-public-socials";
    links.forEach(function (entry) {
      const anchor = document.createElement("a");
      anchor.href = entry[1];
      anchor.target = "_blank";
      anchor.rel = "noopener";
      anchor.textContent = entry[0] + " ↗";
      socialList.append(anchor);
    });
    panel.append(socialList);
  }
  const hero = detail.querySelector(".profile-hero-card");
  if (hero) hero.insertAdjacentElement("afterend", panel);
  window.dispatchEvent(new Event("resize"));
}

async function applyPublicMemberProfiles() {
  const needsProfileData = document.querySelector(".member-card[data-fn-user], a.stats-player[href*='stats/'], #playerDetail, #profileDetail, .management-card, .player-card[data-roster-id]");
  if (!needsProfileData) return;
  try {
    if (!publicProfiles || !publicRoster) {
      const [snapshot, roster] = await Promise.all([
        getDocs(collection(db, "members")),
        fetch((document.body.dataset.siteRoot || "") + "data/roster.json", { cache: "no-store" }).then(function (response) { return response.ok ? response.json() : []; })
      ]);
      if (snapshot.empty) return;
      publicProfiles = new Map(snapshot.docs.map(function (entry) { return [entry.id, entry.data()]; }));
      publicRoster = roster;
    }
    const profiles = publicProfiles;
    const roster = publicRoster;
    const rosterByUsername = new Map(roster.map(function (member) { return [member.username, member.id]; }));
    document.querySelectorAll(".member-card[data-fn-user]").forEach(function (card) {
      const memberId = rosterByUsername.get(card.dataset.fnUser);
      const profile = profiles.get(memberId);
      const name = card.querySelector(".member-name");
      if (profile && name && profile.displayName) name.textContent = profile.displayName;
      const emblem = card.querySelector(".member-emblem");
      const profileImage = profile && safeProfileImage(profile.profileImage);
      if (emblem && profileImage) emblem.style.backgroundImage = 'url("' + profileImage + '")';
    });
    document.querySelectorAll("a.stats-player[href*='stats/']").forEach(function (card) {
      const profile = profiles.get(memberIdFromStatsLink(card));
      const name = card.querySelector("h3");
      if (profile && name && profile.displayName) name.textContent = profile.displayName;
      const avatar = card.querySelector(".stats-avatar");
      const profileImage = profile && safeProfileImage(profile.profileImage);
      if (avatar && profileImage) {
        avatar.style.backgroundImage = 'url("' + profileImage + '")';
        avatar.textContent = "";
        avatar.classList.remove("stats-avatar-initial");
      }
    });
    document.querySelectorAll(".player-card[data-roster-id]").forEach(function (card) {
      const profile = profiles.get(card.dataset.rosterId);
      const profileImage = profile && safeProfileImage(profile.profileImage);
      if (profileImage) card.style.setProperty("--player-photo", 'url("' + profileImage + '")');
    });
    const managementMemberIds = new Map([
      ["ᵂˢᴮJenClipsMenᵀᵀ", "jen"], ["ᵂˢᴮ Łìzzíeᵀᵀ ʚїɞ", "lizzie"], ["ᵂ˥Tazᵀᵀ", "taz"], ["ᵂˢᴮ katoᵀᵀ", "kato"],
      ["ʷˢᵇLazy", "lazy"], ["ᵂˢᴮ Elusion keys", "elusion"], ["ᵂˢᴮ Dmo", "dmo"], ["ᵂˢᴮBee", "bee"],
      ["ᵂˢᴮ ᴍʏꜱᴛᴇʀɪᴏᴜꜱǃ", "mysterious"], ["ᵂˢᴮ Skrewwww", "skrewwww"], ["ᵂˢᴮ Barrelroll77", "barrelroll"]
    ]);
    document.querySelectorAll(".management-card").forEach(function (card) {
      const name = card.querySelector(".tier-name");
      const profile = name && profiles.get(managementMemberIds.get(name.textContent.trim()));
      const profileImage = profile && safeProfileImage(profile.profileImage);
      if (profileImage) {
        card.classList.add("has-tier-photo");
        card.style.setProperty("--tier-photo", 'url("' + profileImage + '")');
      }
    });
    const pathMatch = location.pathname.match(/\/stats\/([^/]+)\/?$/);
    if (pathMatch) appendPublicProfile(pathMatch[1], profiles.get(decodeURIComponent(pathMatch[1])));
  } catch (_) {
    // The public site remains usable if Firebase is unavailable.
  }
}

function updateAccountIndicator(user) {
  document.querySelectorAll("header.nav #navlinks").forEach(function (nav) {
    let link = nav.querySelector(".firebase-account-link");
    if (!link) {
      link = document.createElement("a");
      link.className = "firebase-account-link";
      link.href = "member-account.html";
      nav.append(link);
    }
    if (!user) {
      link.textContent = "MY PROFILE";
      link.removeAttribute("title");
      link.classList.remove("is-signed-in");
      return;
    }
    const shortName = (user.email || "ACCOUNT").split("@")[0].slice(0, 16).toUpperCase();
    link.textContent = "SIGNED IN: " + shortName;
    link.title = user.email || "Signed in";
    link.classList.add("is-signed-in");
  });
}

onAuthStateChanged(auth, updateAccountIndicator);
function schedulePublicProfilePasses() {
  applyPublicMemberProfiles();
  window.setTimeout(applyPublicMemberProfiles, 900);
  window.setTimeout(applyPublicMemberProfiles, 2400);
}

if (document.readyState === "complete") schedulePublicProfilePasses();
else window.addEventListener("load", schedulePublicProfilePasses);

export { auth, db, provider };
