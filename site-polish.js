/* Progressive enhancements shared by the static pages. No account writes. */
(() => {
  const root = document.body.dataset.siteRoot || '';
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skip-link'; skip.href = '#' + main.id; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  const nav = document.getElementById('navlinks'), menu = document.querySelector('.menu');
  function markCurrentPage() {
    if (!nav) return;
    const current = location.pathname.replace(/index\.html$/, '');
    nav.querySelectorAll('a').forEach(link => {
      const url = new URL(link.href, location.href);
      const matches = url.pathname.replace(/index\.html$/, '') === current && (!url.hash || url.hash === location.hash);
      if (matches) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    nav.querySelectorAll('.nav-group').forEach(group => group.classList.toggle('is-current', !!group.querySelector('[aria-current="page"]') || (current.includes('/stats/') && !!group.querySelector('a[href$="stats.html"]'))));
  }
  if (nav && menu) {
    menu.setAttribute('aria-controls', nav.id);
    function syncMenu() { menu.setAttribute('aria-expanded', String(nav.classList.contains('open'))); }
    new MutationObserver(syncMenu).observe(nav, {attributes:true, attributeFilter:['class']});
    new MutationObserver(markCurrentPage).observe(nav, {childList:true});
    syncMenu(); markCurrentPage(); window.addEventListener('hashchange', markCurrentPage);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const opened = nav.querySelector('.nav-group[open]');
      if (opened) { opened.open = false; opened.querySelector('summary').focus(); }
      else if (nav.classList.contains('open')) { nav.classList.remove('open'); menu.focus(); }
    });
    document.addEventListener('click', event => { if (!nav.contains(event.target) && !menu.contains(event.target)) nav.classList.remove('open'); });
  }

  // Existing custom dialogs retain their original opening/closing logic.
  document.querySelectorAll('.bio-modal,.join-modal').forEach(modal => {
    let wasOpen = false, previousFocus = null, background = [];
    const focusable = () => [...modal.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    new MutationObserver(() => {
      const open = modal.classList.contains('open');
      if (open === wasOpen) return;
      wasOpen = open;
      if (open) {
        previousFocus = document.activeElement;
        background = [...document.body.children].filter(el => el !== modal && !el.contains(modal) && !['SCRIPT','STYLE'].includes(el.tagName)).map(el => [el,el.inert]);
        background.forEach(([el]) => { el.inert = true; });
        const target = focusable()[0] || modal.querySelector('[role="dialog"]');
        if (target) { if (target.matches('[role="dialog"]')) target.tabIndex = -1; target.focus(); }
      } else {
        background.forEach(([el,old]) => { el.inert = old; });
        if (previousFocus?.isConnected) previousFocus.focus();
      }
    }).observe(modal, {attributes:true,attributeFilter:['class']});
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length-1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
    });
  });

  document.querySelectorAll('.faq-item').forEach((item,index) => {
    const button = item.querySelector('.faq-question'), answer = item.querySelector('.faq-answer');
    if (!button || !answer) return;
    answer.id ||= 'faq-answer-' + index;
    button.id ||= 'faq-question-' + index;
    answer.setAttribute('role','region'); answer.setAttribute('aria-labelledby',button.id);
    button.setAttribute('aria-controls',answer.id);
    const sync = () => { const open = item.classList.contains('open'); button.setAttribute('aria-expanded',String(open)); answer.inert = !open; answer.setAttribute('aria-hidden',String(!open)); };
    button.addEventListener('click',sync); sync();
  });

  document.querySelectorAll('.clip-load').forEach(button => {
    const preview = button.closest('.clip-preview');
    const slide = button.closest('.clip-slide');
    new MutationObserver(() => {
      if (!slide.classList.contains('active')) {
        preview.querySelector('iframe')?.replaceWith(button);
        preview.classList.remove('is-playing');
      }
    }).observe(slide, {attributes:true,attributeFilter:['class']});
    button.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.title = 'WsB TikTok highlight'; iframe.src = 'https://www.tiktok.com/embed/v2/' + encodeURIComponent(preview.dataset.clipId);
    iframe.allow = 'fullscreen'; iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    preview.classList.add('is-playing'); button.replaceWith(iframe);
    // Cross-origin playback cannot be reliably inspected. Keep a direct link visible at all times.
    });
  });

  const periods = [['lbLifetime','Lifetime'],['lbPastDay','Past 24 hours'],['lbPastWeek','Past 7 days']];
  const firstBoard = document.getElementById('lbLifetime');
  if (firstBoard) {
    const tabs = document.createElement('div'); tabs.className = 'period-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Leaderboard time period');
    const buttons = periods.map(([id,label],index) => {
      const button = document.createElement('button'); button.type = 'button'; button.id = id + '-tab'; button.textContent = label; button.setAttribute('role','tab'); button.setAttribute('aria-controls',id);
      const panel = document.getElementById(id); panel.setAttribute('role','tabpanel'); panel.setAttribute('aria-labelledby',button.id); panel.tabIndex = 0;
      button.addEventListener('click',() => select(index)); tabs.append(button); return button;
    });
    function select(index) { buttons.forEach((button,i) => {button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;document.getElementById(periods[i][0]).hidden=i!==index;}); }
    tabs.addEventListener('keydown',event => { const i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(event.key==='ArrowRight')next=(i+1)%3;else if(event.key==='ArrowLeft')next=(i+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();select(next);buttons[next].focus(); });
    firstBoard.before(tabs); select(0);
  }

  document.querySelectorAll('.ann-post').forEach((post,index) => {
    const paragraphs = [...post.querySelectorAll(':scope > p')];
    if (paragraphs.length < 3) return;
    const extra = document.createElement('div'); extra.className='ann-extra'; extra.id='announcement-more-'+index; extra.hidden=true;
    paragraphs.slice(1).forEach(p=>extra.append(p)); post.append(extra);
    const button=document.createElement('button');button.type='button';button.className='read-more';button.textContent='Read full announcement';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',extra.id);
    button.addEventListener('click',()=>{extra.hidden=!extra.hidden;button.setAttribute('aria-expanded',String(!extra.hidden));button.textContent=extra.hidden?'Read full announcement':'Show less';});post.append(button);
  });

  const grid = document.getElementById('membersGrid');
  const search = document.getElementById('memberSearch'), filter = document.getElementById('memberFilter');
  const managementIds = new Set(['jen','lizzie','taz','kato','lazy','elusion','dmo','bee','mysterious','skrewwww','barrelroll','ingraham']);
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let roster = [], players = null, lastSuccess = null;
  const formatTime = value => new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles',timeZoneName:'short'}).format(new Date(value));
  let historyPromise;
  function loadHistory() {
    return historyPromise ||= fetch(root+'data/history.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(history=>{
      lastSuccess=new Map();
      for(const snapshot of history?.snapshots||[]) {if(!Number.isFinite(Date.parse(snapshot.fetchedAt)))continue;for(const id of Object.keys(snapshot.players||{})){if(!lastSuccess.has(id)||Date.parse(lastSuccess.get(id))<Date.parse(snapshot.fetchedAt))lastSuccess.set(id,snapshot.fetchedAt);}}
    }).catch(()=>{lastSuccess=new Map();});
  }
  function historyText(id) { return lastSuccess?.has(id)?'Last successful sync: '+formatTime(lastSuccess.get(id))+'.':'No successful snapshot in the recent history.'; }
  function updateMembers() {
    if (!grid) return;
    const term=normalize(search?.value), category=filter?.value||'all';let shown=0;
    const cards=[...grid.querySelectorAll('.member-card')];
    cards.forEach(card=>{
      const member=roster.find(m=>m.id===card.dataset.memberId||m.username===card.dataset.fnUser);
      const id=member?.id||(!card.dataset.fnUser?'ingraham':'');
      const synced=players && id && !!players[id];
      const issue=players && member && !synced;
      const rank=card.querySelector('.member-meta b');
      if(rank&&!rank.dataset.rankLabeled&&rank.textContent.trim()!=='SYNCED') { rank.dataset.rankLabeled='true';rank.textContent += /^Dirt/.test(rank.textContent)?' · For fun':' · Team-set'; }
      if(issue){
        card.classList.add('sync-issue');
        let label=card.querySelector('.member-sync-status');
        if(!label){label=document.createElement('span');label.className='member-sync-status';card.append(label);}
        label.removeAttribute('role');label.removeAttribute('aria-label');
        const text='Stats unavailable'+(lastSuccess?' · '+historyText(id):'');
        if(label.textContent!==text)label.textContent=text;
        label.title='The latest refresh did not return stats. This does not mean zero stats.';
      } else if(synced) {
        card.classList.remove('sync-issue');
        card.querySelector('.member-sync-status')?.remove();
      }
      const matchesName=!term||normalize((card.querySelector('.member-name')?.textContent||'')+' '+card.dataset.fnUser+' '+id).includes(term);
      const matchesFilter=category==='all'||category==='management'&&managementIds.has(id)||category==='synced'&&synced||category==='issue'&&issue;
      const wrapper=card.closest('.member-card-wrap')||card;
      wrapper.hidden=!(matchesName&&matchesFilter);if(!wrapper.hidden)shown++;
    });
    const count=document.getElementById('memberResults'); if(count)count.textContent=shown+' of '+cards.length+' members';
    const empty=document.getElementById('memberEmpty');if(empty)empty.hidden=shown!==0;
  }
  function annotateStats() {
    document.querySelectorAll('.stats-player-issue').forEach(card=>{
      const id=decodeURIComponent(new URL(card.href).pathname.split('/').filter(Boolean).pop());
      const note=card.querySelector('.stats-issue-copy');
      if(note&&lastSuccess)note.textContent='Stats unavailable in the latest refresh. '+historyText(id);
    });
    const detail=document.getElementById('playerDetail');
    if(detail&&document.body.dataset.memberId&&detail.querySelector('.profile-panel-wide')&&lastSuccess){const panel=detail.querySelector('.profile-panel-wide');if(!panel.querySelector('.last-success')){const note=document.createElement('p');note.className='last-success';note.textContent=historyText(document.body.dataset.memberId);panel.append(note);}}
  }
  if(grid||document.getElementById('statsDirectory')||document.getElementById('playerDetail')) {
    Promise.all([fetch(root+'data/roster.json',{cache:'no-store'}).then(r=>r.ok?r.json():[]),fetch(root+'data/latest.json',{cache:'no-store'}).then(r=>r.ok?r.json():null)]).then(async([members,snapshot])=>{
      roster=Array.isArray(members)?members:[];players=snapshot?.players||null;updateMembers();
      if(players&&roster.some(m=>!players[m.id])){await loadHistory();updateMembers();annotateStats();}
    }).catch(()=>{updateMembers();});
    const target=grid||document.getElementById('statsDirectory')||document.getElementById('playerDetail');
    let timer;
    const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{observer.disconnect();updateMembers();annotateStats();observe();},80);});
    function observe(){observer.observe(target,{childList:true,subtree:true,characterData:true});}observe();
    search?.addEventListener('input',updateMembers);filter?.addEventListener('change',updateMembers);updateMembers();
  }
})();
