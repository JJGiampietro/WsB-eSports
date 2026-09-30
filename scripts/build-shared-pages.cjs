// Mechanical HTML generation: one navigation source, one player shell.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), templates = path.join(root, 'templates');
const capture = process.argv.includes('--capture'), check = process.argv.includes('--check');
if (capture) {
  fs.writeFileSync(path.join(templates, 'player.html'), fs.readFileSync(path.join(root, 'stats/barrelroll/index.html'), 'utf8').replaceAll('barrelroll', '{{memberId}}').replaceAll('WsB Barrelroll77 Stats', 'Player Stats'));
  fs.writeFileSync(path.join(templates, 'member-editor.html'), fs.readFileSync(path.join(root, 'admin-members.html'), 'utf8'));
}
function write(file, text) {
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) throw new Error('Generated file needs rebuilding: ' + path.relative(root, file)); }
  else fs.writeFileSync(file, text);
}
const navigation = fs.readFileSync(path.join(templates, 'navigation.html'), 'utf8').trim();
function decorate(html, prefix) {
  html = html.replace(/<header class="nav">[\s\S]*?<\/header>/, navigation.replaceAll('{{root}}', prefix));
  html = html.replace(/firebase-member\.js\?v=[^"']+/g, 'firebase-member.js?v=workspace-1');
  html = html.replace(/firebase-admin\.js\?v=[^"']+/g, 'firebase-admin.js?v=workspace-1');
  if (!html.includes('workspace.css')) html = html.replace('</head>', '<link rel="stylesheet" href="' + prefix + 'workspace.css?v=1">\n</head>');
  if (!html.includes('sync-status.js')) html = html.replace(/<script src="([^"]*?)script\.js/, '<script src="' + prefix + 'sync-status.js?v=1"></script>\n<script src="$1script.js');
  if (!html.includes('site-enhancements.js')) html = html.replace('</body>', '<script type="module" src="' + prefix + 'site-enhancements.js?v=1"></script>\n</body>');
  return html;
}
const roster = JSON.parse(fs.readFileSync(path.join(root, 'data/roster.json'), 'utf8'));
const playerTemplate = decorate(fs.readFileSync(path.join(templates, 'player.html'), 'utf8'), '../../');
write(path.join(templates, 'player.html'), playerTemplate);
for (const member of roster) {
  if (!/^[a-z0-9-]+$/.test(member.id)) throw new Error('Unsafe roster ID');
  const dir = path.join(root, 'stats', member.id); if (!check) fs.mkdirSync(dir, { recursive: true });
  write(path.join(dir, 'index.html'), playerTemplate.replaceAll('{{memberId}}', member.id));
}
let editor = fs.readFileSync(path.join(templates, 'member-editor.html'), 'utf8');
editor = editor.replace('<option value="owner">Owner</option>', '<option value="owner">Owner</option><option value="admin">Admin (website access)</option>');
editor = editor.replace('CREATE<br>ACCESS.', 'CREATE<br>ACCESS.');
editor = editor.replace('<label>ACCESS STATUS', '<p class="member-form-full admin-role-note">Only Admin grants website privileges. Owner, Management, Creator, and Member are display roles.</p><label>ACCESS STATUS');
const editorBody = editor.match(/<section id="adminDashboard"[\s\S]*?<\/main>/)[0].replace(/<section id="adminDashboard"[^>]+>/, '').replace(/\s*<\/section>\s*<\/main>$/, '');
let bounty = fs.readFileSync(path.join(root, 'bounties.html'), 'utf8');
if (!bounty.includes('id="editExpiry"')) bounty = bounty.replace('<label class="bounty-field">Status<select id="editStatus">', '<label class="bounty-field">Deadline (your local time; optional)<input id="editExpiry" type="datetime-local"></label><label class="bounty-field">Eligibility rules<textarea id="editEligibility" maxlength="1000" rows="3"></textarea></label><label class="bounty-field">Dispute policy<textarea id="editDisputePolicy" maxlength="1000" rows="3"></textarea></label><label class="bounty-field">Status<select id="editStatus">');
if (!bounty.includes('id="disputeDialog"')) bounty = bounty.replace('<dialog id="removeDialog"', '<dialog id="disputeDialog" class="bounty-dialog" aria-labelledby="disputeTitle"><button id="closeDispute" class="bounty-close" aria-label="Close review request">×</button><h2 id="disputeTitle">REQUEST A REVIEW</h2><form id="disputeForm"><input id="disputeClaimId" type="hidden"><label class="bounty-field">What should the team reconsider?<textarea id="disputeMessage" maxlength="600" rows="4" required></textarea></label><p id="disputeError" role="alert"></p><button id="submitDispute" class="bounty-btn" type="submit">SEND REQUEST</button></form></dialog>\n<dialog id="removeDialog"');
write(path.join(root, 'bounties.html'), decorate(bounty, ''));
const bountyBoard = bounty.match(/<section id="board"[\s\S]*?<section class="bounty-rules">/)[0].replace(/<section class="bounty-rules">$/, '');
const dialogs = bounty.match(/<dialog id="claimDialog"[\s\S]*?<script src=/)[0].replace(/<script src=$/, '');
const contentTemplate = fs.readFileSync(path.join(templates, 'content-editor.html'), 'utf8');
const contentPanels = ['events', 'announcements'].map(kind => {
  const dates = kind === 'events' ? '<label>Start date / time (optional)<input id="eventsStartsAt" type="datetime-local"></label><label>End date / time (optional)<input id="eventsEndsAt" type="datetime-local"></label><label>Event status<select id="eventsEventState"><option value="upcoming">Upcoming / in progress</option><option value="ended">Ended</option><option value="cancelled">Cancelled</option></select></label>' : '<label>Announcement date (optional)<input id="announcementsPublishedAt" type="datetime-local"></label><label>Countdown target (optional)<input id="announcementsCountdownAt" type="datetime-local"></label><label class="bounty-check"><input id="announcementsFeatured" type="checkbox"><span>Feature this announcement at the top</span></label>';
  const extra = kind === 'events' ? '<label>Winner / result<input id="eventsResult" maxlength="200" placeholder="WsB won / Winner: Player"></label><div class="content-field-grid"><label>Mode / format<input id="eventsMode" maxlength="120" placeholder="Solo Reload Custom"></label><label>Prize (optional)<input id="eventsReward" maxlength="120" placeholder="$40"></label></div><label>Participating players (one name per line)<textarea id="eventsParticipants" maxlength="4000" rows="4"></textarea></label>' : '';
  return contentTemplate.replaceAll('{{kind}}', kind).replaceAll('{{heading}}', kind[0].toUpperCase() + kind.slice(1)).replaceAll('{{noun}}', kind === 'events' ? 'event' : 'announcement').replaceAll('{{actionNoun}}', kind === 'events' ? 'EVENT' : 'ANNOUNCEMENT').replace('{{fields}}', '<div class="content-field-grid">' + dates + '</div>' + extra);
}).join('\n');
const panels = `
<div class="admin-workspace-tabs" role="tablist" aria-label="Administration">
${['Overview', 'Members', 'Events', 'Announcements', 'Bounties', 'Rewards', 'Activity', 'Backups', 'Status'].map((name, i) => '<button id="admin-tab-' + name.toLowerCase() + '" role="tab" aria-controls="admin-panel-' + name.toLowerCase() + '" data-admin-view="' + name.toLowerCase() + '" aria-selected="' + (!i) + '" tabindex="' + (i ? '-1' : '0') + '">' + name + '</button>').join('')}
</div>
<section id="admin-panel-overview" data-admin-panel="overview" role="tabpanel" aria-labelledby="admin-tab-overview"><h2>Your team, at a glance.</h2><div id="adminOverview" class="admin-metrics" aria-live="polite"></div><h3>Member sync health</h3><div class="admin-health-controls"><label>Search members<input id="adminSyncSearch" type="search" placeholder="Name or profile ID"></label><label>Show<select id="adminSyncFilter"><option value="issues">Needs attention</option><option value="all">All members</option><option value="synced">Up to date</option></select></label><button id="adminRefreshHealth" class="bounty-btn secondary">REFRESH STATUS</button></div><p id="adminHealthStatus" role="status"></p><div id="adminSyncList" class="admin-table-list"></div></section>
<section id="admin-panel-members" data-admin-panel="members" role="tabpanel" aria-labelledby="admin-tab-members" hidden><div class="admin-member-columns">${editorBody}</div></section>
${contentPanels}
<section id="admin-panel-bounties" data-admin-panel="bounties" role="tabpanel" aria-labelledby="admin-tab-bounties" hidden><div class="bounty-preview"><span id="bountyAccountStatus" role="status">Checking access…</span><button id="bountySignIn" hidden>Sign in</button></div><div id="bountyError" role="alert" hidden></div>${bountyBoard}<h3>Dispute requests</h3><div id="adminDisputes" class="admin-table-list"></div></section>
<section id="admin-panel-rewards" data-admin-panel="rewards" role="tabpanel" aria-labelledby="admin-tab-rewards" hidden><h2>Reward delivery.</h2><p>Approval and payment are separate. Never include gift-card codes or payment details in notes.</p><div id="adminRewards" class="admin-table-list"></div></section>
<section id="admin-panel-activity" data-admin-panel="activity" role="tabpanel" aria-labelledby="admin-tab-activity" hidden><h2>Activity log.</h2><p>Recent website actions, with the account responsible. Historical actions before this update are not available.</p><label>Filter activity<input id="adminActivitySearch" type="search" placeholder="Name, action, or target"></label><div id="adminActivityList" class="admin-table-list"></div></section>
<section id="admin-panel-backups" data-admin-panel="backups" role="tabpanel" aria-labelledby="admin-tab-backups" hidden><h2>Private backups.</h2><p>Download an encrypted copy of profiles, account links, profile images, bounties, claims, and operational history. Store it privately outside GitHub, with a separate copy of the passphrase.</p><p>No Blaze upgrade. This is a manual Firestore data backup, not an export of Google accounts or authentication credentials.</p><label>Backup passphrase (at least 16 characters)<input id="backupPassphrase" type="password" minlength="16" autocomplete="new-password"></label><button id="backupExport" class="bounty-btn">DOWNLOAD ENCRYPTED BACKUP</button><hr><h3>Verify / restore a backup</h3><label>Encrypted backup file<input id="backupFile" type="file" accept=".json"></label><button id="backupInspect" class="bounty-btn secondary">VERIFY BACKUP</button><p id="backupSummary" role="status"></p><p>Restoration is tested locally first. Production restore is deliberately locked until this local review is approved. Administrator grants, notifications, and immutable activity/evidence are exported but never blindly overwritten.</p><label class="bounty-check"><input id="backupConfirm" type="checkbox"><span>I understand this merges profile and account-link records into the local test database only.</span></label><button id="backupRestore" class="bounty-btn secondary" disabled>RESTORE TO LOCAL TEST DATABASE</button><p id="backupStatus" role="status"></p></section>
<section id="admin-panel-status" data-admin-panel="status" role="tabpanel" aria-labelledby="admin-tab-status" hidden><h2>Publishing & protection.</h2><div id="adminPublishStatus"></div><p>Production releases require automatic navigation, stats, member workflow, backup, and permission tests.</p><a class="bounty-btn secondary" href="https://github.com/adetrick7/WsB-eSports/actions" target="_blank" rel="noopener">VIEW PUBLISHING RUNS ↗</a><h3>Abuse protection</h3><p>App Check is not enforced yet. Register a provider, observe legitimate traffic, and test Google sign-in before enabling enforcement. Browser headers are prepared without blocking existing scripts or media.</p></section>`;
let adminPage = editor.replace(/<title>.*?<\/title>/, '<title>WsB | Admin Workspace</title>')
  .replace(/admin-members\.html/g, 'admin.html')
  .replace(/<section class="member-account-hero[\s\S]*?<section id="adminAuthPanel"/, '<div class="admin-workspace-heading"><p class="label">WsB ADMIN</p><h1>Team workspace.</h1><p>Members, invites, bounties, rewards, and site health in one place.</p></div>\n<section id="adminAuthPanel"')
  .replace(/<section id="adminDashboard"[\s\S]*?<\/main>/, '<section id="adminDashboard" class="admin-workspace" hidden>' + panels + '</section>\n</main>')
  .replace('</body>', dialogs + '<script type="module" src="bounties.js?v=workspace-1"></script><script type="module" src="admin-workspace.js?v=1"></script><script type="module" src="admin-content.js?v=1"></script>\n</body>')
  .replace('</head>', '<link rel="stylesheet" href="bounties.css?v=3">\n</head>');
write(path.join(root, 'admin.html'), decorate(adminPage, ''));
// Legacy admin URL remains usable; there is only one admin UI source.
const legacy = editor.slice(0, editor.indexOf('<body>')) + '<body><main><p>Opening the admin workspace… <a href="admin.html#members">Continue</a></p></main><script>location.replace("admin.html#members");</script></body></html>\n';
write(path.join(root, 'admin-members.html'), legacy);
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html') && !['admin.html', 'admin-members.html'].includes(f))) write(path.join(root, file), decorate(fs.readFileSync(path.join(root, file), 'utf8'), ''));
const eventDir = path.join(root, 'events');
for (const directory of fs.readdirSync(eventDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
  const file = path.join(eventDir, directory.name, 'index.html'); if (fs.existsSync(file)) write(file, decorate(fs.readFileSync(file, 'utf8'), '../../'));
}
const publicRoutes = ['/', 'management.html', 'members.html', 'stats.html', 'leaderboards.html', 'events.html', 'announcements.html', 'questions.html', 'privacy.html', ...roster.map(m => 'stats/' + m.id + '/')];
write(path.join(root, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + publicRoutes.map(p => '<url><loc>https://wsb-esports.web.app/' + p.replace(/^\//, '') + '</loc></url>').join('\n') + '\n</urlset>\n');
console.log('Shared navigation, player shells, admin workspace, and sitemap ' + (check ? 'verified.' : 'generated.'));
