const assert = require('node:assert/strict'), fs = require('node:fs');
const { doc, getDoc, getDocs, collection, setDoc, Timestamp } = require('firebase/firestore');
module.exports = async ({admin, anon, owner, pageFor, env}) => {
  await admin.locator('[data-member-view="roles"]').click();
  await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').waitFor();
  assert.equal(await anon.locator('#adminCreateRole').isVisible(),false);
  assert.equal(await owner.locator('#adminSaveProfileRoles').isVisible(),false);
  // Roles can be assigned to an existing uninvited roster member without entering Gmail.
  await admin.locator('#adminMemberPicker').selectOption('elusion');
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'');
  await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').check();
  await admin.locator('#adminSaveProfileRoles').click();
  await admin.waitForFunction(() => document.getElementById('adminProfileRolesStatus').textContent.includes('roles saved'));
  const legacy = await pageFor(null,'stats/elusion/');
  await legacy.locator('.profile-hero-card .profile-role-badge[data-role-id="bounty-hunter"]').waitFor();
  await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').uncheck();
  await admin.locator('#adminSaveProfileRoles').click();
  await admin.waitForFunction(() => document.getElementById('adminProfileRolesStatus').textContent.includes('All profile roles removed'));
  await legacy.locator('.profile-hero-card .profile-role-badge').waitFor({state:'hidden'});
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').check();
  await admin.locator('.admin-role-library summary').click();
  for (const [name,tone] of [['Tournament MVP','violet'],['Competitive Player','blue'],['Community Helper','mint'],['Event Champion','gold'],['Team Support','violet']]) {
    await admin.locator('#adminNewRoleName').fill(name); await admin.locator('#adminNewRoleTone').selectOption(tone);
    await admin.locator('#adminCreateRole').click();
    await admin.waitForFunction(value => document.getElementById('adminRoleCreateStatus').textContent.includes('“'+value+'” created'),name);
  }
  assert.equal(await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').isChecked(),true);
  await admin.locator('#adminNewRoleName').fill('tournament mvp'); await admin.locator('#adminCreateRole').click();
  await admin.waitForFunction(() => document.getElementById('adminRoleCreateStatus').textContent.includes('already exists'));
  await admin.locator('#adminNewRoleName').fill('Admin'); await admin.locator('#adminCreateRole').click();
  await admin.waitForFunction(() => document.getElementById('adminRoleCreateStatus').textContent.includes('reserved'));
  for (const id of ['tournament-mvp','competitive-player','community-helper','event-champion']) await admin.locator('#adminRoleChoices input[value="'+id+'"]').check();
  assert.equal(await admin.locator('#adminRoleChoices input[value="team-support"]').isDisabled(),true);
  await admin.locator('#adminSaveProfileRoles').click();
  await admin.waitForFunction(() => document.getElementById('adminProfileRolesStatus').textContent.includes('roles saved'));
  const member = await pageFor('member','member-account.html');
  await member.waitForFunction(() => document.querySelectorAll('#memberProfileForm .profile-role-badge').length===5);
  assert.equal(await member.locator('#adminSaveProfileRoles').count(),0);
  const pages=[];
  for (const [route,selector] of [
    ['members.html','.member-card[data-member-id="barrelroll"]'],
    ['management.html','.management-card[data-public-member-id="barrelroll"]'],
    ['stats.html','a.stats-player[href="stats/barrelroll/"]'],
    ['stats/barrelroll/','.profile-hero-card']
  ]) {
    const page=await pageFor(null,route); pages.push(page);
    await page.waitForFunction(selector => document.querySelectorAll(selector+' .profile-role-badge').length===5,selector);
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' width '+width);
      assert.equal(await page.locator(selector+' .profile-role-list').evaluate(element=>element.scrollWidth>element.clientWidth),false);
    }
    if(route==='stats/barrelroll/') {
      fs.mkdirSync('artifacts',{recursive:true});
      await page.setViewportSize({width:1440,height:1000}); await page.locator('.profile-hero-card').screenshot({path:'artifacts/profile-roles-desktop.png'});
      await page.setViewportSize({width:390,height:1000}); await page.locator('.profile-hero-card').screenshot({path:'artifacts/profile-roles-mobile.png'});
    }
  }
  // Concurrent admin changes cannot be silently overwritten.
  await admin.locator('#adminRoleChoices input[value="event-champion"]').uncheck();
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'memberRoles','barrelroll'),{roleIds:['bounty-hunter'],updatedAt:Timestamp.now()}));
  await admin.locator('#adminSaveProfileRoles').click();
  await admin.waitForFunction(()=>document.getElementById('adminProfileRolesStatus').textContent.includes('Another admin changed'));
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('#adminRoleChoices input[value="bounty-hunter"]').uncheck();
  await admin.locator('#adminSaveProfileRoles').click();
  await admin.waitForFunction(()=>document.getElementById('adminProfileRolesStatus').textContent.includes('All profile roles removed'));
  await member.waitForFunction(()=>document.querySelectorAll('#memberProfileForm .profile-role-badge').length===0);
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    assert.equal((await getDoc(doc(db,'memberAccess','barrelroll'))).data().role,'hr');
    assert.equal((await getDoc(doc(db,'memberAccess','elusion'))).exists(),false);
    const activities=(await getDocs(collection(db,'adminActivity'))).docs.map(entry=>entry.data());
    assert(activities.some(entry=>entry.action==='profile-role-created'));
    assert(activities.some(entry=>entry.action==='member-roles-changed'&&entry.targetId==='barrelroll'));
  });
  await admin.locator('.admin-role-library summary').click();
  for(const page of [legacy,member,...pages]) await page.context().close();
  await admin.locator('[data-member-view="profile"]').click();
  console.log('PASS: admin-only role creation/assignment/removal, starter Bounty Hunter, duplicate/reserved names, five-role limit, no-Gmail assignment, live public badges on four surfaces and account page, concurrent admin edits, audit log and responsive layout.');
};
