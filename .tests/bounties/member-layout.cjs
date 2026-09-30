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
  await page.locator('[data-member-id="elusion"] .member-sync-label').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-member-id="dmo"] .member-sync-label')?.textContent==='Waiting for first sync');
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
          const note=card.querySelector('.member-sync-status');if(!note)continue;
          const box=card.getBoundingClientRect(), status=note.getBoundingClientRect(), rank=card.querySelector('.member-meta').getBoundingClientRect();
          if(getComputedStyle(note).position!=='static')problems.push(card.dataset.memberId+': positioned status');
          if(status.top<rank.bottom+8)problems.push(card.dataset.memberId+': rank overlaps status');
          if(status.left<box.left+8||status.right>box.right-8||status.bottom>box.bottom-8)problems.push(card.dataset.memberId+': status outside card');
          for(const line of note.children) {
            if(line.classList.contains('member-sync-full-issue'))continue;
            const rect=line.getBoundingClientRect();
            if(rect.bottom>box.bottom-8||line.scrollWidth>line.clientWidth+1)problems.push(card.dataset.memberId+': clipped status line');
          }
          if(!card.getAttribute('aria-describedby')?.split(' ').includes(note.id))problems.push(card.dataset.memberId+': missing accessible status');
          if(note.dataset.syncState==='synced'&&getComputedStyle(note.querySelector('strong')).color===getComputedStyle(document.querySelector('[data-member-id="elusion"] .member-sync-label')).color)problems.push('synced warning color');
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
  assert.match(await page.locator('[data-member-id="elusion"] .member-sync-status').getAttribute('title'),/Verify the Epic username/);
  await page.unroute('**/data/latest.json*');
  console.log('PASS: fresh/outdated/waiting member statuses, long names/issues, rank separation, contained text, equal row cards, accessibility, six viewport widths and both themes.');
};
