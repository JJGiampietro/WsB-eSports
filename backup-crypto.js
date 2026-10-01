// Encrypt BEFORE download. No passphrase, plaintext, or file is sent anywhere.
export const BACKUP_COLLECTIONS = ['members', 'memberAccess', 'memberVisibility', 'admins', 'bounties', 'bountyClaims', 'bountyRewards', 'claimDisputes', 'adminActivity', 'notifications', 'siteEvents', 'siteAnnouncements', 'siteContentState'];
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => { let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 16) throw new Error('Use a passphrase of at least 16 characters.');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function encodeData(value) {
  if (value?.toMillis && typeof value.seconds === 'number') return { $timestamp: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encodeData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, encodeData(v)]));
  return value;
}
export function decodeData(value, Timestamp) {
  if (value && typeof value === 'object' && Object.keys(value).length === 1 && Array.isArray(value.$timestamp)) return new Timestamp(...value.$timestamp);
  if (Array.isArray(value)) return value.map(v => decodeData(v, Timestamp));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, decodeData(v, Timestamp)]));
  return value;
}
export function validateBackup(data, projectId) {
  if (data?.schemaVersion !== 1 || data.projectId !== projectId || !data.collections || typeof data.collections !== 'object') throw new Error('This backup belongs to a different project or format.');
  if (Object.keys(data.collections).some(k => !BACKUP_COLLECTIONS.includes(k))) throw new Error('Unknown backup collection.');
  for (const [name, docs] of Object.entries(data.collections)) {
    if (!Array.isArray(docs) || docs.length > 10000) throw new Error('Invalid collection: ' + name);
    const ids = new Set();
    for (const doc of docs) {
      if (!doc || typeof doc.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(doc.id) || ids.has(doc.id) || !doc.data || typeof doc.data !== 'object' || Array.isArray(doc.data)) throw new Error('Invalid or duplicate backup document.');
      ids.add(doc.id);
      if (JSON.stringify(doc.data).length > 1000000) throw new Error('Backup document too large.');
    }
  }
  return data;
}
export async function encryptBackup(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('wsb-backup-v1') }, await keyFor(password, salt), enc.encode(JSON.stringify(data)));
  return { format: 'wsb-encrypted-backup', version: 1, algorithm: 'AES-256-GCM/PBKDF2-SHA256', iterations: 310000, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(cipher)) };
}
export async function decryptBackup(envelope, password, projectId) {
  if (envelope?.format !== 'wsb-encrypted-backup' || envelope.version !== 1 || envelope.iterations !== 310000 || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 70000000) throw new Error('Unsupported or oversized encrypted backup.');
  try {
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: enc.encode('wsb-backup-v1') }, await keyFor(password, unb64(envelope.salt)), unb64(envelope.ciphertext));
    return validateBackup(JSON.parse(dec.decode(bytes)), projectId);
  } catch (error) { if (error.name === 'OperationError') throw new Error('Incorrect passphrase or damaged backup. Nothing was restored.'); throw error; }
}
