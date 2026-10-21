const assert = require('node:assert/strict');
const { doc, getDoc, setDoc, Timestamp } = require('firebase/firestore');
module.exports = async ({admin, pageFor, env, credentials, createUser}) => {
  await createUser('legacyAdmin');
  await createUser('revokedLegacy');
  await createUser('malformedLegacy');
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), user = credentials.legacyAdmin, now = Timestamp.now();
    await setDoc(doc(db,'members','legacy-admin'), {displayName:'Legacy staff',bio:'Keep this biography',socials:{},profileImage:'',updatedAt:now});
    await setDoc(doc(db,'memberAccess','legacy-admin'), {memberId:'legacy-admin',displayName:'Legacy staff',fortniteUsername:'LegacyStaff',invitedEmail:user.email,ownerUid:user.uid,role:'admin',status:'active',rosterStatus:'active',updatedAt:now});
    await setDoc(doc(db,'admins',user.uid), {enabled:true,memberId:'legacy-admin'});
    await setDoc(doc(db,'memberAccess','revoked-legacy'), {memberId:'revoked-legacy',displayName:'Revoked legacy',fortniteUsername:'RevokedLegacy',invitedEmail:credentials.revokedLegacy.email,ownerUid:credentials.revokedLegacy.uid,role:'admin',status:'active',rosterStatus:'active',updatedAt:now});
    await setDoc(doc(db,'memberAccess','malformed-legacy'), {memberId:'malformed-legacy',displayName:'Malformed legacy',fortniteUsername:'MalformedLegacy',invitedEmail:credentials.malformedLegacy.email,ownerUid:credentials.malformedLegacy.uid,role:'admin',status:'active',rosterStatus:'active',updatedAt:now});
    await setDoc(doc(db,'admins',credentials.malformedLegacy.uid), {enabled:'true',memberId:'malformed-legacy'});
  });
  // A legacy admin can migrate their own role without losing their existing session.
  const legacy = await pageFor('legacyAdmin','admin.html');
  await legacy.locator('#adminDashboard').waitFor({state:'visible'});
  await legacy.locator('[data-admin-view="members"]').click();
  await legacy.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await legacy.locator('#adminMemberPicker').selectOption('legacy-admin');
  await legacy.locator('[data-member-view="roles"]').click();
  assert.equal(await legacy.locator('#adminRole').inputValue(),'member');
  assert.equal(await legacy.locator('#adminWebsiteAdmin').isChecked(),true);
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();assert.equal((await getDoc(doc(db,'memberAccess','revoked-legacy'))).data().websiteAdmin,false);assert.equal((await getDoc(doc(db,'admins',credentials.revokedLegacy.uid))).exists(),false);});
  const revoked = await pageFor('revokedLegacy','admin.html');await revoked.locator('#adminDenied').waitFor({state:'visible'});await revoked.context().close();
  const malformed = await pageFor('malformedLegacy','admin.html');await malformed.locator('#adminDenied').waitFor({state:'visible'});await malformed.context().close();
  await env.withSecurityRulesDisabled(async ctx=>assert.equal((await getDoc(doc(ctx.firestore(),'memberAccess','malformed-legacy'))).data().websiteAdmin,false));
  await legacy.locator('#adminRole').selectOption('developer');await legacy.locator('#adminSaveMembershipRole').click();
  await legacy.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  assert.equal(await legacy.locator('#adminDashboard').isVisible(),true);
  await legacy.locator('#adminWebsiteAdmin').uncheck();await legacy.locator('#adminSaveWebsiteAccess').click();
  await legacy.waitForFunction(()=>document.getElementById('adminWebsiteAccessStatus').textContent.includes('cannot remove your own'));
  await admin.reload();await admin.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('[data-admin-view="members"]').click();
  await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await admin.locator('#adminMemberPicker').selectOption('legacy-admin');await admin.locator('[data-member-view="roles"]').click();
  await admin.locator('#adminWebsiteAdmin').uncheck();await admin.locator('#adminSaveWebsiteAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminWebsiteAccessStatus').textContent.includes('Website permission saved'));
  await legacy.locator('#adminDashboard').waitFor({state:'hidden'});
  await env.withSecurityRulesDisabled(async ctx => {
    const access = (await getDoc(doc(ctx.firestore(),'memberAccess','legacy-admin'))).data();
    assert.equal(access.role,'developer');assert.equal(access.websiteAdmin,false);
    assert.equal((await getDoc(doc(ctx.firestore(),'members','legacy-admin'))).data().bio,'Keep this biography');
  });
  // Older manually approved admins may already have a correct membership and a
  // bootstrap grant, but no separate permission field. Preserve both on migration.
  await env.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore(), access=(await getDoc(doc(db,'memberAccess','legacy-admin'))).data();
    delete access.websiteAdmin;
    await setDoc(doc(db,'memberAccess','legacy-admin'), {...access,role:'owner',updatedAt:Timestamp.now()});
    await setDoc(doc(db,'admins',credentials.legacyAdmin.uid), {enabled:true});
  });
  await admin.reload();await admin.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('[data-admin-view="members"]').click();await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await admin.locator('#adminMemberPicker').selectOption('legacy-admin');await admin.locator('[data-member-view="roles"]').click();
  assert.equal(await admin.locator('#adminRole').inputValue(),'owner');
  assert.equal(await admin.locator('#adminWebsiteAdmin').isChecked(),true);
  await legacy.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('#adminRole').selectOption('developer');await admin.locator('#adminSaveMembershipRole').click();
  await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  await admin.locator('#adminWebsiteAdmin').uncheck();await admin.locator('#adminSaveWebsiteAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminWebsiteAccessStatus').textContent.includes('Website permission saved'));
  await legacy.locator('#adminDashboard').waitFor({state:'hidden'});
  // Admin permission can be prepared before a Gmail exists, without an invitation.
  await admin.locator('#adminMemberPicker').selectOption('kato');
  await admin.locator('#adminWebsiteAdmin').check();await admin.locator('#adminSaveWebsiteAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminWebsiteAccessStatus').textContent.includes('Website permission saved'));
  await env.withSecurityRulesDisabled(async ctx => {
    const access = (await getDoc(doc(ctx.firestore(),'memberAccess','kato'))).data();
    assert.equal(access.invitedEmail,'');assert.equal(access.ownerUid,null);assert.equal(access.role,'member');assert.equal(access.websiteAdmin,true);
  });
  await admin.locator('#adminWebsiteAdmin').uncheck();await admin.locator('#adminSaveWebsiteAccess').click();
  await admin.waitForFunction(()=>document.getElementById('adminWebsiteAccessStatus').textContent.includes('Website permission saved'));
  await legacy.context().close();
  console.log('PASS: legacy Admin and bootstrap-grant migration preserve permission/correct membership/profile, own membership changes retain admin access, self-removal blocked, separate permission revokes live access, no-Gmail preparation.');
};
