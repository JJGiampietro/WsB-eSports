import { db } from './firebase-client.js';
import { CONTENT_TYPES, millis, sortContent, safeContentLink } from './content-model.js';
import { doc, collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const root = document.body.dataset.siteRoot || '';
let defaultsPromise;
export const contentDefaults = () => defaultsPromise ||= fetch(root + 'data/content-defaults.json').then(response => { if (!response.ok) throw Error('Saved content unavailable.'); return response.json(); });
export function subscribePublished(kind, callback, fail = () => {}) {
  let stopItems = () => {}, generation = 0, active = true;
  const stopState = onSnapshot(doc(db, 'siteContentState', 'settings'), async snapshot => {
    const current = ++generation; stopItems();
    if (snapshot.data()?.[kind + 'Managed']) {
      // Public readers can never query drafts or private admin metadata collections.
      stopItems = onSnapshot(query(collection(db, CONTENT_TYPES[kind].collection), where('status', '==', 'published')), rows => {
        if (active && current === generation) callback(sortContent(rows.docs.map(entry => ({ ...entry.data(), id: entry.id }))));
      }, error => { if (active && current === generation) fail(error); });
    } else {
      try { const defaults = await contentDefaults(); if (active && current === generation) callback(sortContent(defaults[kind])); }
      catch (error) { if (active && current === generation) fail(error); }
    }
  }, fail);
  return () => { active = false; generation++; stopState(); stopItems(); };
}
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const dateText = value => Number.isFinite(millis(value)) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(millis(value)) + ' PT' : '';
function paragraphs(parent, text) { String(text || '').split(/\n\s*\n/).filter(Boolean).forEach(part => parent.append(make('p', 'content-paragraph', part))); }
function addLink(parent, item) {
  const href = safeContentLink(item.link, root); if (!href) return;
  const link = make('a', 'arrow-link content-details-link', item.linkLabel || 'VIEW DETAILS'); link.href = href;
  if (/^https:\/\//.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  parent.append(link);
}
function countdown(parent, value) {
  if (!(millis(value) > Date.now())) return;
  const node = make('div', 'event-countdown' + (parent.classList.contains('ann-post') ? ' ann-countdown' : '')); node.dataset.countdownTarget = new Date(millis(value)).toISOString(); node.setAttribute('aria-label', 'Time until start');
  for (const [key, label] of [['days', 'Days'], ['hours', 'Hours'], ['minutes', 'Min'], ['seconds', 'Sec']]) {
    const unit = make('div', 'cd-unit'), number = make('span', 'cd-num', '--'); number.dataset.cd = key; unit.append(number, make('span', 'cd-label', label)); node.append(unit);
  }
  parent.append(node);
}
export function renderEvent(item) {
  const card = make('article', 'event-card cms-event'); card.dataset.contentId = item.id;
  const ended = item.eventState === 'ended' || item.endsAt && millis(item.endsAt) <= Date.now(), cancelled = item.eventState === 'cancelled';
  if (!ended && !cancelled && item.startsAt) card.dataset.eventDate = new Date(millis(item.startsAt)).toISOString();
  const date = make('div', 'event-date-block');
  const month = cancelled ? 'CANCELLED' : ended ? 'ENDED' : item.startsAt ? new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'America/Los_Angeles' }).format(millis(item.startsAt)).toUpperCase() : 'DATE TBA';
  date.append(make('span', 'event-month', month), make('span', 'event-day', ended || cancelled || !item.startsAt ? '' : new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'America/Los_Angeles' }).format(millis(item.startsAt))));
  const info = make('div', 'event-info'); info.append(make('p', 'label', item.label), make('h3', '', item.title));
  if (item.startsAt) info.append(make('p', 'content-date', dateText(item.startsAt) + (item.endsAt ? ' to ' + dateText(item.endsAt) : '')));
  if (item.result) info.append(make('p', 'content-result', item.result));
  paragraphs(info, item.body);
  if (item.mode || item.reward) info.append(make('p', 'content-event-meta', [item.mode && 'Mode: ' + item.mode, item.reward && 'Prize: ' + item.reward].filter(Boolean).join(' · ')));
  if (item.participants) { const details = make('details', 'content-participants'); details.append(make('summary', '', 'Participating players')); const list = make('ul'); item.participants.split('\n').map(name => name.trim()).filter(Boolean).forEach(name => list.append(make('li', '', name))); details.append(list); info.append(details); }
  if (!ended && !cancelled) countdown(info, item.startsAt);
  addLink(info, item); card.append(date, info); return card;
}
export function renderAnnouncement(item) {
  const card = make('article', 'ann-post cms-announcement' + (item.featured ? ' cms-featured' : '')); card.dataset.contentId = item.id;
  const day = Number.isFinite(millis(item.publishedAt)) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }).format(millis(item.publishedAt)) + ' PT' : 'TEAM NEWS';
  const meta = make('div', 'ann-post-meta'); meta.append(make('span', 'ann-date', day), make('span', 'content-category', item.label));
  card.append(meta, make('h3', '', item.title));
  const parts = String(item.body).split(/\n\s*\n/).filter(Boolean); if (parts.length) paragraphs(card, parts[0]);
  if (parts.length > 1) { const details = make('details', 'ann-extra content-more'); details.append(make('summary', '', 'Read full announcement')); paragraphs(details, parts.slice(1).join('\n\n')); card.append(details); }
  countdown(card, item.countdownAt); addLink(card, item); return card;
}
function setupPublic() {
  const events = document.getElementById('eventList'), feed = document.getElementById('annFeed');
  const fail = () => { let note = document.getElementById('contentLiveStatus'); if (!note) { note = make('p', 'content-live-status', 'Live updates unavailable. Showing saved content.'); note.id = 'contentLiveStatus'; (events || feed)?.before(note); } };
  if (events) subscribePublished('events', rows => {
    document.getElementById('contentLiveStatus')?.remove(); events.textContent = '';
    const current = rows.filter(item => item.eventState === 'upcoming' && (!item.endsAt || millis(item.endsAt) > Date.now())), past = rows.filter(item => !current.includes(item));
    for (const [label, group] of [['COMING UP', current], ['PAST EVENTS & RESULTS', past]]) { if (!group.length) continue; events.append(make('h2', 'event-section-title', label)); group.forEach(item => events.append(renderEvent(item))); }
    if (!rows.length) events.append(make('p', 'content-empty', 'No events published yet. Check back soon.'));
  }, fail);
  if (feed) subscribePublished('announcements', rows => {
    document.getElementById('contentLiveStatus')?.remove(); document.querySelector('.ann-countdown-block')?.remove(); feed.textContent = '';
    [...rows.filter(item => item.featured), ...rows.filter(item => !item.featured)].forEach(item => feed.append(renderAnnouncement(item)));
    if (!rows.length) feed.append(make('p', 'content-empty', 'No announcements published yet. Check back soon.'));
  }, fail);
}
setupPublic();
