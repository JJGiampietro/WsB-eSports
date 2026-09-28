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

Each `memberId` must match the permanent ID in `data/roster.json`, such as `bri` or `lizzie`.

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

1. Create the member with their permanent roster ID, display name, Fortnite username, role, and Gmail address.
2. Select **Save Member**.
3. Select **Open Email Invite**. This opens a prepared Gmail/email draft; the admin reviews it and clicks Send.
4. The recipient opens `member-account.html` and signs in using that exact Gmail. The page claims their profile automatically.

For an existing member, select **Edit**, change their invite Gmail, and tick **Reset profile access** only when that profile must move to a different Google account. This removes the previous account's editing access and prepares the new invite.

The current no-billing setup prepares the email in the admin's mail app; it does not send email automatically. Automatic delivery can be added later through a secure backend and an email service.

## Profile images

Do not add image upload controls until Cloud Storage is enabled and its separate Storage rules are in place.
