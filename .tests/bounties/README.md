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
