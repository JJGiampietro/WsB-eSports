// Public presentation only: hiding never deletes stats or changes account access.
import { db } from './firebase-client.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const managementMemberIds = new Map([
  ['ᵂˢᴮJenClipsMenᵀᵀ', 'jen'], ['ᵂˢᴮ Łìzzíeᵀᵀ ʚїɞ', 'lizzie'], ['ᵂ˥Tazᵀᵀ', 'taz'],
  ['ᵂˢᴮ katoᵀᵀ', 'kato'], ['ʷˢᵇLazy', 'lazy'], ['ᵂˢᴮ Elusion keys', 'elusion'],
  ['ᵂˢᴮ Dmo', 'dmo'], ['ᵂˢᴮBee', 'bee'], ['ᵂˢᴮ ᴍʏꜱᴛᴇʀɪᴏᴜꜱǃ', 'mysterious'],
  ['ᵂˢᴮ Skrewwww', 'skrewwww'], ['ᵂˢᴮ Barrelroll77', 'barrelroll'], ['ᵂˢᴮIngraham', 'ingraham']
]);
const cardSelector = '.member-card, .management-card, .player-card[data-roster-id], a.stats-player, .lb-row';
const publicPage = Boolean(document.querySelector('#membersGrid, #statsDirectory, #playerDetail, #profileDetail, #lbLifetimeGrid, .management-card, .player-card[data-roster-id]'));
let hiddenIds = new Set(), available = false, initialized = false, roster = [];
let resolveReady;
export const visibility = {
  ready: new Promise(resolve => { resolveReady = resolve; }),
  isHidden: id => !available || hiddenIds.has(id),
  filterRoster: entries => available ? (Array.isArray(entries) ? entries : []).filter(member => !hiddenIds.has(member.id)) : [],
  apply
};
window.WsbVisibility = visibility;
function cardId(card) {
  if (card.dataset.publicMemberId) return card.dataset.publicMemberId;
  let id = card.dataset.memberId || card.dataset.rosterId;
  if (!id && card.classList.contains('management-card')) id = managementMemberIds.get(card.querySelector('.tier-name')?.textContent.trim());
  if (!id && card.dataset.fnUser) id = roster.find(member => member.username === card.dataset.fnUser)?.id;
  if (!id && card.classList.contains('member-card') && !card.dataset.fnUser) id = 'ingraham';
  const link = card.matches('a') ? card : card.querySelector('a[href*="stats/"]');
  if (!id && link) id = new URL(link.href).pathname.match(/\/stats\/([^/]+)\/?$/)?.[1];
  if (id) card.dataset.publicMemberId = id;
  return id;
}
function apply() {
  document.querySelectorAll(cardSelector).forEach(card => {
    const id = cardId(card), hidden = !available || !id || hiddenIds.has(id);
    (card.closest('.member-card-wrap') || card).classList.toggle('profile-hidden', hidden);
    card.classList.toggle('profile-hidden', hidden);
  });
  document.querySelectorAll('.management-group').forEach(group => {
    const cards = [...group.querySelectorAll('.management-card')];
    group.classList.toggle('profile-hidden', cards.length > 0 && cards.every(card => card.classList.contains('profile-hidden')) && !group.querySelector('.management-community-card'));
  });
  document.documentElement.classList.remove('profile-visibility-loading');
}
const rosterReady = fetch(new URL('data/roster.json', import.meta.url), { cache: 'no-store' })
  .then(response => response.ok ? response.json() : []).then(entries => { roster = Array.isArray(entries) ? entries : []; }).catch(() => {});
onSnapshot(collection(db, 'memberVisibility'), { includeMetadataChanges: true }, async snapshot => {
  if (snapshot.metadata.hasPendingWrites) return;
  const next = new Set(snapshot.docs.filter(entry => entry.data().hidden === true).map(entry => entry.id));
  const changed = initialized && (!available || next.size !== hiddenIds.size || [...next].some(id => !hiddenIds.has(id)));
  hiddenIds = next; available = true;
  await rosterReady;
  if (changed && publicPage) { location.reload(); return; }
  initialized = true; apply(); resolveReady(visibility);
  document.dispatchEvent(new Event('wsb:visibility-applied'));
}, async () => {
  available = false; initialized = true; await rosterReady; apply(); resolveReady(visibility);
  document.dispatchEvent(new Event('wsb:visibility-applied'));
});
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; if (initialized) apply(); });
}).observe(document.body, { childList: true, subtree: true });
