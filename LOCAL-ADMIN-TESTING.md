# Local admin workspace and reliability update

Status: local branch only (`feature/admin-workspace-local`). Nothing is pushed or deployed. No billing upgrade is enabled.

## Test here

- Website: http://localhost:8000/
- All-in-one administration: http://localhost:8000/admin.html
- Member account and preview: http://localhost:8000/member-account.html
- Bounties: http://localhost:8000/bounties.html

Localhost always uses `demo-wsb-local`, Auth port 9199 and Firestore port 8186. It never falls back to production. The local page displays a test banner; Admin/Member/Owner/Invited-member buttons sign in to seeded, fake test accounts, not Google accounts. Owner is a display role and cannot administer the site.

If emulators are stopped, start them with `.tests/bounties/node_modules/.bin/firebase emulators:start --config .local-emulator.json --project demo-wsb-local --only firestore,auth` (Java 21 required), then run `node scripts/seed-local.cjs`. Seeding overwrites only clearly marked test fixtures; do not run it after making local test changes you want to keep. Test data resets when emulators stop unless it is exported separately.

## What changed

1. Stats retain the last valid numbers on failures, record per-player success/attempt/error and retry transient failures with timeouts. The local JSON was upgraded offline, including two recoverable profiles from history. Its original refresh timestamp is preserved; no new live API fetch is claimed.
2. Members, stats directories, player pages and the admin overview show fresh/outdated/waiting status. Period comparisons exclude retained stale snapshots and match stable IDs, not changing display names.
3. `admin.html` consolidates overview, searchable member/invite editing, events, announcements, bounties, reviews/disputes, reward delivery, activity, backups and release health. The legacy admin URL redirects here.
4. Website Admin is distinct from display roles. Admin invitations grant privileges only when claimed with the verified matching email. Linked Admin grants are checked against active membership; demotion/inactivation revokes privileges immediately. Existing manually provisioned administrators remain bootstrap administrators, not privileges derived from Owner labels. Self-removal of linked Admin access is blocked.
5. Website admin saves write append-only activity entries atomically with the change. An actor cannot spoof another account or rewrite an entry. This is an application activity log, not a replacement for Google Cloud audit logging; direct project-console/admin-SDK changes bypass these browser flows.
6. Members have a live public preview, unsaved-change prompts, square image zoom/repositioning, and private notifications. Administrators can edit profiles without silently overwriting concurrent changes.
7. Bounty deadlines are enforced by server rules, with eligibility, evidence, disputes and private reward delivery tracked separately from approval. The deadline is the submission cutoff; existing evidence can be reviewed afterward.
8. Public pages share generated navigation/player shells, larger labels, a home activity strip, sitemap, robots guidance and a plain-language privacy page. Player detail pages fetch a single public profile rather than the whole image collection.
9. Every Firebase publish path, including recovery, has the same isolated security/workflow/recovery/navigation test gate. Templates are not hosted.
10. Hosting security headers are prepared, with CSP **report-only**. App Check has an optional initializer but no provider key and no enforcement.

## Events and announcements

Use the Events or Announcements tab in the same admin workspace. Select an existing item to edit it, or choose New. The first save imports the existing public copy for that content type, in the same transaction as your edit. Existing published records are never overwritten by the import. No manual production import has been performed.

Draft and Archived records are admin-readable only. Published items update public pages and the home activity section live, without a repository commit. Archived items remain in backups/history and can be republished. Smaller display-order values come first; featured announcements are pinned above non-featured ones. Dates are entered in the admin browser's time zone, stored as exact timestamps, and displayed in Pacific Time. Event end/cancellation removes its countdown. Participants are one name per line.

Editors include public previews, unsaved-change confirmation, and revision checks that reject concurrent overwrites. Content is plain text, not executable HTML. Optional links accept HTTPS or supported site paths only. Each save is logged atomically, and content is included in encrypted backups. Existing detail-page URLs remain unchanged; this editor manages event cards, not historical standalone result-page HTML.

## Backups and recovery

The Backups tab downloads AES-256-GCM-encrypted Firestore data, with a fresh random salt/IV and PBKDF2-SHA256 key derivation (310,000 iterations). Encryption happens in the browser before download. The passphrase is not sent to Firebase, logged, or stored. Keep the passphrase and at least two encrypted copies in separate private locations, never in GitHub or a public folder. Losing the passphrase makes recovery impossible.

Export includes `members`, `memberAccess`, `admins`, `bounties`, `bountyClaims`, `bountyRewards`, `claimDisputes`, `adminActivity`, `notifications`, `siteEvents`, `siteAnnouncements`, and `siteContentState`, including embedded images and Firestore timestamps. It does not export Firebase Authentication accounts, Google credentials, code, or hosting configuration. Collection reads are not a transactional point-in-time snapshot; take a backup during a quiet period, before major changes, and periodically. Firestore read quotas still apply even without a billing upgrade.

Verify the encrypted file and its project before restoring. The browser merge restores profiles and non-Admin account links **only to the local database**, without deleting anything or importing administrator grants. Production restoration remains locked for this test phase. Immutable evidence/activity and full history are recovered using a privileged offline recovery process, never relaxed public security rules. The automated recovery drill restores profiles, account links, images, bounties, claims and activity to an isolated demo emulator and verifies every record; wrong passphrases, tampering and cross-project files fail before writes.

These manual backups are not Firebase's managed disaster-recovery service. Managed exports require billing: https://firebase.google.com/docs/firestore/manage-data/export-import

## Verification

Run from the repository:

```
node scripts/build-shared-pages.cjs --check
node .tests/bounties/static.test.cjs
```

Run from `.tests/bounties`, with Java 21 available:

```
node_modules/.bin/firebase emulators:exec --config ../../.bounty-emulator.json --project demo-wsb-bounties --only firestore,auth "node rules.test.cjs && node operations.test.cjs && node browser.test.cjs && node workspace-browser.test.cjs && node content.test.cjs"
```

The automated tests use separate demo ports 8185/9198; they cannot reset the interactive local preview. With the local demo running, `node .tests/bounties/local-preview.test.cjs` checks the actual local SDK and desktop/tablet/phone pages. `node .tests/migration/verify.cjs` checks old-link redirects and deployment packaging without deploying anything.

## Before eventual production approval

- Back up production data privately, review grants and test a representative Admin/member flow in a separate environment.
- Deploy and verify the updated Firestore rules **before** the new browser UI. The hosting service account has Hosting permissions only; this branch does not add IAM privileges or deploy rules automatically.
- Merge only after local review. Stats jobs then generate new profiles/sitemap from shared templates and retain stale data automatically. The local branch currently includes no live data mutations.
- Do not enable App Check enforcement until registering a reCAPTCHA provider, configuring the allowed domains, testing real Google sign-in, and monitoring legitimate request metrics. The public site key belongs in `security-config.js`; never publish a debug token. Review provider quotas/pricing before activation. Guidance: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- CSP remains report-only while testing Firebase sign-in, hosted clips and other external resources. Review browser warnings and tighten the allowlist before considering enforcement. Do not add COOP `same-origin`, which can interfere with popup sign-in.
