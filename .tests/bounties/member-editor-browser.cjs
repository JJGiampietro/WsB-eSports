const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async({admin,anon,owner})=>{
  assert.equal(await anon.locator('[data-member-view="profile"]').isVisible(),false);
  assert.equal(await owner.locator('[data-member-view="profile"]').isVisible(),false);
  assert.equal(await admin.locator('[data-member-view]').count(),3);
  await admin.locator('[data-member-view="profile"]').click();
  await admin.locator('#adminProfileBio').fill('Draft kept while switching views');
  await admin.locator('[data-member-view="roles"]').click();await admin.locator('#adminRole').selectOption('creator');
  await admin.locator('[data-member-view="access"]').click();await admin.locator('#adminInviteEmail').fill('draft@wsb-test.invalid');
  await admin.locator('[data-member-view="profile"]').click();
  assert.equal(await admin.locator('#adminProfileBio').inputValue(),'Draft kept while switching views');
  assert.match(await admin.locator('.public-profile-preview').innerText(),/Draft kept/);
  assert.equal(await admin.locator('#adminRole').inputValue(),'creator');
  assert.equal(await admin.locator('#adminInviteEmail').inputValue(),'draft@wsb-test.invalid');
  assert.equal(await admin.locator('#adminRole').evaluate(input=>input.form.id),'adminMemberForm');
  await admin.locator('[data-member-view="profile"]').focus();await admin.keyboard.press('ArrowRight');
  assert.equal(await admin.locator('[data-member-view="roles"]').getAttribute('aria-selected'),'true');
  await admin.keyboard.press('End');assert.equal(await admin.locator('[data-member-view="access"]').getAttribute('aria-selected'),'true');
  await admin.keyboard.press('Home');assert.equal(await admin.locator('[data-member-view="profile"]').getAttribute('aria-selected'),'true');
  for(const theme of ['normal','halloween']){
    await admin.evaluate(value=>document.body.classList.toggle('halloween-theme',value==='halloween'),theme);
    for(const width of [1440,1040,768,600,390,320]){
      await admin.setViewportSize({width,height:1000});
      for(const view of ['profile','roles','access']){
        await admin.locator('[data-member-view="'+view+'"]').click();
        assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+view+' '+width);
        assert.equal(await admin.locator('[data-member-panel]:visible').count(),1);
        if(theme==='normal'&&[1440,390].includes(width)){
          fs.mkdirSync('artifacts',{recursive:true});await admin.locator('#admin-panel-members').screenshot({path:'artifacts/admin-members-'+view+'-'+width+'.png'});
        }
      }
    }
  }
  await admin.evaluate(()=>document.body.classList.remove('halloween-theme'));await admin.setViewportSize({width:1440,height:1000});
  // Reset the draft through the same member selector, then test native validation across tabs.
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');
  await admin.locator('#adminStartNew').click();await admin.locator('#adminSave').click();
  assert.equal(await admin.locator('[data-member-view="profile"]').getAttribute('aria-selected'),'true');
  assert.equal(await admin.evaluate(()=>document.activeElement.id),'adminDisplayName');
  await admin.locator('#adminDisplayName').fill('Not saved');await admin.locator('#adminFortniteUsername').fill('NotSaved');await admin.locator('#adminSave').click();
  assert.equal(await admin.locator('[data-member-view="access"]').getAttribute('aria-selected'),'true');
  assert.equal(await admin.evaluate(()=>document.activeElement.id),'adminInviteEmail');
  await admin.locator('#adminMemberPicker').selectOption('barrelroll');await admin.locator('[data-member-view="profile"]').click();
  console.log('PASS: focused member views, admin-only visibility, external membership field form association, draft/preview preservation, accessible keyboard tabs, hidden-field native validation, six widths and both themes.');
};
