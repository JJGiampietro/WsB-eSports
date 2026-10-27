const assert = require('node:assert/strict'), fs = require('node:fs');
module.exports = async function checkMemberLayout(page, base = 'http://localhost:8000/') {
  const latest = JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname,'../../data/latest.json'),'utf8'));
  const now = new Date().toISOString(), older = new Date(Date.now()-8*86400000).toISOString();
  latest.fetchedAt=now; latest.sync ||= {};
  for (const [id, player] of Object.entries(latest.players)) {player.stale=false;player.lastSuccessAt=now;latest.sync[id]={state:'synced',lastSuccessAt:now,issue:''};}
  latest.players.elusion ||= {username:'TEST Elusion',stats:{}};
  latest.players.elusion.stale=true; latest.players.elusion.lastSuccessAt=older;
  latest.sync.elusion={state:'stale',lastSuccessAt:older,issue:'TEST: the service could not refresh this account. '+ 'Verify the Epic username and Public Game Stats. '.repeat(15)};
  delete latest.players.dmo; latest.sync.dmo={state:'waiting',issue:'TEST: waiting for first stats. '+ 'Verify the exact account name. '.repeat(15)};
  await page.route('**/data/latest.json*', route=>route.fulfill({contentType:'application/json',body:JSON.stringify(latest)}));
  await page.goto(base+'members.html');
  await page.locator('[data-member-id="elusion"][data-profile-link-ready="true"]').waitFor();
  assert.equal(await page.locator('#membersGrid .member-sync-status, #membersGrid .sync-issue').count(),0);
  assert.match(await page.locator('#membersRefreshNote').textContent(),/Last updated .*Refreshes hourly on the hour\./);
  const sync = require('../../sync-status.js');
  assert.equal(sync.status(latest,'elusion').state,'stale','Operational state is still retained for administrators');
  assert.equal(sync.status(latest,'dmo').state,'waiting');
  // Async callbacks retain the loaded dependency even during global teardown/reload.
  await page.evaluate(()=>{ delete window.WsbSync; document.dispatchEvent(new Event('wsb:visibility-applied')); });
  await page.locator('#memberSearch').fill('elusion');
  await page.locator('#memberSearch').fill('');
  await page.evaluate(()=>{document.querySelector('[data-member-id="elusion"] .member-name').textContent='TEST VeryLongFortniteDisplayNameWithNoSpaces';});
  for (const theme of ['normal','halloween']) {
    await page.evaluate(value=>document.body.classList.toggle('halloween-theme',value==='halloween'),theme);
    for (const width of [1599,1280,1040,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      const failures = await page.evaluate(()=>{
        const problems=[];
        if(document.documentElement.scrollWidth>innerWidth)problems.push('page overflow');
        const cards=[...document.querySelectorAll('#membersGrid .member-card')];
        for(const card of cards) {
          if(card.querySelector('.member-sync-status')||card.classList.contains('sync-issue'))problems.push(card.dataset.memberId+': public operational message');
          const name=card.querySelector('.member-name');
          if(card.getClientRects().length&&name.scrollWidth>name.clientWidth+1)problems.push(card.dataset.memberId+': clipped name');
        }
        const rows=new Map();for(const card of cards){const rect=card.getBoundingClientRect(),key=Math.round(rect.top);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(rect.height);}
        for(const heights of rows.values())if(Math.max(...heights)-Math.min(...heights)>1)problems.push('unequal card heights in row');
        return problems;
      });
      assert.deepEqual(failures,[],theme+' at '+width);
    }
  }
  await page.evaluate(()=>document.body.classList.remove('halloween-theme'));await page.setViewportSize({width:1599,height:1000});
  fs.mkdirSync(require('node:path').resolve(__dirname,'artifacts'),{recursive:true});
  await page.locator('#membersGrid').screenshot({path:require('node:path').resolve(__dirname,'artifacts/member-status-layout.png')});
  await page.goto(base+'stats.html');
  await page.locator('a.stats-player').first().waitFor();
  assert.match(await page.locator('#statsRefreshNote').textContent(),/Last updated .*Refreshes hourly on the hour\./);
  for (const id of ['lizzie','elusion','dmo']) {
    await page.locator('#statsSearch').fill(id);
    const card=page.locator('a.stats-player[href="stats/'+id+'/"]');
    await card.waitFor();
    assert.equal(await card.locator('.stats-sync-state, .sync-detail, .stats-issue-copy').count(),0);
    assert.equal(await card.evaluate(card=>card.classList.contains('stats-player-issue')),false);
    if(id==='dmo')assert.deepEqual(await card.locator('.stats-metrics b').allTextContents(),['-','-','-','-','-','-']);
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Stats directory overflow at '+width);
    }
  }
  await page.unroute('**/data/latest.json*');
  console.log('PASS: clean Members/Stats cards for fresh/outdated/waiting profiles, retained page timestamps and operational metadata, missing numbers shown as dashes, long names, equal row cards, six viewport widths and both themes.');
  return { snapshot: latest };
};
