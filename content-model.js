export const CONTENT_TYPES = {
  events: { collection: 'siteEvents', label: 'Event', dates: ['startsAt', 'endsAt'], extra: ['eventState', 'result', 'participants', 'mode', 'reward'] },
  announcements: { collection: 'siteAnnouncements', label: 'Announcement', dates: ['publishedAt', 'countdownAt'], extra: ['featured'] }
};
export const millis = value => value?.toMillis ? value.toMillis() : value ? Date.parse(value) : NaN;
export const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function safeContentLink(value, root = '') {
  if (!value) return '';
  if (/^https:\/\//i.test(value)) { try { return new URL(value).href; } catch (_) { return ''; } }
  if (/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(value) || /^events\/[a-zA-Z0-9_-]+\/$/.test(value)) return root + value;
  return '';
}
export function sortContent(rows) { return [...rows].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || (millis(b.publishedAt || b.startsAt) || 0) - (millis(a.publishedAt || a.startsAt) || 0) || a.id.localeCompare(b.id)); }
export function validateContent(kind, data) {
  if (!CONTENT_TYPES[kind]) throw Error('Unknown content type.');
  if (!data.title.trim() || data.title.length > 120) throw Error('Add a title of up to 120 characters.');
  if (!data.body.trim() || data.body.length > 10000) throw Error('Add details of up to 10,000 characters.');
  if (!['draft', 'published', 'archived'].includes(data.status)) throw Error('Choose a publication status.');
  if (!Number.isInteger(data.order) || Math.abs(data.order) > 10000) throw Error('Display order must be a whole number between -10,000 and 10,000.');
  if (data.link && !safeContentLink(data.link)) throw Error('Use an HTTPS link or a site page such as events.html.');
  if (kind === 'events' && data.startsAt && data.endsAt && millis(data.endsAt) < millis(data.startsAt)) throw Error('The end time cannot be earlier than the start time.');
  return data;
}
