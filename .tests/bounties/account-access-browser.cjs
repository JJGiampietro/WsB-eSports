const assert=require('node:assert/strict');
const {doc,getDoc,getDocs,collection,setDoc,Timestamp}=require('firebase/firestore');
module.exports=async({admin,pageFor,env,credentials,createUser})=>{
  await admin.goto('http://localhost:8000/admin.html#members');
  await admin.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('[data-admin-view="members"]').click();
  await admin.locator('#adminMemberPicker').waitFor({state:'visible'});
  await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  const member=await pageFor('member','member-account.html'); await member.locator('#memberProfileForm').waitFor({state:'visible'});
  const board=await pageFor('member','bounties.html'); await board.waitForFunction(()=>document.getElementById('bountyAccountStatus').textContent.includes('Member access'));
  const stats=await pageFor('member','stats/lizzie/'); await stats.locator('.firebase-account-link').filter({hasText:'SIGNED IN'}).waitFor();
  let before;
  await env.withSecurityRulesDisabled(async ctx=>{before={profile:(await getDoc(doc(ctx.firestore(),'members','barrelroll'))).data(),access:(await getDoc(doc(ctx.firestore(),'memberAccess','barrelroll'))).data()};});
  await member.locator('#profileBio').fill('Unsaved member draft must not be saved');
  await admin.locator('#adminProfileBio').fill('Unsaved admin draft must be preserved');
  await admin.locator('[data-member-view="access"]').click();
  await admin.locator('#adminInviteEmail').fill('');
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('Access deactivated'));
  for(const page of [member,board,stats]){
    await page.locator('#accountAccessNotice').waitFor({state:'visible'});
    await page.waitForFunction(async()=>{const{getAuth}=await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');return getAuth().currentUser===null;});
    assert.match(await page.locator('#accountAccessNotice').innerText(),/inactive/);
  }
  assert.equal(await member.locator('#memberProfileForm').isVisible(),false);
  assert.equal(await member.locator('#profileBio').inputValue(),'');
  await board.waitForFunction(()=>document.getElementById('bountyAccountStatus').textContent.includes('Sign in'));
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'');
  assert.equal(await admin.locator('#adminProfileBio').inputValue(),'Unsaved admin draft must be preserved');
  assert.equal(await admin.locator('#adminStatus').inputValue(),'inactive');
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    assert.deepEqual((await getDoc(doc(db,'members','barrelroll'))).data(),before.profile);
    assert.equal((await getDoc(doc(db,'memberAccess','barrelroll'))).data().ownerUid,before.access.ownerUid);
    assert.equal((await getDoc(doc(db,'accountRestrictions',credentials.member.email))).data().blocked,true);
    assert.notEqual((await getDoc(doc(db,'memberVisibility','barrelroll'))).data()?.hidden,true);
  });
  const blocked=await pageFor('member','member-account.html');
  await blocked.locator('#accountAccessNotice').waitFor({state:'visible'});
  await blocked.locator('#accountSignedOut').waitFor({state:'visible'});
  assert.equal(await blocked.locator('#memberProfileForm').isVisible(),false);
  // Restoring does not silently sign users back in; their next login works.
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('access restored'));
  assert.equal(await member.locator('#memberProfileForm').isVisible(),false);
  const restored=await pageFor('member','member-account.html'); await restored.locator('#memberProfileForm').waitFor({state:'visible'});
  assert.equal(await restored.locator('#profileBio').inputValue(),before.profile.bio);
  console.log('PASS: member access shortcut signs out all existing sessions, blocks repeat login and restores access without saving draft edits.');
  // The existing status dropdown has exactly the same enforcement as the shortcut.
  await admin.locator('#adminMemberPicker').selectOption('bri');
  const owner=await pageFor('owner','member-account.html'); await owner.locator('#memberProfileForm').waitFor({state:'visible'});
  await admin.locator('#adminStatus').selectOption('inactive'); await admin.locator('#adminSave').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('inactive access'));
  await owner.locator('#accountAccessNotice').waitFor({state:'visible'});
  await owner.locator('#accountSignedOut').waitFor({state:'visible'});
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('access restored'));
  // A linked website admin is also signed out, loses their grant and can be restored.
  console.log('PASS: inactive status dropdown and access shortcut stay consistent after saving.');
  let invitedId;
  await env.withSecurityRulesDisabled(async ctx=>{invitedId=(await getDocs(collection(ctx.firestore(),'memberAccess'))).docs.find(entry=>entry.data().ownerUid===credentials.invited.uid).id;});
  await admin.locator('#adminMemberPicker').selectOption(invitedId);
  const staff=await pageFor('invited','admin.html'); await staff.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('Access deactivated'));
  await staff.locator('#adminDashboard').waitFor({state:'hidden'}); await staff.locator('#accountAccessNotice').waitFor({state:'visible'});
  await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await getDoc(doc(ctx.firestore(),'admins',credentials.invited.uid))).exists(),false);});
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('access restored'));
  const restoredStaff=await pageFor('invited','admin.html'); await restoredStaff.locator('#adminDashboard').waitFor({state:'visible'});
  // Existing inactive records are migrated to server-enforced restrictions by an admin.
  await createUser('legacy');
  await env.withSecurityRulesDisabled(async ctx=>{
    const now=Timestamp.now(),db=ctx.firestore();
    await setDoc(doc(db,'memberAccess','legacy-inactive'),{memberId:'legacy-inactive',displayName:'Legacy inactive',fortniteUsername:'LegacyTest',invitedEmail:credentials.legacy.email,ownerUid:credentials.legacy.uid,role:'member',status:'inactive',rosterStatus:'active',updatedAt:now});
    await setDoc(doc(db,'members','legacy-inactive'),{displayName:'Legacy inactive',bio:'Keep legacy profile',socials:{},profileImage:'',updatedAt:now});
  });
  await admin.reload(); await admin.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('[data-admin-view="members"]').click();
  await admin.locator('#adminMemberPicker').waitFor({state:'visible'});
  await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await env.withSecurityRulesDisabled(async ctx=>{assert.equal((await getDoc(doc(ctx.firestore(),'accountRestrictions',credentials.legacy.email))).data().blocked,true);});
  const legacy=await pageFor('legacy','member-account.html'); await legacy.locator('#accountAccessNotice').waitFor({state:'visible'});
  await admin.locator('#adminMemberPicker').selectOption('legacy-inactive');
  await admin.locator('[data-member-view="access"]').click();
  await admin.locator('#adminToggleAccountAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminSaveStatus').textContent.includes('access restored'));
  for(const page of [member,board,stats,blocked,restored,owner,staff,restoredStaff,legacy]) await page.context().close();
  console.log('PASS: admin-only deactivate/restore controls without Gmail input, status-dropdown enforcement, existing-session sign-out on account/bounty/stats pages, repeat-login denial, member/admin reactivation, legacy inactive migration, profile/history/visibility preserved.');
};
