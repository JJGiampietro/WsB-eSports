import { auth, db } from './firebase-client.js';
import { watchAdmin, logActivity } from './admin-access.js';
import { CONTENT_TYPES, millis, sortContent, validateContent } from './content-model.js';
import { contentDefaults, renderEvent, renderAnnouncement } from './site-content.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, collection, onSnapshot, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const $ = id => document.getElementById(id), configs = CONTENT_TYPES;
let allowed = false, generation = 0, accessGeneration = 0, stopRole = () => {}, stops = [], defaults = { events: [], announcements: [] }, settings = {}, rows = { events: [], announcements: [] };
const editors = Object.fromEntries(Object.keys(configs).map(kind => [kind, { id: '', original: null, baseline: '', loaded: false, saving: false }]));
const message = (kind, text) => { $(kind + 'SaveStatus').textContent = text; };
const inputDate = value => { const ms = millis(value); if (!Number.isFinite(ms)) return ''; const date = new Date(ms); return new Date(ms - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function visibleRows(kind) { const records = new Map((settings[kind + 'Managed'] ? [] : defaults[kind]).map(row => [row.id, row])); rows[kind].forEach(row => records.set(row.id, row)); return sortContent([...records.values()]); }
function readForm(kind) {
  const text = field => $(kind + field).value.trim(), date = field => { const value = $(kind + field).value; if (!value) return null; const ms = Date.parse(value); if (!Number.isFinite(ms)) throw Error('Check the date and time.'); return Timestamp.fromMillis(ms); };
  const data = { title: text('Title'), label: text('Label'), body: text('Body'), status: text('Status'), order: Number(text('Order')), link: text('Link'), linkLabel: text('LinkLabel') };
  for (const field of configs[kind].dates) data[field] = date(field[0].toUpperCase() + field.slice(1));
  for (const field of configs[kind].extra) data[field] = field === 'featured' ? $(kind + 'Featured').checked : text(field[0].toUpperCase() + field.slice(1));
  return data;
}
function snapshot(kind) { return JSON.stringify([...$(kind + 'Form').querySelectorAll('input,textarea,select')].map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value])); }
const dirty = kind => allowed && editors[kind].loaded && snapshot(kind) !== editors[kind].baseline;
function preview(kind) {
  const slot = $(kind + 'Preview'); slot.textContent = '';
  try { const data = readForm(kind); data.id = editors[kind].id || 'preview'; slot.append(kind === 'events' ? renderEvent(data) : renderAnnouncement(data)); }
  catch (_) { slot.textContent = 'Check the date fields to preview this card.'; }
}
function renderPicker(kind) {
  if (!allowed) return;
  const picker = $(kind + 'Picker'), term = $(kind + 'Search').value.toLowerCase(); picker.textContent = '';
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Create new ' + configs[kind].label.toLowerCase(); picker.append(empty);
  visibleRows(kind).filter(row => row.id === editors[kind].id || row.title.toLowerCase().includes(term)).forEach(row => { const option = document.createElement('option'); option.value = row.id; option.textContent = row.title + ' (' + row.status + ')'; picker.append(option); });
  picker.value = editors[kind].id;
  $(kind + 'SourceStatus').textContent = settings[kind + 'Managed'] ? 'Content is managed here and updates live on the public page.' : 'Existing website content is ready to edit. Your first save safely imports these items; nothing is published until saved as Published.';
}
function load(kind, id = '') {
  const editor = editors[kind], row = visibleRows(kind).find(item => item.id === id);
  editor.id = row?.id || ''; editor.original = rows[kind].find(item => item.id === id) || null;
  $(kind + 'Form').reset();
  const data = row || { title: '', label: kind === 'events' ? 'WsB EVENT' : 'TEAM NEWS', body: '', status: 'draft', order: 0, link: '', linkLabel: '', eventState: 'upcoming', featured: false };
  for (const field of ['title', 'label', 'body', 'status', 'order', 'link', 'linkLabel', ...configs[kind].extra]) {
    const element = $(kind + field[0].toUpperCase() + field.slice(1)); if (field === 'featured') element.checked = Boolean(data[field]); else element.value = data[field] ?? '';
  }
  for (const field of configs[kind].dates) $(kind + field[0].toUpperCase() + field.slice(1)).value = inputDate(data[field]);
  $(kind + 'EditorHeading').textContent = row ? 'Edit ' + configs[kind].label.toLowerCase() : 'New ' + configs[kind].label.toLowerCase();
  editor.loaded = true; editor.baseline = snapshot(kind); message(kind, ''); renderPicker(kind); preview(kind);
}
function confirmDiscard(kind) { return !dirty(kind) || confirm('Discard unsaved ' + configs[kind].label.toLowerCase() + ' changes?'); }
function savedDefault(kind, source) {
  const data = { ...source }; delete data.id;
  for (const field of configs[kind].dates) data[field] = data[field] ? Timestamp.fromMillis(millis(data[field])) : null;
  return { ...data, revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}
for (const kind of Object.keys(configs)) {
  const form = $(kind + 'Form');
  $(kind + 'Search').addEventListener('input', () => renderPicker(kind));
  $(kind + 'Picker').addEventListener('change', () => { if (confirmDiscard(kind)) load(kind, $(kind + 'Picker').value); else $(kind + 'Picker').value = editors[kind].id; });
  $(kind + 'New').addEventListener('click', () => { if (confirmDiscard(kind)) { $(kind + 'Search').value = ''; load(kind); } });
  $(kind + 'Cancel').addEventListener('click', () => { if (confirmDiscard(kind)) load(kind, editors[kind].id); });
  form.addEventListener('input', () => preview(kind)); form.addEventListener('change', () => preview(kind));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!allowed || editors[kind].saving) return;
    const editor = editors[kind], version = generation, access = accessGeneration, user = auth.currentUser;
    editor.saving = true; $(kind + 'Save').disabled = true; message(kind, 'Saving…');
    try {
      const data = validateContent(kind, readForm(kind)), ref = editor.id ? doc(db, configs[kind].collection, editor.id) : doc(collection(db, configs[kind].collection));
      const original = editor.original; const fallback = await contentDefaults();
      await runTransaction(db, async transaction => {
        const stateRef = doc(db, 'siteContentState', 'settings'), state = await transaction.get(stateRef), current = await transaction.get(ref);
        if (version !== generation || access !== accessGeneration || !allowed || auth.currentUser?.uid !== user.uid) throw Error('Admin access changed. Save cancelled.');
        if ((original?.revision || 0) !== (current.data()?.revision || 0)) throw Error('Another admin changed this item. Discard your changes to reload it before saving.');
        const initialize = !state.data()?.[kind + 'Managed'];
        const inherited = initialize ? await Promise.all(fallback[kind].filter(item => item.id !== ref.id).map(async item => { const target = doc(db, configs[kind].collection, item.id); return { item, target, existing: await transaction.get(target) }; })) : [];
        for (const entry of inherited) if (!entry.existing.exists()) transaction.set(entry.target, savedDefault(kind, entry.item));
        transaction.set(ref, { ...data, revision: (current.data()?.revision || 0) + 1, createdAt: current.data()?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
        if (initialize) transaction.set(stateRef, { eventsManaged: Boolean(state.data()?.eventsManaged), announcementsManaged: Boolean(state.data()?.announcementsManaged), [kind + 'Managed']: true, updatedAt: serverTimestamp() });
        logActivity(db, transaction, user, kind.slice(0, -1) + (current.exists() ? '-edited' : '-created'), configs[kind].collection, ref.id, data.title + ' (' + data.status + ')');
      });
      if (version !== generation || !allowed) return;
      const saved = { ...data, id: ref.id, revision: (original?.revision || 0) + 1 };
      rows[kind] = [...rows[kind].filter(row => row.id !== ref.id), saved]; editor.id = ref.id; editor.original = saved;
      $(kind + 'EditorHeading').textContent = 'Edit ' + configs[kind].label.toLowerCase();
      editor.baseline = snapshot(kind); renderPicker(kind); preview(kind);
      message(kind, data.status === 'published' ? 'Published. The public page updates automatically.' : data.status === 'draft' ? 'Draft saved. Visible only to admins.' : 'Archived. Hidden from the public page.');
    } catch (error) { if (version === generation) message(kind, error.message); }
    finally { editor.saving = false; $(kind + 'Save').disabled = !allowed; }
  });
}
window.addEventListener('beforeunload', event => { if (Object.keys(configs).some(dirty)) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('click', event => {
  const target = event.target.closest('a,button'); if (!target || !Object.keys(configs).some(dirty)) return;
  if (target.tagName === 'A' && target.target !== '_blank' || /signOut/i.test(target.id) || target.dataset.testLogin) {
    if (!confirm('Discard unsaved event or announcement changes?')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
}, true);
function clear() {
  stops.forEach(stop => stop()); stops = []; settings = {}; rows = { events: [], announcements: [] };
  for (const kind of Object.keys(configs)) { const editor = editors[kind]; editor.id = ''; editor.original = null; editor.loaded = false; editor.baseline = ''; $(kind + 'Form').reset(); $(kind + 'Preview').textContent = ''; $(kind + 'Picker').textContent = ''; $(kind + 'Save').disabled = true; message(kind, ''); $(kind + 'SourceStatus').textContent = ''; }
}
onAuthStateChanged(auth, user => {
  const version = ++generation; accessGeneration++; stopRole(); allowed = false; clear();
  stopRole = watchAdmin(db, user, async isAdmin => {
    if (version !== generation) return;
    if (!isAdmin) { allowed = false; accessGeneration++; clear(); return; }
    if (allowed) return;
    allowed = true; const access = accessGeneration;
    try { defaults = await contentDefaults(); if (version !== generation || access !== accessGeneration || !allowed) return; }
    catch (error) { for (const kind of Object.keys(configs)) message(kind, error.message); return; }
    for (const kind of Object.keys(configs)) { $(kind + 'Save').disabled = false; load(kind); stops.push(onSnapshot(collection(db, configs[kind].collection), snapshot => {
      if (version !== generation || !allowed) return; rows[kind] = snapshot.docs.map(entry => ({ ...entry.data(), id: entry.id })); renderPicker(kind);
    }, error => { if (version === generation) message(kind, 'Cannot load content: ' + error.message); })); }
    stops.push(onSnapshot(doc(db, 'siteContentState', 'settings'), snapshot => { if (version !== generation || !allowed) return; settings = snapshot.data() || {}; Object.keys(configs).forEach(renderPicker); }));
  });
});
