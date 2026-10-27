// Display badges are deliberately separate from memberAccess.role and admin grants.
import { db } from './firebase-client.js';
import { collection, doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { managementMemberIds } from './member-visibility.js';

export const MAX_PROFILE_ROLES = 5;
export const ROLE_TONES = ['violet', 'gold', 'mint', 'blue'];
export const roleNameKey = name => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export async function roleIdForName(name) {
  const key = roleNameKey(name);
  const slug = key.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug && slug.length <= 64) return slug;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return 'role-' + [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export const roleState = { definitions: new Map(), assignments: new Map(), catalogLoaded: false, assignmentsLoaded: false, error: '' };
const listeners = new Set();
export function subscribeRoles(listener) { listeners.add(listener); listener(); return () => listeners.delete(listener); }
export function rolesFor(id) {
  const ids = roleState.assignments.get(id)?.roleIds;
  return (Array.isArray(ids) ? ids : []).slice(0, MAX_PROFILE_ROLES).map(roleId => roleState.definitions.get(roleId)).filter(Boolean);
}
export function paintRoleBadges(host, roles) {
  const signature = JSON.stringify(roles.map(role => [role.id, role.name, role.tone]));
  if (host.dataset.roleSignature === signature) return;
  host.dataset.roleSignature = signature;
  host.replaceChildren();
  host.classList.add('profile-role-list');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Profile roles');
  host.hidden = roles.length === 0;
  for (const role of roles) {
    const badge = document.createElement('span');
    badge.className = 'profile-role-badge role-tone-' + (ROLE_TONES.includes(role.tone) ? role.tone : 'violet');
    badge.dataset.roleId = role.id;
    badge.textContent = String(role.name).slice(0, 32);
    badge.title = 'Profile role assigned by WsB admins. Does not grant website permissions.';
    host.append(badge);
  }
}
function notify() { listeners.forEach(listener => listener()); schedulePaint(); }
onSnapshot(collection(db, 'profileRoles'), snapshot => {
  roleState.definitions = new Map(snapshot.docs.map(entry => [entry.id, { ...entry.data(), id: entry.id }]));
  roleState.catalogLoaded = true; roleState.error = ''; notify();
}, () => { roleState.error = 'Profile roles could not be loaded. Please refresh to try again.'; notify(); });
const detailId = document.body.dataset.memberId;
onSnapshot(detailId ? doc(db, 'memberRoles', detailId) : collection(db, 'memberRoles'), snapshot => {
  const entries = detailId ? (snapshot.exists() ? [snapshot] : []) : snapshot.docs;
  roleState.assignments = new Map(entries.map(entry => [entry.id, entry.data()]));
  roleState.assignmentsLoaded = true; notify();
}, () => { roleState.error = 'Member roles could not be loaded. Please refresh to try again.'; notify(); });

function renderPublicRoles() {
  if (!roleState.catalogLoaded || !roleState.assignmentsLoaded) return;
  for (const card of document.querySelectorAll('.member-card, a.stats-player, .management-card, .player-card[data-roster-id]')) {
    let id = card.dataset.memberId || card.dataset.publicMemberId || card.dataset.rosterId;
    if (!id && card.matches('a.stats-player')) id = new URL(card.href).pathname.match(/\/stats\/([^/]+)\//)?.[1];
    if (!id && card.matches('.management-card')) id = managementMemberIds.get(card.querySelector('.tier-name')?.textContent.trim());
    if (!id) continue;
    const name = card.querySelector('.member-name, .stats-player-head h3, .tier-name, .player-name');
    if (!name) continue;
    const roles = rolesFor(id);
    let host = card.querySelector('[data-profile-role-badges]');
    if (!host && !roles.length) continue;
    if (!host) { host = document.createElement('div'); host.dataset.profileRoleBadges = ''; name.after(host); }
    paintRoleBadges(host, roles);
  }
  const hero = document.querySelector('#playerDetail .profile-hero-card > div:last-child, #profileDetail .profile-hero-card > div:last-child');
  if (hero && detailId) {
    let host = hero.querySelector('[data-profile-role-badges]');
    if (!host) { host = document.createElement('div'); host.dataset.profileRoleBadges = ''; hero.querySelector('h1')?.after(host); }
    paintRoleBadges(host, rolesFor(detailId));
  }
  const accountForm = document.querySelector('#memberProfileForm[data-profile-member-id]');
  if (accountForm) {
    let host = accountForm.querySelector('[data-profile-role-badges]');
    if (!host) { host = document.createElement('div'); host.dataset.profileRoleBadges = ''; accountForm.querySelector('.member-account-card-head')?.after(host); }
    paintRoleBadges(host, rolesFor(accountForm.dataset.profileMemberId));
  }
}
let queued = false;
function schedulePaint() {
  if (queued) return;
  queued = true; requestAnimationFrame(() => { queued = false; renderPublicRoles(); });
}
new MutationObserver(schedulePaint).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-public-member-id', 'data-member-id', 'data-profile-member-id'] });
document.addEventListener('wsb:visibility-applied', schedulePaint);
