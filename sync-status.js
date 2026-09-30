(function (scope) {
  function status(snapshot, id, now = Date.now()) {
    const player = snapshot?.players?.[id];
    const metadata = snapshot?.sync?.[id] || {};
    const lastSuccess = metadata.lastSuccessAt || player?.lastSuccessAt || (player ? snapshot.fetchedAt : null);
    const aged = lastSuccess && now - Date.parse(lastSuccess) > 2 * 60 * 60 * 1000;
    const stale = Boolean(player && (metadata.state === 'stale' || player.stale || aged));
    const state = player ? stale ? 'stale' : 'synced' : 'waiting';
    const issue = metadata.issue || (player ? aged ? 'Refresh is delayed. Showing the last successful stats.' : '' : 'Waiting for the first successful sync. Check the Epic name and Public Game Stats in Fortnite.');
    return { state, lastSuccess, lastAttempt: metadata.lastAttemptAt || snapshot?.fetchedAt || null, issue,
      label: state === 'synced' ? 'Synced' : state === 'stale' ? 'Outdated stats' : 'Waiting for first sync' };
  }
  function describe(snapshot, id) {
    const s = status(snapshot, id);
    const date = s.lastSuccess ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(new Date(s.lastSuccess)) : null;
    return s.label + (date ? ' · Last successful refresh: ' + date + ' PT' : '') + (s.issue ? ' · ' + s.issue : '');
  }
  scope.WsbSync = { status, describe };
  if (typeof module !== 'undefined') module.exports = scope.WsbSync;
})(typeof window === 'undefined' ? globalThis : window);
