const { chromium } = require('playwright');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { setDoc, doc, deleteDoc, serverTimestamp } = require('firebase/firestore');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let env, browser;
const credentials={};
async function seedUser(role){
 const email=role+'@wsb-test.invalid',password='Emulator-test-only-123!';
 const r=await fetch('http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
 const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));credentials[role]={email,password,uid:data.localId};
}
async function pageFor(role){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const sdk='https://www.gstatic.com/firebasejs/12.19.0/';
 await page.route('**/firebase-member.js*',route=>route.fulfill({contentType:'text/javascript',body:`
 import {initializeApp} from '${sdk}firebase-app.js';
 import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,GoogleAuthProvider} from '${sdk}firebase-auth.js';
 import {getFirestore,connectFirestoreEmulator} from '${sdk}firebase-firestore.js';
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-wsb-bounties',authDomain:'localhost'});
 export const auth=getAuth(app),db=getFirestore(app),provider=new GoogleAuthProvider();
 connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8185);
 ${role?`await signInWithEmailAndPassword(auth,${JSON.stringify(credentials[role].email)},${JSON.stringify(credentials[role].password)});`:''}
 `}));
 page.on('pageerror',err=>{throw err;});
 await page.goto('http://localhost:8000/bounties.html');
 await page.waitForFunction(()=>!document.getElementById('bountyAccountStatus').textContent.includes('Checking'));
 return page;
}
(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-wsb-bounties',firestore:{host:'127.0.0.1',port:8185,rules:fs.readFileSync('../../firestore.rules','utf8')}});
 await env.clearFirestore();
 for(const role of ['admin','member','other','unlinked'])await seedUser(role);
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();await setDoc(doc(db,'admins',credentials.admin.uid),{enabled:true});
  for(const role of ['member','other']){await setDoc(doc(db,'memberAccess',role),{ownerUid:credentials[role].uid,status:'active'});await setDoc(doc(db,'members',role),{displayName:role,bio:'',socials:{},profileImage:''});}
 });
 browser=await chromium.launch({channel:'msedge',headless:true});
 const anon=await pageFor();assert.equal(await anon.locator('#tab-review').isVisible(),false);assert.equal(await anon.locator('#tab-manage').isVisible(),false);assert.equal(await anon.locator('#bountySignIn').isVisible(),true);
 const admin=await pageFor('admin');await admin.locator('#tab-manage').waitFor({state:'visible'});await admin.locator('#tab-manage').click();await admin.locator('#addBounty').click();
 await admin.locator('#editTarget').fill('Browser Test Target');await admin.locator('#editAmount').fill('15');await admin.locator('#editMode').selectOption('Reload');await admin.locator('#saveBounty').click();await admin.locator('#editorDialog').waitFor({state:'hidden'});
 await admin.locator('[data-edit]').click();await admin.locator('#editTarget').fill('Edited Test Target');await admin.locator('#saveBounty').click();await admin.locator('#editorDialog').waitFor({state:'hidden'});
 assert.match(await admin.locator('#manageList').textContent(),/Edited Test Target/);
 const member=await pageFor('member');await member.locator('[data-target]').waitFor();assert.equal(await member.locator('#tab-manage').isVisible(),false);assert.equal(await member.locator('#tab-review').isVisible(),false);
 await member.locator('[data-target]').click();await member.locator('#claimClipUrl').fill('https://example.com/not-allowed');await member.locator('#claimConfirm').check();await member.locator('#submitClaim').click();assert.match(await member.locator('#claimError').textContent(),/valid HTTPS/);
 await member.locator('#claimClipUrl').fill('https://youtu.be/abcdefghijk');await member.locator('#claimNotes').fill('Elimination at 0:15.');await member.locator('#submitClaim').click();await member.locator('#claimDialog').waitFor({state:'hidden'});await member.locator('#claimList .bounty-claim').waitFor();
 await member.reload();await member.locator('#tab-claims').click();await member.locator('#claimList .bounty-claim').waitFor();assert.match(await member.locator('#claimList').textContent(),/Pending review/);
 const other=await pageFor('other');await other.locator('#tab-claims').click();await other.getByRole('heading',{name:'Your first claim starts here.'}).waitFor();assert.equal(await other.locator('#claimList .bounty-claim').count(),0);
 await admin.locator('#tab-review').click();await admin.locator('[data-decision="denied"]').click();assert.match(await admin.locator('#reviewList .bounty-error').textContent(),/Add a reason/);await admin.locator('#reviewList textarea').fill('Please show the target name clearly.');await admin.locator('[data-decision="denied"]').click();await member.getByRole('button',{name:'RESUBMIT CLAIM'}).click();await member.locator('#claimClipUrl').fill('https://streamable.com/abc123');await member.locator('#claimConfirm').check();await member.locator('#submitClaim').click();await member.locator('#claimDialog').waitFor({state:'hidden'});
 await admin.locator('[data-decision="approved"]').click();await member.locator('#claimList .bounty-status.approved').waitFor();assert.match(await member.locator('#claimList').textContent(),/Winning claim approved/);
 fs.mkdirSync('artifacts',{recursive:true});await admin.screenshot({path:'artifacts/admin-review.png',fullPage:true});
 await admin.locator('#tab-manage').click();await admin.locator('[data-remove]').click();await admin.locator('#confirmRemove').click();await admin.locator('#removeDialog').waitFor({state:'hidden'});await member.locator('#tab-board').click();await member.getByRole('heading',{name:'The board is clear.'}).waitFor();
 await member.setViewportSize({width:390,height:844});assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await member.locator('#navlinks a[href*=bounties]').count(),1);await member.screenshot({path:'artifacts/member-mobile.png',fullPage:true});
 const unlinked=await pageFor('unlinked');assert.equal(await unlinked.locator('#tab-manage').isVisible(),false);assert.match(await unlinked.locator('#bountyAccountStatus').textContent(),/active WsB member profile/);
 await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'admins',credentials.admin.uid)));await admin.locator('#tab-manage').waitFor({state:'hidden'});assert.equal(await admin.locator('#tab-review').isVisible(),false);assert.equal(await admin.locator('#reviewList').textContent(),'');
 console.log('PASS: signed-out/member/admin/unlinked views, create/edit/archive, persisted private claims, invalid links, denial feedback, resubmit, approval, live role revocation, mobile overflow, navigation unchanged.');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(env)await env.cleanup();});
