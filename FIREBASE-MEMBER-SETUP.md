# WsB member profile setup

The public site stays public. Google sign-in is only for a member to edit their own display name, bio, and social links.

## Publish the Firestore rules

1. In Firebase Console, open **Build > Firestore Database > Rules**.
2. Replace the current rules with the contents of `firestore.rules`.
3. Click **Publish**.

## Make the first Firebase admin

1. Open `member-account.html` locally or on the deployed site and sign in with the Google account that should be an admin.
2. Copy the account ID shown if the page says it is not linked.
3. In Firebase Console, open **Build > Firestore Database > Data**.
4. Create collection `admins`.
5. Create one document whose document ID is that account ID. It can contain a field such as `label: "WsB administrator"`.

Firebase Console access bypasses the website rules, so this is the safe one-time bootstrap step.

## Link a member to their profile

For an existing roster member, the profile record uses that member's existing permanent roster ID, such as `bri` or `lizzie`. The admin page handles this automatically.

1. An admin creates `memberAccess/{memberId}` with `invitedEmail` set to the member's Google email, `ownerUid` set to `null`, and `status` set to `invited`.
2. Create `members/{memberId}` with these starting fields:

```text
displayName: "WsB display name"
bio: ""
socials: {
  tiktok: ""
  twitch: ""
  youtube: ""
  instagram: ""
}
```

3. Send the member the link to `member-account.html` and tell them to sign in with that Google email. Their account is linked automatically on first sign-in.

The member can now update only the public details in that `members/{memberId}` document. They cannot edit their Fortnite identity, account link, role, membership, or any other member.

## Admin dashboard

Use `admin-members.html` for creating a member profile, updating an invite email, and preparing an invite email. It is protected by the `admins/{uid}` collection. The first admin document must still be created in the Firebase Console as described above.

1. Create the member with their display name, Fortnite username, role, and Gmail address. Admins do not enter a member ID or Fortnite account ID.
2. Select **Save Member**.
3. For a new member, the entry is queued for the next hourly roster refresh. That private job adds them to the public roster, finds their stable Epic account ID, and creates their stats page.
4. Copy the prepared invite message and send it through Discord, TikTok, or another contact method.
5. The recipient opens `member-account.html` and signs in using that exact Gmail. The page claims their profile automatically.

For an existing member, select **Edit**, change their invite Gmail, and tick **Reset profile access** only when that profile must move to a different Google account. This removes the previous account's editing access and prepares the new invite.

The current no-billing setup prepares the email in the admin's mail app; it does not send email automatically. Automatic delivery can be added later through a secure backend and an email service.

## Automated new-member roster sync

The hourly GitHub workflow can read newly created member records from Firebase without exposing any credential to the website. This is free and does not require Firebase Storage or the Blaze plan.

1. In Google Cloud Console for `wsb-esports`, open **IAM & Admin > Service Accounts**.
2. Create a service account such as `wsb-roster-sync`.
3. Grant it the **Cloud Datastore User** role for this project.
4. Create a JSON key for that service account and download it once.
5. In the WsB GitHub repository, open **Settings > Secrets and variables > Actions** and create a repository secret named `FIREBASE_SERVICE_ACCOUNT`.
6. Paste the complete JSON key into that secret, then delete the downloaded key file from your computer when finished.

The key stays private in GitHub Actions. Never paste it into the website, a chat, or a public file. Once the secret is present, new members created by an admin are picked up at the next top-of-hour refresh. If Fortnite lookup succeeds, their stable Epic account ID is stored automatically; if it fails, the admin dashboard keeps them marked as awaiting sync so the Fortnite name can be corrected.

## Profile images

Profile icons are stored as small optimized avatars in the existing Firestore member profile. Members can change only their own image, while admins can set any member's image from the Member Admin page. No Firebase Storage plan is required.
