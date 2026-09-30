// Offline schema upgrade only. Never claims a new API refresh or changes fetchedAt.
const fs = require('node:fs'), path = require('node:path');
const { recoverPrevious } = require('./stats-resilience.cjs');
const root = path.resolve(__dirname, '..'), latestFile = path.join(root, 'data/latest.json'), historyFile = path.join(root, 'data/history.json');
const latest = JSON.parse(fs.readFileSync(latestFile, 'utf8')), history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
if (latest.schemaVersion === 2) { console.log('Stats snapshot already uses per-member sync metadata.'); process.exit(0); }
const recovered = recoverPrevious(latest, history), roster = JSON.parse(fs.readFileSync(path.join(root, 'data/roster.json'), 'utf8'));
const output = { schemaVersion: 2, fetchedAt: latest.fetchedAt, players: {}, sync: {} };
for (const member of roster) {
  const player = recovered.players[member.id], fresh = Boolean(latest.players[member.id]);
  const lastSuccessAt = player?.lastSuccessAt || (player ? latest.fetchedAt : null);
  if (player) output.players[member.id] = { ...player, lastSuccessAt, stale: !fresh };
  output.sync[member.id] = { state: fresh ? 'synced' : player ? 'stale' : 'waiting', lastSuccessAt, lastAttemptAt: latest.fetchedAt,
    failures: fresh ? 0 : 1, issue: fresh ? '' : 'The previous refresh returned no data for this account. It will retry hourly; verify the Epic username and Public Game Stats if the issue continues.' };
}
fs.writeFileSync(latestFile, JSON.stringify(output, null, 2) + '\n');
history.snapshots = history.snapshots.map(s => s.fetchedAt === output.fetchedAt ? output : s);
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2) + '\n');
console.log('Offline upgrade: ' + Object.values(output.sync).filter(s => s.state === 'stale').length + ' retained outdated profiles; timestamp unchanged.');
