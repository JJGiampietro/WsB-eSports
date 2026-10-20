# Bounty verification

Run `npm ci` in this directory. Tests require Node 20+, Java 21+, and Microsoft Edge for the browser suite. Start the website at http://localhost:8000 from the repository root before browser testing.

- `npm test`: Firestore authorization and data-integrity scenarios.
- `npm run test:browser`: member/admin interactions and persistence against Auth/Firestore emulators.

Both commands use the root `.bounty-emulator.json` and the isolated `demo-wsb-bounties` project. They do not create production data. Browser tests intercept the Firebase initialization module only inside the test browser; the website contains no emulator bypass. Generated screenshots and installed dependencies are ignored by Git and excluded from Hosting.

## Production behavior

Existing `admins/{uid}` documents grant bounty management/review permissions. Active linked members can submit one claim per bounty, and resubmit a denied claim while the bounty remains open. Unlinked accounts cannot submit. Claim evidence is readable only by its owner and admins; external video visibility is controlled by its host.

Admins create/edit/pause bounties. Remove archives a bounty and hides its claims from My Claims (including admin-owned claims) and the default review list. Evidence remains available through the admin-only Show removed bounty history option. Approval atomically closes the bounty and records its winning claim, preventing multiple winners. Rewards are delivered manually, not paid by the website.

Only HTTPS YouTube, Streamable, and Twitch Clips links are accepted. Firebase stores the link and claim details, not video files. No Storage bucket, Cloud Functions, or billing-plan upgrade is used.

Admins can upload PNG, JPEG, or WebP artwork up to 5 MB. The shared profile-icon helper center-crops and compresses it to a 256px square, stored as a bounded raster data URL in the bounty document (under 200,000 characters). No Firebase Storage is used. Existing stock artwork remains supported; removing an image restores the WsB crest.

Deploy the updated `firestore.rules` before publishing the image-upload UI. The page is linked under Community → Bounties and is also available at `/bounties.html`. No sample bounties are seeded in production.

## Inactive website access

The local member editor uses three keyboard-accessible views: Profile, Roles & badges, and Access & visibility. Profile edits have a side-by-side live preview on desktop. Switching views keeps the draft; native validation reveals the view containing the first invalid field. Membership is form-associated with the main member form even though it is presented alongside badges, so full saves and unsaved-change protection still include it. Role and badge buttons continue to save independently. `member-editor-browser.cjs` covers layout, keyboard navigation, hidden-field validation and draft preservation.

Existing roster members also have a separate **Save Membership Role** button. It saves only `memberAccess.role`, without requiring Gmail or saving profile edits. An uninvited member receives an unclaimed role record with no email and no login grant; this is not counted as a pending invitation. Adding a real invitation later still requires Gmail. Only Admin grants privileges, and only for an active linked account. Role-only promotion/demotion updates grants atomically, prevents self-demotion and rejects concurrent access edits. These behaviors are covered by `membership-role-browser.cjs` in the workspace browser suite.

In Admin → Members, **Deactivate Access** signs out the linked Gmail and blocks authenticated member/admin features. **Restore Access** restores the existing account link (or its pending invitation). The Access Status dropdown applies the same restriction. Deactivation preserves the profile, stats, history and public visibility; **Hide Profile** remains a separate control. Public pages remain public.

Deactivation atomically writes the member's inactive status and private `accountRestrictions/{lowercase-email}` marker. Firestore checks that marker on authenticated operations, so an old token cannot retain access. Every page also watches access and signs the user out with an explanation. Existing inactive access records are brought under server enforcement when an admin loads the member editor. These markers are included in encrypted backups; local restoration rebuilds them with account links rather than blindly importing restrictions.

Deploy the updated rules together with the new account modules and member editor. Old admin clients cannot save an inactive status without its matching restriction. Verify with isolated emulators before publishing: `operations.test.cjs` includes inactive-account rules tests, and `workspace-browser.test.cjs` includes deactivation, existing-session sign-out, repeated sign-in denial, member/admin restoration and legacy migration tests. Never deactivate real members as a test.
