const keys = ['kd', 'winrate', 'wins', 'kills', 'matches'];
function validStats(stats) { return stats && keys.every(k => typeof stats[k] === 'number' && Number.isFinite(stats[k]) && stats[k] >= 0); }
function preserveResult(player, fetched, previous, timestamp, issue = 'The stats service did not return data. It will retry next hour.') {
  const old = previous?.players?.[player.id];
  const oldSync = previous?.sync?.[player.id];
  const lastSuccessAt = oldSync?.lastSuccessAt || old?.lastSuccessAt || (validStats(old) ? previous.fetchedAt : null);
  if (fetched && validStats(fetched.stats)) return {
    stats: { displayName: player.displayName, username: fetched.username || player.username,
      accountId: fetched.accountId || player.accountId || null, ...fetched.stats, lastSuccessAt: timestamp, stale: false },
    sync: { state: 'synced', lastSuccessAt: timestamp, lastAttemptAt: timestamp, issue: '', failures: 0 }
  };
  return {
    stats: validStats(old) ? { ...old, displayName: player.displayName, lastSuccessAt, stale: true } : null,
    sync: { state: validStats(old) ? 'stale' : 'waiting', lastSuccessAt, lastAttemptAt: timestamp,
      issue, failures: (oldSync?.failures || 0) + 1 }
  };
}
function recoverPrevious(latest, history) {
  const recovered = { ...latest, players: { ...latest?.players }, sync: { ...latest?.sync } };
  const snapshots = [...(history?.snapshots || [])].sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt));
  for (const snapshot of snapshots) for (const [id, player] of Object.entries(snapshot.players || {})) {
    if (!recovered.players[id] && validStats(player)) {
      const lastSuccessAt = snapshot.sync?.[id]?.lastSuccessAt || player.lastSuccessAt || snapshot.fetchedAt;
      recovered.players[id] = { ...player, lastSuccessAt };
      recovered.sync[id] = { ...snapshot.sync?.[id], lastSuccessAt };
    }
  }
  return recovered;
}
module.exports = { preserveResult, validStats, recoverPrevious };
