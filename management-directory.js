import { db } from './firebase-client.js';
import { visibility, managementMemberIds } from './member-visibility.js';
import { safeProfileImage } from './profile-image.js?v=1';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const grids = {
  owner: document.querySelector('.management-grid-owners'),
  management: document.querySelector('.management-grid-management'),
  support: document.querySelector('.management-grid-support')
};
const originals = new Map(), cards = new Map();
document.querySelectorAll('.management-card').forEach((card, index) => {
  const id = card.dataset.publicMemberId || managementMemberIds.get(card.querySelector('.tier-name')?.textContent.trim());
  if (!id) return;
  card.dataset.publicMemberId = id;
  const group = card.closest('.management-grid-owners') ? 'owner' : card.closest('.management-grid-management') ? 'management' : 'support';
  originals.set(id, { group, index, name: card.querySelector('.tier-name').textContent, role: card.dataset.role,
    roleLabel: card.querySelector('.tier-role').textContent, bio: card.dataset.bio || '', tiktok: card.dataset.tiktok || '',
    photo: card.style.getPropertyValue('--tier-photo'), gif: card.dataset.bioGif || '' });
  cards.set(id, card);
});
let memberships = new Map(), profiles = new Map(), roster = new Map(), ready = false, rolesReady = false, profilesReady = false;
const status = document.createElement('p'); status.hidden = true; status.setAttribute('role', 'status');
document.querySelector('.management-intro').after(status);
const safeSocial = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; } };
function render() {
  if (!ready || !rolesReady || !profilesReady) return;
  const ids = new Set([...originals.keys(), ...memberships.keys()]);
  const groups = { owner: [], management: [], support: [] };
  for (const id of ids) {
    const original = originals.get(id), membership = memberships.get(id), profile = profiles.get(id) || {}, member = roster.get(id);
    // The saved role is authoritative. Legacy entries remain until migrated.
    const group = membership === 'owner' || membership === 'management' ? membership
      : original?.group === 'support' ? 'support' : memberships.has(id) ? null : original?.group;
    if (!group || visibility.isHidden(id)) { cards.get(id)?.remove(); continue; }
    if (!original && !member && !profile.displayName) continue;
    let card = cards.get(id);
    if (!card) {
      card = document.createElement('div'); card.className = 'tier-node management-card';
      card.innerHTML = '<span class="management-card-initial-letter">WsB</span><span class="tier-role"></span><span class="tier-name"></span><span class="management-card-action">VIEW PROFILE <b>→</b></span>';
      card.dataset.publicMemberId = id; cards.set(id, card);
    }
    const name = profile.displayName || member?.displayName || original?.name || id;
    const label = group === 'support' ? original.roleLabel : group === 'owner' ? 'OWNER' : 'MANAGEMENT';
    card.querySelector('.tier-name').textContent = name; card.querySelector('.tier-role').textContent = label;
    card.dataset.role = group === 'support' ? original.role : group === 'owner' ? 'Owner' : 'Management';
    card.dataset.bio = typeof profile.bio === 'string' ? profile.bio : original?.bio || '';
    card.dataset.tiktok = profile.socials ? safeSocial(profile.socials.tiktok) : original?.tiktok || '';
    card.dataset.bioGif = original?.gif || '';
    const image = safeProfileImage(profile.profileImage);
    const rosterImage = typeof member?.profileImage === 'string' && /^[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(member.profileImage) ? member.profileImage : '';
    const photo = image ? 'url("' + image + '")' : rosterImage ? 'url("' + rosterImage + '")' : original?.photo || '';
    card.style.setProperty('--tier-photo', photo);
    card.classList.toggle('has-tier-photo', Boolean(photo)); card.classList.toggle('management-card-initial', !photo);
    card.classList.toggle('management-card-owner', group === 'owner');
    const watermark = card.querySelector('.management-card-initial-letter'); if (watermark) watermark.hidden = Boolean(photo);
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', 'View ' + name + ' profile');
    groups[group].push({ id, name, card, index: original?.index ?? 10000 });
  }
  for (const [group, entries] of Object.entries(groups)) {
    entries.sort((a, b) => a.index - b.index || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const community = grids[group].querySelector('.management-community-card');
    grids[group].replaceChildren(...entries.map(entry => entry.card), ...(community ? [community] : []));
  }
  visibility.apply();
  document.dispatchEvent(new Event('wsb:management-render'));
}
Promise.all([visibility.ready, fetch(new URL('data/roster.json', import.meta.url), { cache: 'no-store' })
  .then(response => response.ok ? response.json() : []).catch(() => [])]).then(([, members]) => {
  roster = new Map(members.map(member => [member.id, member])); ready = true; render();
});
onSnapshot(collection(db, 'memberMemberships'), snapshot => {
  memberships = new Map(snapshot.docs.map(entry => [entry.id, entry.data().role])); rolesReady = true; status.hidden = true; render();
}, () => {
  rolesReady = true; status.textContent = 'Membership updates are temporarily unavailable. Showing the saved team listing.'; status.hidden = false; render();
});
onSnapshot(collection(db, 'members'), snapshot => {
  profiles = new Map(snapshot.docs.map(entry => [entry.id, entry.data()])); profilesReady = true; render();
}, () => { profilesReady = true; render(); });
