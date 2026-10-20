const assert=require('node:assert/strict');
const {doc,setDoc,getDoc,deleteDoc,Timestamp}=require('firebase/firestore');
module.exports=async({pageFor,env})=>{
  let previous,page,releaseStats;
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
  await env.withSecurityRulesDisabled(async ctx=>{
    const ref=doc(ctx.firestore(),'members','dmo');previous=await getDoc(ref);
    await setDoc(ref,{displayName:'Custom icon member',bio:'',socials:{},profileImage:image,updatedAt:Timestamp.now()});
  });
  try{
    page=await pageFor(null,'members.html');
    const avatar=page.locator('.member-card[data-public-member-id="dmo"] .member-emblem');
    await page.waitForFunction(()=>document.querySelector('[data-public-member-id="dmo"] .member-emblem')?.style.backgroundImage.includes('data:image/'));
    assert.equal((await avatar.textContent()).trim(),'','Custom profile images must replace the fallback initial');
    const fallback=page.locator('[data-public-member-id="btajordan"] .member-emblem');
    assert.notEqual((await fallback.textContent()).trim(),'','Members without images retain their initial');
    assert.equal(await fallback.evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.equal((await avatar.textContent()).trim(),'');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    const statsGate=new Promise(resolve=>{releaseStats=resolve;});
    await page.route('**/data/latest.json*',async route=>{await statsGate;await route.continue();});
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('[data-public-member-id="dmo"] .member-emblem')?.style.backgroundImage.includes('data:image/'));
    assert.equal((await avatar.textContent()).trim(),'','Reload must not restore the fallback letter');
    const custom=page.locator('[data-public-member-id="barrelroll"] .member-emblem');
    await page.waitForFunction(()=>document.querySelector('[data-public-member-id="barrelroll"] .member-emblem')?.dataset.memberProfileImage==='true');
    const expected=await custom.evaluate(el=>el.style.backgroundImage);
    releaseStats();
    await page.waitForFunction(()=>document.getElementById('membersRefreshNote').textContent.includes('Last updated'));
    assert.equal(await custom.evaluate(el=>el.style.backgroundImage),expected,'Late stock-roster rendering cannot overwrite the custom icon');
    // Reapplying the cached public profile also removes a pre-existing initial.
    await page.evaluate(()=>{
      document.querySelector('[data-public-member-id="barrelroll"] .member-emblem').textContent='B';
      document.dispatchEvent(new Event('wsb:directory-render'));
    });
    await page.waitForFunction(()=>document.querySelector('[data-public-member-id="barrelroll"] .member-emblem')?.textContent==='');
    console.log('PASS: custom member icons replace initials, text-only avatars remain intact, no regression after reload/directory rendering, three viewport widths.');
  }finally{
    releaseStats?.();if(page)await page.context().close();
    await env.withSecurityRulesDisabled(async ctx=>{
      const ref=doc(ctx.firestore(),'members','dmo');if(previous.exists())await setDoc(ref,previous.data());else await deleteDoc(ref);
    });
  }
};
