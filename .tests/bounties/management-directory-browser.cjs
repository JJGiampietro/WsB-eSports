const assert=require('node:assert/strict');
const {doc,getDoc,setDoc,deleteDoc,writeBatch,Timestamp}=require('firebase/firestore');
module.exports=async({admin,pageFor,env})=>{
  await admin.locator('[data-admin-view="members"]').click();
  await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  await admin.locator('#adminMemberPicker').selectOption('bri');
  await admin.locator('[data-member-view="roles"]').click();
  // Existing assignments are backfilled, not just future role changes.
  const page=await pageFor(null,'management.html');
  const card=()=>page.locator('.management-card[data-public-member-id="bri"]');
  const assertNumbering=async headings=>{
    await page.waitForFunction(expected=>{
      const sections=[...document.querySelectorAll('.management-groups > section')].filter(section=>section.getClientRects().length);
      return sections.length===expected.length&&sections.every((section,index)=>section.querySelector('h2').textContent===expected[index]&&section.querySelector('.management-group-heading > p').textContent===String(index+1).padStart(2,'0'));
    },headings);
    const visible=await page.locator('.management-groups > section').evaluateAll(sections=>sections.filter(section=>section.getClientRects().length).map(section=>({heading:section.querySelector('h2').textContent,number:section.querySelector('.management-group-heading > p').textContent})));
    assert.deepEqual(visible,headings.map((heading,index)=>({heading,number:String(index+1).padStart(2,'0')})));
  };
  await page.locator('.management-grid-owners [data-public-member-id="bri"]').waitFor({state:'visible'});
  assert.equal(await card().count(),1);
  assert.equal(await page.locator('[aria-labelledby="management-heading"]').isVisible(),false);
  assert.equal(await page.locator('.management-group-creators').isVisible(),false);
  await assertNumbering(['OWNERS','TEAM SUPPORT']);
  const hiddenLoad=page.waitForEvent('load');
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore(),batch=writeBatch(db);for(const id of ['barrelroll','legacy-admin'])batch.set(doc(db,'memberVisibility',id),{hidden:true,updatedAt:Timestamp.now()});await batch.commit();});
  await hiddenLoad;
  await page.locator('.management-group-support').waitFor({state:'hidden'});
  assert.equal(await page.locator('.management-community-card').isVisible(),false,'Community link cannot keep an empty Support section visible');
  await assertNumbering(['OWNERS']);
  const restoredLoad=page.waitForEvent('load');
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore(),batch=writeBatch(db);for(const id of ['barrelroll','legacy-admin'])batch.delete(doc(db,'memberVisibility',id));await batch.commit();});
  await restoredLoad;
  await page.locator('.management-grid-owners [data-public-member-id="bri"]').waitFor({state:'visible'});
  await page.locator('.management-group-support').waitFor({state:'visible'});
  await assertNumbering(['OWNERS','TEAM SUPPORT']);
  await card().press('Enter'); await page.locator('#bioModal.open').waitFor();
  assert.match(await page.locator('#bioName').textContent(),/TEST owner/i);
  await page.keyboard.press('Escape');
  const selectRole=async role=>{
    await admin.locator('#adminRole').selectOption(role);await admin.locator('#adminSaveMembershipRole').click();
    await admin.waitForFunction(()=>document.getElementById('adminMembershipRoleStatus').textContent.includes('Membership role saved'));
  };
  await selectRole('management');
  await page.locator('.management-grid-management [data-public-member-id="bri"]').waitFor({state:'visible'});
  assert.equal(await card().count(),1);
  await assertNumbering(['MANAGEMENT','TEAM SUPPORT']);
  await selectRole('member'); await card().waitFor({state:'detached'});
  await assertNumbering(['TEAM SUPPORT']);
  await selectRole('creator'); await page.locator('.management-grid-creators [data-public-member-id="bri"]').waitFor({state:'visible'});
  await assertNumbering(['CREATORS','TEAM SUPPORT']);
  assert.equal(await card().count(),1);
  for(const membership of ['hr','developer']) {
    await selectRole(membership); await page.locator('.management-grid-support [data-public-member-id="bri"]').waitFor({state:'visible'});
    assert.equal(await card().count(),1);
    assert.equal(await page.locator('.management-group-creators').isVisible(),false);
    assert.equal(await card().getAttribute('data-role'),membership==='hr'?'HR':'Developer');
    await assertNumbering(['TEAM SUPPORT']);
  }
  await selectRole('owner'); await card().waitFor({state:'visible'});
  await assertNumbering(['OWNERS','TEAM SUPPORT']);
  assert.deepEqual(await page.locator('.management-groups > section').evaluateAll(sections=>sections.map(section=>section.querySelector('h2').textContent)),['OWNERS','MANAGEMENT','CREATORS','TEAM SUPPORT']);
  // Public profile changes update the same stable-id card immediately.
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'members','bri'),{displayName:'Bri updated',bio:'Live biography',socials:{tiktok:'https://www.tiktok.com/@test-bri'},profileImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',updatedAt:Timestamp.now()},{merge:true}));
  await page.waitForFunction(()=>document.querySelector('[data-public-member-id="bri"] .tier-name')?.textContent==='Bri updated');
  assert.equal(await card().locator('.management-card-initial-letter:visible').count(),0);
  await card().click();await page.locator('#bioModal.open').waitFor();
  assert.equal(await page.locator('#bioText').textContent(),'Live biography');assert.equal(await page.locator('#bioRole').textContent(),'Owner');
  assert.equal(await page.locator('#bioTiktok').getAttribute('href'),'https://www.tiktok.com/@test-bri');await page.keyboard.press('Escape');
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'memberVisibility','bri'),{hidden:true,updatedAt:Timestamp.now()}));
  await card().waitFor({state:'hidden'});
  await selectRole('management'); assert.equal(await card().isVisible(),false);
  await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'memberVisibility','bri')));
  await page.locator('.management-grid-management [data-public-member-id="bri"]').waitFor({state:'visible'});
  await selectRole('owner');
  // A roster-only member needs neither a public Firebase profile nor a Gmail.
  await admin.locator('#adminMemberPicker').selectOption('mello');
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'');
  await selectRole('management');
  await page.locator('.management-grid-management [data-public-member-id="mello"]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-public-member-id="mello"]').count(),1);
  await assertNumbering(['OWNERS','MANAGEMENT','TEAM SUPPORT']);
  await admin.locator('#adminMemberPicker').selectOption('envious');
  await selectRole('creator');
  await page.locator('.management-grid-creators [data-public-member-id="envious"]').waitFor({state:'visible'});
  await assertNumbering(['OWNERS','MANAGEMENT','CREATORS','TEAM SUPPORT']);
  await selectRole('member');
  await page.locator('.management-group-creators').waitFor({state:'hidden'});
  await assertNumbering(['OWNERS','MANAGEMENT','TEAM SUPPORT']);
  await admin.locator('#adminMemberPicker').selectOption('mello');
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),access=(await getDoc(doc(db,'memberAccess','mello'))).data(),published=(await getDoc(doc(db,'memberMemberships','mello'))).data();
    assert.equal(access.invitedEmail,'');assert.equal(access.ownerUid,null);assert.deepEqual(Object.keys(published).sort(),['role','updatedAt']);
  });
  for(const width of [1440,1080,768,620,390,320]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Management overflow at '+width);
  }
  const fs=require('node:fs');fs.mkdirSync('artifacts',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/management-membership-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:1000});await page.screenshot({path:'artifacts/management-membership-mobile.png',fullPage:true});
  await selectRole('member');await page.locator('[data-public-member-id="mello"]').waitFor({state:'detached'});
  // Full create/edit saves work even before the first hourly roster sync.
  await admin.locator('#adminStartNew').click();
  await admin.locator('#adminDisplayName').fill('Pending directory manager');
  await admin.locator('#adminFortniteUsername').fill('PendingDirectoryTest');
  await admin.locator('[data-member-view="access"]').click();await admin.locator('#adminInviteEmail').fill('pending-directory@wsb-test.invalid');
  await admin.locator('[data-member-view="roles"]').click();await admin.locator('#adminRole').selectOption('management');
  await admin.locator('[data-member-view="access"]').click();
  await admin.locator('#adminSave').click();await admin.waitForFunction(()=>document.getElementById('adminInviteActions').hidden===false);
  await admin.waitForFunction(()=>!document.getElementById('adminSave').disabled);
  const pendingId=await admin.locator('#adminMemberId').inputValue();
  await page.locator('.management-grid-management [data-public-member-id="'+pendingId+'"]').waitFor({state:'visible'});
  await admin.locator('[data-member-view="roles"]').click();await admin.locator('#adminRole').selectOption('owner');
  await admin.locator('[data-member-view="access"]').click();await admin.locator('#adminSave').click();
  await page.locator('.management-grid-owners [data-public-member-id="'+pendingId+'"]').waitFor({state:'visible'});
  await admin.locator('[data-member-view="roles"]').click();await selectRole('member');await page.locator('[data-public-member-id="'+pendingId+'"]').waitFor({state:'detached'});
  // A non-playing team member can retain their original card with no account.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),batch=writeBatch(db),now=Timestamp.now();
    batch.set(doc(db,'memberAccess','ingraham'),{memberId:'ingraham',displayName:'ᵂˢᴮIngraham',fortniteUsername:'',invitedEmail:'',ownerUid:null,claimedAt:null,role:'developer',websiteAdmin:false,status:'invited',rosterStatus:'active',updatedAt:now});
    batch.set(doc(db,'memberMemberships','ingraham'),{role:'developer',updatedAt:now});
    await batch.commit();
  });
  const developer=page.locator('.management-grid-support [data-public-member-id="ingraham"]');
  await developer.waitFor({state:'visible'});
  assert.equal(await developer.locator('.tier-role').textContent(),'DEVELOPER');
  assert.equal(await developer.locator('.tier-name').textContent(),'ᵂˢᴮIngraham');
  assert.match(await developer.getAttribute('style'),/ingraham\.jpg/);
  await developer.click();await page.locator('#bioModal.open').waitFor();
  assert.equal(await page.locator('#bioText').textContent(),'I play Minecraft');
  assert.equal(await page.locator('#bioRole').textContent(),'Developer');
  await page.keyboard.press('Escape');
  await page.context().close();
  await admin.reload();await admin.locator('#adminDashboard').waitFor({state:'visible'});
  await admin.locator('[data-admin-view="members"]').click();await admin.waitForFunction(()=>!document.getElementById('adminMemberPicker').disabled);
  console.log('PASS: membership-only Owner/Management/Creator/HR/Developer sections, correct order, empty Creators hidden, no duplicates, no-Gmail promotion, pre-sync create/edit, live profile/modal data, hidden-profile protection and six responsive widths.');
};
