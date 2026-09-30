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
  function renderCardStatus(card, snapshot, id) {
    const s = status(snapshot, id), fullText = describe(snapshot, id);
    card.classList.toggle('sync-issue', s.state !== 'synced');
    let note = card.querySelector('.member-sync-status');
    if (!note) { note = card.ownerDocument.createElement('span'); note.className = 'member-sync-status'; card.append(note); }
    if (note.dataset.description === fullText) return;
    note.dataset.description = fullText; note.dataset.syncState = s.state; note.title = fullText;
    note.removeAttribute('role'); note.removeAttribute('aria-label');
    note.id = 'member-sync-' + id;
    const descriptions = new Set((card.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(note.id); card.setAttribute('aria-describedby', [...descriptions].join(' '));
    const label = card.ownerDocument.createElement('strong'); label.className = 'member-sync-label'; label.textContent = s.label;
    const lines = [label];
    if (s.lastSuccess) {
      const time = card.ownerDocument.createElement('span'); time.className = 'member-sync-time';
      time.textContent = 'Last refresh: ' + new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZone:'America/Los_Angeles', timeZoneName:'short' }).format(new Date(s.lastSuccess));
      lines.push(time);
    }
    if (s.state !== 'synced') {
      const hint = card.ownerDocument.createElement('span'); hint.className = 'member-sync-hint';
      hint.textContent = s.state === 'stale' ? 'Showing last saved stats.' : 'Check Epic name and Public Game Stats.';
      lines.push(hint);
    }
    if (s.issue) {
      const issue = card.ownerDocument.createElement('span'); issue.className = 'member-sync-full-issue'; issue.textContent = s.issue; lines.push(issue);
    }
    note.replaceChildren(...lines);
  }
  scope.WsbSync = { status, describe, renderCardStatus };
  if (typeof module !== 'undefined') module.exports = scope.WsbSync;
})(typeof window === 'undefined' ? globalThis : window);
