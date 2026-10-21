const assert = require('node:assert/strict');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore');
module.exports = async env => {
  const admin = env.authenticatedContext('directory-admin', {email:'directory-admin@wsb-test.invalid',email_verified:true}).firestore();
  const member = env.authenticatedContext('directory-member', {email:'directory-member@wsb-test.invalid',email_verified:true}).firestore();
  const anon = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,'admins','directory-admin'), {enabled:true});
    await setDoc(doc(db,'memberAccess','directory-member'), {role:'member',status:'active',ownerUid:'directory-member',invitedEmail:'directory-member@wsb-test.invalid'});
  });
  for (const role of ['owner','management','member','creator','hr','developer']) {
    const batch = writeBatch(admin);
    batch.update(doc(admin,'memberAccess','directory-member'), {role,updatedAt:serverTimestamp()});
    batch.set(doc(admin,'memberMemberships','directory-member'), {role,updatedAt:serverTimestamp()});
    await assertSucceeds(batch.commit());
    const entry = (await assertSucceeds(getDoc(doc(anon,'memberMemberships','directory-member')))).data();
    assert.equal(entry.role,role); assert.deepEqual(Object.keys(entry).sort(),['role','updatedAt']);
    await assertFails(getDocs(collection(member,'memberAccess')));
  }
  await assertFails(updateDoc(doc(member,'memberAccess','directory-member'), {websiteAdmin:true}));
  await assertFails(setDoc(doc(member,'admins','directory-member'), {enabled:true,memberId:'directory-member'}));
  await assertFails(setDoc(doc(admin,'memberAccess','new-legacy-admin'), {role:'admin',status:'invited',ownerUid:null,invitedEmail:''}));
  await assertFails(updateDoc(doc(admin,'memberAccess','directory-member'), {websiteAdmin:'true'}));
  await assertSucceeds(getDocs(collection(anon,'memberMemberships')));
  await assertFails(getDoc(doc(anon,'memberAccess','directory-member')));
  await assertFails(getDocs(collection(anon,'memberAccess')));
  for (const db of [anon,member]) await assertFails(setDoc(doc(db,'memberMemberships','directory-member'), {role:'owner',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'memberMemberships','directory-member'), {role:'owner',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'memberMemberships','directory-member'), {role:'admin',invitedEmail:'private@example.invalid',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'memberMemberships','directory-member'), {role:'admin',updatedAt:Timestamp.fromMillis(0)}));
  await assertFails(setDoc(doc(admin,'memberMemberships','no-private-membership'), {role:'owner',updatedAt:serverTimestamp()}));
  console.log('PASS: public role-only directory, atomic membership projection, private account details protected, no self-promotion, mismatched roles/extra fields/stale timestamps rejected.');
};
