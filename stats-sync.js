// Explicit module fallback when a fast reload misses the classic-script helper.
// Keep the shared CommonJS/browser implementation as the single source of truth.
import './sync-status.js';
const sync = globalThis.WsbSync;
if (!sync) throw new Error('Stats display helper could not be initialized.');
export default sync;
