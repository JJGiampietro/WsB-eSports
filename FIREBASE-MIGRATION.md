# Firebase is the primary website

Public URL: **https://wsb-esports.web.app/**

The canonical source remains `adetrick7/WsB-eSports`, branch `main`. GitHub is still used for source control and scheduled Fortnite API jobs, not as the primary public host. No paid plan, data copy, new authentication project, or custom domain is required.

## Publishing and hourly stats

- Merge website changes into canonical `main`. Firebase Hosting Production publishes the complete current main checkout.
- Fortnite Stats Refresh runs hourly, using the existing private GitHub secrets. Stable Epic account IDs and pending Firebase roster requests continue to work unchanged.
- A successful stats job triggers a Firebase production release through `workflow_run`, including newly generated player pages. GitHub's bot commits alone do not trigger push workflows.
- Firebase Hourly Stats Sync is a recovery check. It compares the public `deployment.json` with current main and publishes only if needed.
- Production and recovery share one deployment queue. All deployment jobs check out current main rather than mixing old fork code with fresh player data. Forks do not publish or run scheduled stats.
- Each live release verifies its publicly served source commit and stats timestamp. GitHub Actions reports a failure if verification fails.
- `deployment.json` contains only public release metadata, not credentials. Check it against `data/latest.json` and the canonical main commit when investigating freshness.
- Scheduled GitHub jobs can be delayed. “Hourly” is the intended cadence, not a guaranteed exact start time.

## Accounts, profiles, images and bounties

Firebase Auth and Firestore remain in the existing `wsb-esports` project. Member IDs, Google UID links, invites, roles, bios, socials, icons, bounties, and claims are retained. Fortnite refreshes still use the existing service account secret. Browser Firebase configuration is public; API keys for Fortnite and service-account credentials remain server-side.

Invitations always link to the Firebase member-account page. Google sign-in opens the existing popup and retains the same approved accounts. A session on GitHub Pages is not transferred between domains; a member may need to sign in once on Firebase. Existing Firestore rules are unchanged, and access is still enforced there, not merely by hiding admin controls.

## Existing GitHub Pages links

Every HTML page forwards visits on `adetrick7.github.io/WsB-eSports` to the matching Firebase path, preserving query strings and anchors. Firebase and localhost do not redirect. The player-page generator inherits the redirect from its existing template. The 404 page also forwards old/deep links.

The repository owner **does not need to disable GitHub Pages**. Keeping it published preserves those old links. Disabling it later makes those links stop forwarding. If JavaScript is disabled, the old static copy can still be visible; the forwarding is not an access-control or unpublishing mechanism.

## Administration and future rules changes

Content/profile/bounty changes saved in Firestore remain live immediately. Static HTML/CSS/JS edits publish after the main-branch workflow succeeds. Firestore rules are not deployed by Hosting workflows; when changing rules, test them and use the Firebase CLI `firebase deploy --only firestore:rules --project wsb-esports` with an authorized administrator before publishing dependent client changes.

Deployment uses short-lived Google workload identity, restricted to the canonical repository's immutable ID, owner ID, and main branch. No new long-lived Hosting key is required. Maintenance scripts, dot-directories, generated Google credentials, and rules/configuration are excluded from Hosting assets.

## Rollback

Use Firebase Console → Hosting → release history to roll back a bad Hosting release. The pre-migration Hosting version was `90be1593a740c636` (September 30, 2026). Revert the relevant canonical code change as well: otherwise the automatic recovery check will republish current main. Do not delete the Firebase project or Firestore data. GitHub forwarding can be reverted independently if necessary.
