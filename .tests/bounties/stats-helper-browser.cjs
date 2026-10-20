const assert=require('node:assert/strict');
module.exports=async({pageFor})=>{
  const page=await pageFor(null,'stats/barrelroll/');
  try{
    // Simulate an unavailable classic helper. The explicit module must load it
    // before asynchronous rendering, rather than leave the page stuck loading.
    await page.route('**/sync-status.js?v=1',route=>route.abort());
    for(const [route,selector] of [
      ['stats/barrelroll/','.profile-hero-bio'],
      ['members.html','.member-sync-label'],
      ['stats.html','a.stats-player'],
      ['leaderboards.html','.lb-category']
    ]){
      await page.goto('http://localhost:8000/'+route);
      await page.locator(selector).first().waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>typeof window.WsbSync?.status),'function');
    }
    console.log('PASS: missing classic stats helper recovers through the explicit module on player, members, stats directory and leaderboards pages.');
  }finally{await page.context().close();}
};
