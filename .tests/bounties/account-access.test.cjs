const assert=require('node:assert/strict');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp}=require('firebase/firestore');
const {assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
module.exports=async env=>{
  const root=env.authenticatedContext('access-root',{email:'access-root@wsb-test.invalid',email_verified:true}).firestore();
  const member=env.authenticatedContext('access-member',{email:'access-member@wsb-test.invalid',email_verified:true}).firestore();
  const pending=env.authenticatedContext('access-pending',{email:'access-pending@wsb-test.invalid',email_verified:true}).firestore();
  const admin=env.authenticatedContext('access-admin',{email:'access-admin@wsb-test.invalid',email_verified:true}).firestore();
  const outsider=env.authenticatedContext('access-outsider',{email:'outsider@wsb-test.invalid',email_verified:true}).firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const email=id=>id+'@wsb-test.invalid';
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),now=Timestamp.now();
    for(const id of ['access-root','access-admin']) await setDoc(doc(db,'admins',id),{enabled:true});
    for(const id of ['access-root','access-member','access-pending','access-admin']) {
      await setDoc(doc(db,'memberAccess',id),{memberId:id,ownerUid:id==='access-pending'?null:id,invitedEmail:email(id),role:id==='access-admin'||id==='access-root'?'admin':'member',status:id==='access-pending'?'invited':'active',updatedAt:now});
      await setDoc(doc(db,'members',id),{displayName:id,bio:'Keep this profile',socials:{},profileImage:'',updatedAt:now});
    }
    await setDoc(doc(db,'bounties','access-target'),{targetName:'Access target',status:'open'});
    await setDoc(doc(db,'bountyClaims','access-claim'),{ownerUid:'access-member',status:'pending'});
    await setDoc(doc(db,'notifications','access-notice'),{ownerUid:'access-member',read:false});
    await setDoc(doc(db,'bountyRewards','access-reward'),{ownerUid:'access-member'});
  });
  const blockData=id=>({memberId:id,blocked:true,updatedAt:serverTimestamp()});
  async function setInactive(db,id){const batch=writeBatch(db);batch.update(doc(db,'memberAccess',id),{status:'inactive',updatedAt:serverTimestamp()});batch.set(doc(db,'accountRestrictions',email(id)),blockData(id));return batch.commit();}
  async function setActive(db,id,status='active'){const batch=writeBatch(db);batch.update(doc(db,'memberAccess',id),{status,updatedAt:serverTimestamp()});batch.delete(doc(db,'accountRestrictions',email(id)));return batch.commit();}
  await assertSucceeds(getDoc(doc(member,'bounties','access-target')));
  await assertSucceeds(getDoc(doc(member,'bountyClaims','access-claim')));
  // Admin status changes must atomically include their login restriction.
  await assertFails(updateDoc(doc(root,'memberAccess','access-member'),{status:'inactive',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(root,'accountRestrictions',email('access-member')),blockData('access-member')));
  await assertSucceeds(setInactive(root,'access-member'));
  // The context is deliberately retained: these are old authenticated tokens.
  await assertFails(getDoc(doc(member,'bounties','access-target')));
  await assertFails(getDocs(collection(member,'bounties')));
  await assertFails(getDoc(doc(member,'bountyClaims','access-claim')));
  await assertFails(getDoc(doc(member,'notifications','access-notice')));
  await assertFails(getDoc(doc(member,'bountyRewards','access-reward')));
  await assertFails(getDoc(doc(member,'memberAccess','access-member')));
  await assertFails(updateDoc(doc(member,'members','access-member'),{bio:'Blocked edit',updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(member,'accountRestrictions',email('access-member'))));
  for(const db of [member,outsider,anonymous]){
    await assertFails(deleteDoc(doc(db,'accountRestrictions',email('access-member'))));
    await assertFails(setDoc(doc(db,'accountRestrictions',email('access-outsider')),blockData('access-member')));
    await assertFails(getDocs(collection(db,'accountRestrictions')));
  }
  await assertFails(getDoc(doc(outsider,'accountRestrictions',email('access-member'))));
  await assertFails(getDoc(doc(anonymous,'accountRestrictions',email('access-member'))));
  // Public pages remain public; deactivation is not deletion or Hide Profile.
  assert.equal((await assertSucceeds(getDoc(doc(anonymous,'members','access-member')))).data().bio,'Keep this profile');
  assert.equal((await getDoc(doc(anonymous,'memberVisibility','access-member'))).exists(),false);
  await assertSucceeds(setActive(root,'access-member'));
  await assertSucceeds(getDoc(doc(member,'bounties','access-target')));
  await assertSucceeds(updateDoc(doc(member,'members','access-member'),{bio:'Restored editing',updatedAt:serverTimestamp()}));
  // An inactive invitation blocks the Gmail before an account has claimed it.
  await assertSucceeds(setInactive(root,'access-pending'));
  await assertFails(getDoc(doc(pending,'bounties','access-target')));
  await assertFails(updateDoc(doc(pending,'memberAccess','access-pending'),{ownerUid:'access-pending',status:'active',claimedAt:serverTimestamp()}));
  await assertSucceeds(setActive(root,'access-pending','invited'));
  await assertSucceeds(updateDoc(doc(pending,'memberAccess','access-pending'),{ownerUid:'access-pending',status:'active',claimedAt:serverTimestamp()}));
  // A legacy bootstrap admin grant is also ineffective while inactive.
  await assertSucceeds(getDocs(collection(admin,'memberAccess')));
  await assertSucceeds(setInactive(root,'access-admin'));
  await assertFails(getDocs(collection(admin,'memberAccess')));
  await assertFails(getDocs(collection(admin,'adminActivity')));
  await assertFails(setActive(admin,'access-admin'));
  await assertSucceeds(setActive(root,'access-admin'));
  await assertSucceeds(getDocs(collection(admin,'memberAccess')));
  // Admins cannot accidentally lock out their own account.
  await assertFails(setInactive(root,'access-root'));
  assert.equal((await getDoc(doc(root,'memberAccess','access-root'))).data().status,'active');
  console.log('PASS: atomic inactive access blocks, stale-token denial, private data protection, active-session enforcement permissions, inactive invitation/claim denial, legacy admin suspension, restoration, self-lockout protection, public visibility preserved.');
};
