const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, writeBatch, runTransaction, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
let env, passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
const bounty = (overrides={}) => ({targetName:'Test Target',amount:10,mode:'Reload',instructions:'Show the elimination and exact names.',image:'wsb-logo.png',status:'open',winningClaimId:'',createdBy:'admin',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...overrides});
const claim = (uid='member', bid='target', overrides={}) => ({bountyId:bid,ownerUid:uid,memberId:uid,claimantName:uid,targetName:'Test Target',amount:10,mode:'Reload',clipUrl:'https://youtu.be/abcdefghijk',notes:'At 0:15',status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),reviewedAt:null,reviewerUid:'',reason:'',...overrides});
const review = (status,reason='') => ({status,reason,reviewerUid:'admin',reviewedAt:serverTimestamp(),updatedAt:serverTimestamp()});
async function approve(db,bid,cid){return runTransaction(db,async tx=>{const br=doc(db,'bounties',bid),cr=doc(db,'bountyClaims',cid);const b=await tx.get(br),c=await tx.get(cr);if(b.data().status!=='open'||c.data().status!=='pending')throw Error('Already reviewed');tx.update(br,{status:'claimed',winningClaimId:cid,updatedAt:serverTimestamp()});tx.update(cr,review('approved'));});}
(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-wsb-bounties',firestore:{host:'127.0.0.1',port:8185,rules:fs.readFileSync('../../firestore.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,'admins','admin'),{enabled:true});
   for(const uid of ['member','other','inactive']){
     await setDoc(doc(db,'memberAccess',uid),{ownerUid:uid,status:uid==='inactive'?'inactive':'active',invitedEmail:uid+'@example.com'});
     await setDoc(doc(db,'members',uid),{displayName:uid,bio:'',socials:{},profileImage:''});
   }
 });
 const admin=env.authenticatedContext('admin').firestore(), member=env.authenticatedContext('member').firestore(), other=env.authenticatedContext('other').firestore();
 const inactive=env.authenticatedContext('inactive').firestore(), stranger=env.authenticatedContext('stranger').firestore(), anonymous=env.unauthenticatedContext().firestore();
 await test('Only admins create and edit bounties',async()=>{await assertSucceeds(setDoc(doc(admin,'bounties','target'),bounty()));await assertFails(setDoc(doc(member,'bounties','fake'),bounty({createdBy:'member'})));await assertFails(updateDoc(doc(member,'bounties','target'),{amount:20,updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(doc(admin,'bounties','target'),{instructions:'Keep names visible.',updatedAt:serverTimestamp()}));});
 await test('Reward range, image whitelist, status and extra fields validated',async()=>{for(const bad of [{amount:21},{amount:4},{amount:5.5},{image:'javascript:alert(1)'},{status:'claimed'},{extra:true}])await assertFails(setDoc(doc(admin,'bounties','bad'),bounty(bad)));});
 await test('Uploaded bounty images are bounded raster data, admin-only and backward-compatible',async()=>{
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTfsAAAAASUVORK5CYII=';
  await assertSucceeds(setDoc(doc(admin,'bounties','upload'),bounty({image})));
  await assertSucceeds(updateDoc(doc(admin,'bounties','upload'),{image:'kato.png',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(admin,'bounties','upload'),{image,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(member,'bounties','upload'),{image,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(anonymous,'bounties','upload-anon'),bounty({image})));
  for(const invalid of ['https://example.com/picture.png','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,PHNjcmlwdD4=','data:image/png;base64,x" onerror="alert(1)','data:image/png;base64,'+'A'.repeat(200000),42])await assertFails(setDoc(doc(admin,'bounties','invalid-image'),bounty({image:invalid})));
 });
 await test('Bounty reads require sign-in',async()=>{await assertFails(getDocs(collection(anonymous,'bounties')));await assertSucceeds(getDocs(collection(member,'bounties')));});
 await test('Inactive, unlinked and anonymous accounts cannot claim',async()=>{await assertFails(setDoc(doc(inactive,'bountyClaims','target_inactive'),claim('inactive')));await assertFails(setDoc(doc(stranger,'bountyClaims','target_stranger'),claim('stranger')));await assertFails(setDoc(doc(anonymous,'bountyClaims','target_anon'),claim('anon')));});
 await test('Cannot spoof owner, member, reward or claim ID',async()=>{await assertFails(setDoc(doc(member,'bountyClaims','target_other'),claim('other')));await assertFails(setDoc(doc(member,'bountyClaims','target_member'),claim('member','target',{memberId:'other'})));await assertFails(setDoc(doc(member,'bountyClaims','target_member'),claim('member','target',{amount:20})));await assertFails(setDoc(doc(member,'bountyClaims','arbitrary'),claim()));});
 await test('Clip URL host, scheme and size enforced',async()=>{for(const clipUrl of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=x','https://youtube.com@evil.test/x','http://youtu.be/abc','https://streamable.com/'+ 'x'.repeat(2100)])await assertFails(setDoc(doc(member,'bountyClaims','target_member'),claim('member','target',{clipUrl})));});
 await test('Active member can submit once',async()=>{await assertSucceeds(setDoc(doc(member,'bountyClaims','target_member'),claim()));await assertFails(setDoc(doc(member,'bountyClaims','target_member'),claim()));await assertSucceeds(setDoc(doc(other,'bountyClaims','target_other'),claim('other')));});
 await test('Claims are private and queries must be owner-scoped',async()=>{await assertFails(getDoc(doc(other,'bountyClaims','target_member')));await assertFails(getDocs(collection(member,'bountyClaims')));const mine=await assertSucceeds(getDocs(query(collection(member,'bountyClaims'),where('ownerUid','==','member'))));assert.equal(mine.size,1);await assertSucceeds(getDocs(collection(admin,'bountyClaims')));await assertFails(getDoc(doc(anonymous,'bountyClaims','target_member')));});
 await test('Member cannot review or rewrite their pending claim',async()=>{await assertFails(updateDoc(doc(member,'bountyClaims','target_member'),review('approved')));await assertFails(updateDoc(doc(member,'bountyClaims','target_member'),{notes:'changed',updatedAt:serverTimestamp()}));});
 await test('Denial needs feedback; admins cannot alter evidence',async()=>{await assertFails(updateDoc(doc(admin,'bountyClaims','target_member'),review('denied')));await assertFails(updateDoc(doc(admin,'bountyClaims','target_member'),{...review('denied','Invalid'),clipUrl:'https://youtu.be/newclip'}));await assertSucceeds(updateDoc(doc(admin,'bountyClaims','target_member'),review('denied','Target name not visible.')));});
 await test('Denied claims can be resubmitted without losing original timestamp',async()=>{const old=(await getDoc(doc(member,'bountyClaims','target_member'))).data();await assertSucceeds(setDoc(doc(member,'bountyClaims','target_member'),claim('member','target',{createdAt:old.createdAt,clipUrl:'https://streamable.com/abc123'})));});
 await test('Unpaired winner or approval writes are denied',async()=>{await assertFails(updateDoc(doc(admin,'bountyClaims','target_member'),review('approved')));await assertFails(updateDoc(doc(admin,'bounties','target'),{status:'claimed',winningClaimId:'target_member',updatedAt:serverTimestamp()}));});
 await test('Concurrent approvals produce exactly one winner',async()=>{const results=await Promise.allSettled([approve(admin,'target','target_member'),approve(admin,'target','target_other')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const b=(await getDoc(doc(admin,'bounties','target'))).data();assert.equal(b.status,'claimed');const c=(await getDoc(doc(admin,'bountyClaims',b.winningClaimId))).data();assert.equal(c.status,'approved');});
 await test('Closed bounty cannot be claimed or reopened',async()=>{await assertFails(setDoc(doc(admin,'bountyClaims','target_admin'),claim('admin','target',{memberId:''})));await assertFails(updateDoc(doc(admin,'bounties','target'),{status:'open',winningClaimId:'',updatedAt:serverTimestamp()}));});
 await test('Paused and archived bounties reject new claims',async()=>{await setDoc(doc(admin,'bounties','paused'),bounty({status:'paused'}));await assertFails(setDoc(doc(member,'bountyClaims','paused_member'),claim('member','paused')));await setDoc(doc(admin,'bounties','removed'),bounty());await updateDoc(doc(admin,'bounties','removed'),{status:'archived',updatedAt:serverTimestamp()});await assertFails(setDoc(doc(member,'bountyClaims','removed_member'),claim('member','removed')));});
 await test('Archive preserves claims; hard deletion is blocked',async()=>{await assertSucceeds(updateDoc(doc(admin,'bounties','target'),{status:'archived',updatedAt:serverTimestamp()}));await assertSucceeds(getDoc(doc(member,'bountyClaims','target_member')));await assertFails(deleteDoc(doc(admin,'bounties','target')));await assertFails(deleteDoc(doc(admin,'bountyClaims','target_member')));});
 await test('Existing member profile editing still works',async()=>{await assertSucceeds(updateDoc(doc(member,'members','member'),{bio:'Updated bio'}));await assertFails(updateDoc(doc(other,'members','member'),{bio:'Other person'}));await assertFails(updateDoc(doc(member,'members','member'),{role:'admin'}));});
 await test('Revoked admin loses management permissions',async()=>{await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'admins','admin')));await assertFails(setDoc(doc(admin,'bounties','revoked'),bounty()));});
 console.log(passed+' security scenarios passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(env)await env.cleanup();});
