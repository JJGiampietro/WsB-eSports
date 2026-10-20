const assert=require('node:assert/strict');
const {doc,getDoc,getDocs,collection,updateDoc,Timestamp}=require('firebase/firestore');
module.exports=async({admin,pageFor,env,credentials})=>{
  await admin.locator('[data-admin-view="members"]').click();
  await admin.locator('#adminMemberPicker').selectOption('elusion');
  await admin.locator('[data-member-view="profile"]').click();
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'');
  let before;
  await env.withSecurityRulesDisabled(async ctx=>{before=(await getDoc(doc(ctx.firestore(),'members','elusion'))).data();});
  await admin.locator('#adminProfileBio').fill('Unsaved role-only draft');
  await admin.locator('[data-member-view="roles"]').click();
  await admin.locator('#adminRole').selectOption('owner');
  await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'');
  assert.equal(await admin.locator('#adminProfileBio').inputValue(),'Unsaved role-only draft');
  assert.equal(await admin.locator('#adminInviteActions').isVisible(),false);
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),access=(await getDoc(doc(db,'memberAccess','elusion'))).data();
    assert.equal(access.role,'owner');assert.equal(access.invitedEmail,'');assert.equal(access.ownerUid,null);assert.equal(access.rosterStatus,'active');
    assert.deepEqual((await getDoc(doc(db,'members','elusion'))).data(),before);
    assert.equal((await getDoc(doc(db,'admins','elusion'))).exists(),false);
  });
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('#adminMemberPicker').selectOption('elusion');
  assert.equal(await admin.locator('#adminRole').inputValue(),'owner');
  for(const width of [1440,390,320]){
    await admin.setViewportSize({width,height:1000});
    assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await admin.setViewportSize({width:1440,height:1000});
  // Existing linked members can change display membership without re-entering Gmail.
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('[data-member-view="access"]').click();
  await admin.locator('#adminInviteEmail').fill('');
  await admin.locator('[data-member-view="roles"]').click();
  await admin.locator('#adminRole').selectOption('owner');
  await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),access=(await getDoc(doc(db,'memberAccess','barrelroll'))).data();
    assert.equal(access.role,'owner');assert.equal(access.invitedEmail,credentials.member.email);assert.equal(access.ownerUid,credentials.member.uid);
    assert.equal((await getDoc(doc(db,'admins',credentials.member.uid))).exists(),false);
  });
  const owner=await pageFor('member','admin.html');await owner.locator('#adminDenied').waitFor({state:'visible'});
  // Only the Admin membership role grants website privileges; role-only demotion revokes them.
  await admin.locator('#adminRole').selectOption('admin');await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  await owner.locator('#adminDashboard').waitFor({state:'visible'});
  await owner.locator('[data-admin-view="members"]').click();
  await owner.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await owner.locator('#adminMemberPicker').selectOption('barrelroll');await owner.locator('[data-member-view="roles"]').click();await owner.locator('#adminRole').selectOption('member');await owner.locator('#adminSaveMembershipRole').click();
  await owner.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('cannot remove your own'));
  await admin.locator('#adminRole').selectOption('member');await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  await owner.locator('#adminDashboard').waitFor({state:'hidden'});
  // Concurrent access changes must not be overwritten by an old editor.
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'memberAccess','barrelroll'),{updatedAt:Timestamp.now()}));
  await admin.locator('#adminRole').selectOption('creator');await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('access changed'));
  await admin.reload();await admin.locator('#adminDashboard').waitFor({state:'visible'});await admin.locator('[data-admin-view="members"]').click();
  await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();assert.equal((await getDoc(doc(db,'memberAccess','barrelroll'))).data().role,'member');
    assert((await getDocs(collection(db,'adminActivity'))).docs.some(entry=>entry.data().action==='member-role-changed'&&entry.data().targetId==='elusion'));
  });
  await owner.context().close();
  console.log('PASS: membership role-only saves without Gmail for uninvited/linked members, persistence, no accidental invite/profile edits, Admin-only grants and live demotion, self-lockout/concurrency protection, responsive controls.');
};
