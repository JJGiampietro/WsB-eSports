const assert=require('node:assert/strict');
const {assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,serverTimestamp}=require('firebase/firestore');
module.exports=async env=>{
  const admin=env.authenticatedContext('visual-admin',{email:'visual-admin@wsb-test.invalid',email_verified:true}).firestore();
  const claimant=env.authenticatedContext('visual-claimant',{email:'visual@wsb-test.invalid',email_verified:true}).firestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();await setDoc(doc(db,'admins','visual-admin'),{enabled:true});
  });
  const account={memberId:'ingraham',displayName:'Visual only',fortniteUsername:'NeverFetch',invitedEmail:'visual@wsb-test.invalid',ownerUid:null,role:'developer',websiteAdmin:false,status:'invited',updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(admin,'memberAccess','ingraham'),account));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'memberAccess','ingraham'),{...account,updatedAt:new Date()}));
  await assertFails(updateDoc(doc(admin,'memberAccess','ingraham'),{websiteAdmin:true,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(claimant,'memberAccess','ingraham'),{ownerUid:'visual-claimant',status:'active',claimedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'admins','visual-claimant'),{enabled:true,memberId:'ingraham'}));
  // A stale/privileged backup must not turn the Easter egg into a real account.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(doc(db,'memberAccess','ingraham'),{...account,ownerUid:'visual-claimant',status:'active',websiteAdmin:true,updatedAt:new Date()});
    await setDoc(doc(db,'admins','visual-claimant'),{enabled:true,memberId:'ingraham'});
    await setDoc(doc(db,'members','ingraham'),{displayName:'Visual only',bio:'I play Minecraft',socials:{},profileImage:'',updatedAt:new Date()});
    await setDoc(doc(db,'bounties','visual-target'),{targetName:'Test target',amount:10,mode:'Reload',instructions:'Test',image:'wsb-logo.png',status:'open',winningClaimId:'',createdBy:'visual-admin',createdAt:new Date(),updatedAt:new Date()});
  });
  await assertFails(updateDoc(doc(claimant,'members','ingraham'),{bio:'Cannot self-edit',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(claimant,'memberAccess','forged-member'),{...account,memberId:'forged-member'}));
  await assertFails(setDoc(doc(claimant,'bountyClaims','visual-target_visual-claimant'),{bountyId:'visual-target',ownerUid:'visual-claimant',memberId:'ingraham',claimantName:'Visual only',targetName:'Test target',amount:10,mode:'Reload',clipUrl:'https://youtu.be/abcdefghijk',notes:'',status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),reviewedAt:null,reviewerUid:'',reason:''}));
  console.log('PASS: only Ingraham is display-only; account creation, invitation claims and website-admin grants rejected.');
};
