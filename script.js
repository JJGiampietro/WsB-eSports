const menu=document.querySelector(".menu");const nav=document.querySelector("#navlinks");if(menu&&nav){menu.addEventListener("click",()=>nav.classList.toggle("open"));nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");nav.querySelectorAll(".nav-group[open]").forEach(group=>group.removeAttribute("open"));}));nav.querySelectorAll(".nav-group").forEach(group=>group.addEventListener("toggle",()=>{if(group.open)nav.querySelectorAll(".nav-group").forEach(other=>{if(other!==group)other.removeAttribute("open");});}));document.addEventListener("click",event=>{if(!nav.contains(event.target))nav.querySelectorAll(".nav-group[open]").forEach(group=>group.removeAttribute("open"));});}

// Keep roster-backed creator photos in sync with the central profileImage field.
(function(){
  const creatorCards=document.querySelectorAll(".player-card[data-roster-id]");
  if(!creatorCards.length)return;
  fetch("data/roster.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():[];}).then(function(roster){
    const rosterById=new Map((Array.isArray(roster)?roster:[]).map(function(member){return [member.id,member];}));
    creatorCards.forEach(function(card){
      const member=rosterById.get(card.dataset.rosterId);
      if(member&&member.profileImage)card.style.setProperty("--player-photo",'url("'+encodeURI(member.profileImage)+'")');
    });
  }).catch(function(){
    // Existing image paths remain as a safe fallback if roster data is unavailable.
  });
})();
// Player bio modal
(function(){
  const modal=document.getElementById("bioModal");
  const photo=document.getElementById("bioPhoto");
  const role=document.getElementById("bioRole");
  const name=document.getElementById("bioName");
  const text=document.getElementById("bioText");
  const gif=document.getElementById("bioGif");
  const tiktok=document.getElementById("bioTiktok");
  const cards=document.querySelectorAll(".player-card, .tier-node[data-bio]");
  if(!modal||!cards.length)return;

  function openBio(card){
    const isTier=card.classList.contains("tier-node");
    const nameEl=isTier?card.querySelector(".tier-name"):card.querySelector(".player-name h3");
    const bg=card.style.getPropertyValue(isTier?"--tier-photo":"--player-photo");
    photo.style.backgroundImage=bg||"none";
    role.textContent=card.dataset.role||"";
    name.textContent=nameEl?nameEl.textContent.trim():"";
    const hasGif=card.dataset.bioGif==="tenor-jetpack-cat";
    text.textContent=card.dataset.bio||(hasGif?"":"Bio coming soon.");
    text.hidden=hasGif&&!card.dataset.bio;
    if(gif)gif.hidden=!hasGif;
    const link=card.dataset.tiktok;
    if(link){tiktok.href=link;tiktok.style.display="inline-flex";}
    else{tiktok.style.display="none";}
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }
  function closeBio(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }
  cards.forEach(card=>{
    card.setAttribute("tabindex","0");
    card.setAttribute("role","button");
    card.addEventListener("click",()=>openBio(card));
    card.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){e.preventDefault();openBio(card);}
    });
  });
  modal.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click",closeBio));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeBio();});
})();

// Join popup
(function(){
  const joinModal=document.getElementById("joinModal");
  const navJoinLink=document.getElementById("navJoinLink");
  if(!joinModal||!navJoinLink)return;

  function openJoin(){
    joinModal.classList.add("open");
    joinModal.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
  }
  function closeJoin(){
    joinModal.classList.remove("open");
    joinModal.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
  }
  navJoinLink.addEventListener("click",e=>{
    e.preventDefault();
    openJoin();
  });
  joinModal.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click",closeJoin));
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeJoin();});
})();

// TikTok clip carousel
(function(){
  const carousel=document.getElementById("clipCarousel");
  if(!carousel)return;
  const slides=Array.from(carousel.querySelectorAll(".clip-slide"));
  const dots=Array.from(carousel.querySelectorAll(".clip-dot"));
  const prevBtn=carousel.querySelector(".clip-prev");
  const nextBtn=carousel.querySelector(".clip-next");
  let index=0;

  function show(i){
    index=(i+slides.length)%slides.length;
    slides.forEach((s,n)=>{s.classList.toggle("active",n===index);s.inert=n!==index;s.setAttribute("aria-hidden",String(n!==index));});
    dots.forEach((d,n)=>{d.classList.toggle("active",n===index);d.setAttribute("aria-pressed",String(n===index));});
  }
  function next(){show(index+1);}
  function prev(){show(index-1);}
  // Manual navigation prevents rotation while someone watches a clip.
  nextBtn.addEventListener("click",next);
  prevBtn.addEventListener("click",prev);
  dots.forEach((d,n)=>d.addEventListener("click",()=>show(n)));

  show(0);
})();


// Hidden Minecraft Easter egg on WSB_Ingraham's card
(function(){
  const avatarBtn=document.getElementById("ingrahamAvatarBtn");
  const peek=document.getElementById("mcPeek");
  const bubble=document.getElementById("mcBubble");
  const peekImg=document.getElementById("mcPeekImg");
  const creeper=document.getElementById("mcCreeper");
  const achievement=document.getElementById("mcAchievement");
  if(!avatarBtn||!peek||!bubble)return;

  const SESSION_KEY="wsbMcTriggerCount";
  const ACHIEVEMENT_KEY="wsbMcAchievementShown";
  const reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const RANDOM_MESSAGES=["go away","wrong game","where diamonds","fortnite?","need wood","bro this is not hypixel","0.07 kd is crazy","Dirt 1 \uD83D\uDC80"];

  let hideTimer=null;
  let wobbleTimer=null;
  let active=false;

  function getCount(){
    try{return parseInt(sessionStorage.getItem(SESSION_KEY)||"0",10);}catch(e){return 0;}
  }
  function setCount(n){
    try{sessionStorage.setItem(SESSION_KEY,String(n));}catch(e){}
  }
  function achievementShown(){
    try{return sessionStorage.getItem(ACHIEVEMENT_KEY)==="1";}catch(e){return false;}
  }
  function markAchievementShown(){
    try{sessionStorage.setItem(ACHIEVEMENT_KEY,"1");}catch(e){}
  }

  // Tiny synthesized 8-bit-style blip - no external audio file needed.
  // Only ever called from within the click handler below, so it's always
  // tied to a real user gesture and never autoplays.
  function playBlip(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      const ctx=new Ctx();
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      o.type="square";
      o.frequency.value=660;
      g.gain.value=0.02;
      o.connect(g);
      g.connect(ctx.destination);
      const now=ctx.currentTime;
      o.frequency.exponentialRampToValueAtTime(880,now+0.08);
      g.gain.exponentialRampToValueAtTime(0.0001,now+0.16);
      o.start(now);
      o.stop(now+0.18);
      o.onended=function(){ctx.close();};
    }catch(e){}
  }

  function showAchievement(){
    if(!achievement||achievementShown())return;
    markAchievementShown();
    achievement.classList.add("show");
    achievement.setAttribute("aria-hidden","false");
    setTimeout(function(){
      achievement.classList.remove("show");
      achievement.setAttribute("aria-hidden","true");
    },3200);
  }

  function clearTimers(){
    clearTimeout(hideTimer);
    clearTimeout(wobbleTimer);
  }

  function onMouseMove(e){
    if(!active)return;
    const isCreeper=peek.classList.contains("creeper-mode");
    const target=isCreeper?creeper:peekImg;
    if(!target)return;
    const rect=target.getBoundingClientRect();
    const cx=rect.left+rect.width/2;
    const cy=rect.top+rect.height/2;
    const dist=Math.hypot(e.clientX-cx,e.clientY-cy);
    if(dist<Math.max(rect.width,rect.height)*1.6){
      retreat(true);
    }
  }

  function retreat(fast){
    clearTimers();
    active=false;
    document.removeEventListener("mousemove",onMouseMove);
    if(fast)peek.classList.add("fast-retreat");
    peek.classList.remove("active","wobble");
    setTimeout(function(){
      peek.classList.remove("fast-retreat","silent","creeper-mode");
    },260);
  }

  function trigger(){
    clearTimers();
    peek.classList.remove("wobble","fast-retreat","silent","creeper-mode");

    const count=getCount()+1;
    setCount(count);

    const isCreeper=Math.random()<0.015;

    if(isCreeper){
      peek.classList.add("creeper-mode");
      bubble.textContent="";
    }else if(count===1){
      bubble.textContent="sup?";
    }else if(count===2){
      bubble.textContent="you again?";
    }else if(count===3){
      bubble.textContent="bro";
    }else if(count===4){
      bubble.textContent="";
      peek.classList.add("silent");
    }else{
      bubble.textContent=RANDOM_MESSAGES[Math.floor(Math.random()*RANDOM_MESSAGES.length)];
    }

    active=true;
    peek.classList.add("active");
    playBlip();

    if(!reduceMotion){
      wobbleTimer=setTimeout(function(){
        if(active)peek.classList.add("wobble");
      },480);
    }

    document.addEventListener("mousemove",onMouseMove);

    const duration=isCreeper?800:(reduceMotion?1400:3000);
    hideTimer=setTimeout(function(){
      retreat(false);
    },duration);

    if(count===5)showAchievement();
  }

  avatarBtn.addEventListener("click",function(){
    trigger();
  });

  // Clicking the character itself while he's out: cut the message and bail immediately
  function onCharacterClick(e){
    e.stopPropagation();
    bubble.textContent="";
    retreat(true);
  }
  if(peekImg)peekImg.addEventListener("click",onCharacterClick);
  if(creeper)creeper.addEventListener("click",onCharacterClick);
})();


// Saved Fortnite stats snapshot (Members page)
// The server refreshes this file regularly, so the page loads one saved file instead
// of making a separate live API request for every member card.
(function(){
  const cards=document.querySelectorAll("[data-fn-user]");
  const refreshNote=document.getElementById("membersRefreshNote");
  if(!cards.length)return;

  function fmtInt(n){return Math.round(n).toLocaleString("en-US");}

  function formatPacific(timestamp){
    return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles",timeZoneName:"short"}).format(new Date(timestamp));
  }

  function setSyncIssue(card,hasIssue){
    const existing=card.querySelector(".member-sync-status");
    if(!hasIssue){
      if(existing)existing.remove();
      card.classList.remove("sync-issue");
      return;
    }
    card.classList.add("sync-issue");
    if(existing)return;
    const indicator=document.createElement("span");
    indicator.className="member-sync-status";
    indicator.textContent="Stats unavailable";
    indicator.setAttribute("aria-label","Stats unavailable in the latest refresh");
    indicator.title="Stats sync needs attention";
    card.appendChild(indicator);
  }

  function setProfileImage(card,member){
    if(!member||!member.profileImage)return;
    const emblem=card.querySelector(".member-emblem");
    if(!emblem)return;
    emblem.style.backgroundImage='url("'+encodeURI(member.profileImage)+'")';
    emblem.textContent="";
  }
  function setProfileLink(card,member){
    if(!member||card.dataset.profileLinkReady)return;
    card.dataset.profileLinkReady="true";
    card.dataset.memberId=member.id;
    card.classList.add("member-card-link");
    card.setAttribute("role","link");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label","Open "+member.displayName+" detailed stats");
    function openProfile(){window.location.href="stats/"+encodeURIComponent(member.id)+"/";}
    card.addEventListener("click",openProfile);
    card.addEventListener("keydown",function(event){
      if(event.key==="Enter"||event.key===" "){event.preventDefault();openProfile();}
    });
  }

  function applyStats(card,stats){
    const map={
      kd:v=>v.toFixed(2),
      winrate:v=>v.toFixed(1)+"%",
      wins:v=>fmtInt(v),
      kills:v=>fmtInt(v),
      matches:v=>fmtInt(v)
    };
    Object.keys(map).forEach(function(key){
      if(stats[key]===undefined||isNaN(stats[key]))return;
      const el=card.querySelector('[data-stat="'+key+'"]');
      if(el)el.textContent=map[key](stats[key]);
    });
  }

  Promise.all([
    fetch("data/latest.json",{cache:"no-store"}).then(function(res){return res.ok?res.json():null;}),
    fetch("data/roster.json",{cache:"no-store"}).then(function(res){return res.ok?res.json():[];})
  ]).then(function(results){
    const snapshot=results[0];
    const roster=Array.isArray(results[1])?results[1]:[];
    const rosterByUsername=new Map(roster.map(function(member){return [member.username,member];}));
    cards.forEach(function(card){
      const member=rosterByUsername.get(card.getAttribute("data-fn-user"));
      setProfileImage(card,member);
      setProfileLink(card,member);
    });
    if(!snapshot||!snapshot.players)return;
    if(refreshNote&&snapshot.fetchedAt){
      refreshNote.textContent="Last updated "+formatPacific(snapshot.fetchedAt)+". Refreshes hourly on the hour.";
    }
    const byUsername=new Map(Object.values(snapshot.players).map(function(player){return [player.username,player];}));
    cards.forEach(function(card){
      const member=rosterByUsername.get(card.getAttribute("data-fn-user"));
      const stats=(member&&snapshot.players[member.id])||byUsername.get(card.getAttribute("data-fn-user"));
      setSyncIssue(card,!stats);
      if(stats)applyStats(card,stats);
    });
  }).catch(function(){
    // Keep the simple roster view if saved data is unavailable.
  });
})();


// Spooky Surprise theme toggle - persists across pages via localStorage
(function(){
  const btn=document.getElementById("spookyToggle");
  if(!btn)return;

  const KEY="wsbHalloweenTheme";

  function apply(on){
    document.body.classList.toggle("halloween-theme",on);
    btn.setAttribute("aria-pressed",on?"true":"false");
    btn.textContent=on?"🎃 Back to Normal":"🎃 Spooky Surprise";
  }

  let on=false;
  try{on=localStorage.getItem(KEY)==="1";}catch(e){}
  apply(on);

  btn.addEventListener("click",function(){
    on=!on;
    try{localStorage.setItem(KEY,on?"1":"0");}catch(e){}
    apply(on);
  });
})();


// Leaderboards page - reads saved hourly JSON snapshots written by GitHub Actions
(function(){
  const pastDayGrid=document.getElementById("lbPastDayGrid");
  const pastWeekGrid=document.getElementById("lbPastWeekGrid");
  const lifetimeGrid=document.getElementById("lbLifetimeGrid");
  const lifetimeRefreshNote=document.getElementById("lbLifetimeRefreshNote");
  if(!pastDayGrid||!pastWeekGrid||!lifetimeGrid)return;

  const DAY_MS=24*60*60*1000;
  const WEEK_MS=7*DAY_MS;
  const BASELINE_TOLERANCE_MS=6*60*60*1000;

  function fmtInt(n){return Math.round(n).toLocaleString("en-US");}
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(character){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character];});}
  function medalRank(i){return i+1;}

  function buildCategory(title,rows,valueFmt){
    if(!rows.length)return "";
    let html='<div class="lb-category"><h3>'+title+"</h3>";
    rows.slice(0,5).forEach(function(row,i){
      html+='<div class="lb-row"><div class="lb-rank">'+medalRank(i)+"</div>"
        +(row.id?'<a class="lb-name" href="stats/'+encodeURIComponent(row.id)+'/" aria-label="Open '+escapeHtml(row.name)+' stats">'+escapeHtml(row.name)+'</a>':'<div class="lb-name">'+escapeHtml(row.name)+'</div>')
        +'<div class="lb-value">'+valueFmt(row.value)+(row.stale?' <small title="Last successful stats retained; latest refresh failed">Outdated</small>':'')+"</div></div>";
    });
    return html+="</div>";
  }

  function topBy(entries,key,n){
    return entries.filter(function(e){return typeof e[key]==="number"&&!isNaN(e[key]);})
      .sort(function(a,b){return b[key]-a[key];})
      .slice(0,n||5)
      .map(function(e){return {id:e.id,name:e.displayName,value:e[key],stale:Boolean(e.stale)};});
  }

  function formatPacific(value){
    return new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
  }

  function findBaseline(snapshots,targetTime){
    return snapshots
      .filter(function(snapshot){return snapshot&&snapshot.players&&Number.isFinite(Date.parse(snapshot.fetchedAt));})
      .sort(function(a,b){return Math.abs(Date.parse(a.fetchedAt)-targetTime)-Math.abs(Date.parse(b.fetchedAt)-targetTime);})
      .find(function(snapshot){return Math.abs(Date.parse(snapshot.fetchedAt)-targetTime)<=BASELINE_TOLERANCE_MS;});
  }

  function buildDeltaEntries(latest,baseline){
    const entries=[];
    Object.keys(latest.players).forEach(function(id){
      const cur=latest.players[id];
      const prev=baseline.players[id];
      if(!prev)return;
      if(cur.stale || prev.stale || window.WsbSync.status(latest,id).state !== 'synced')return;
      if(prev.accountId&&cur.accountId&&prev.accountId!==cur.accountId)return;
      const deltaKills=cur.kills-prev.kills;
      const deltaWins=cur.wins-prev.wins;
      const deltaMatches=cur.matches-prev.matches;
      if(deltaKills<0||deltaWins<0||deltaMatches<0)return;
      entries.push({id:id,displayName:cur.displayName,deltaKills:deltaKills,deltaWins:deltaWins,deltaMatches:deltaMatches});
    });
    return entries;
  }

  function renderPeriod(grid,latest,baseline,waitingMessage,periodLabel){
    if(!baseline||!baseline.players||!Object.keys(baseline.players).length){
      grid.innerHTML='<p class="lb-empty">'+waitingMessage+"</p>";
      return;
    }
    const entries=buildDeltaEntries(latest,baseline);
    let html="";
    html+=buildCategory("Most Kills ("+periodLabel+")",topBy(entries,"deltaKills"),fmtInt);
    html+=buildCategory("Most Wins ("+periodLabel+")",topBy(entries,"deltaWins"),fmtInt);
    html+=buildCategory("Most Matches ("+periodLabel+")",topBy(entries,"deltaMatches"),fmtInt);
    grid.innerHTML=html||'<p class="lb-empty">No player activity recorded yet.</p>';
  }

  Promise.all([
    fetch("data/latest.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
    fetch("data/history.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
    fetch("data/roster.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];})
  ]).then(function(results){
    const latest=results[0];
    const history=results[1];
    const roster=Array.isArray(results[2])?results[2]:[];
    if(!latest||!latest.players||!Object.keys(latest.players).length)return;
    const activeIds=new Set(roster.map(function(member){return member.id;}));
    const activePlayers=Object.fromEntries(Object.entries(latest.players).filter(function(entry){return activeIds.has(entry[0]);}));
    const activeLatest=Object.assign({},latest,{players:activePlayers});
    if(!Object.keys(activeLatest.players).length)return;
    const latestTime=Date.parse(latest.fetchedAt);
    const snapshots=history&&Array.isArray(history.snapshots)?history.snapshots:[];

    if(lifetimeRefreshNote&&latest.fetchedAt){
      lifetimeRefreshNote.textContent="Last updated "+formatPacific(latest.fetchedAt)+". Refreshes hourly on the hour.";
    }

    const lifetimeEntries=Object.entries(activeLatest.players).map(function(entry){return Object.assign({id:entry[0]},entry[1],{stale:window.WsbSync.status(latest,entry[0]).state!=='synced'});});
    let lifetimeHtml="";
    lifetimeHtml+=buildCategory("Best K/D",topBy(lifetimeEntries,"kd"),function(v){return v.toFixed(2);});
    lifetimeHtml+=buildCategory("Most Kills (Lifetime)",topBy(lifetimeEntries,"kills"),fmtInt);
    lifetimeHtml+=buildCategory("Most Wins (Lifetime)",topBy(lifetimeEntries,"wins"),fmtInt);
    lifetimeGrid.innerHTML=lifetimeHtml||lifetimeGrid.innerHTML;

    renderPeriod(pastDayGrid,activeLatest,findBaseline(snapshots,latestTime-DAY_MS),"24-hour stats will be ready tomorrow.","24 Hours");
    renderPeriod(pastWeekGrid,activeLatest,findBaseline(snapshots,latestTime-WEEK_MS),"Weekly stats will be ready next week.","7 Days");
  });
})();


// Live countdown timers (Announcements + Events pages)
(function(){
  function update(){
    document.querySelectorAll("[data-countdown-target]").forEach(function(widget){
      const target = new Date(widget.getAttribute("data-countdown-target")).getTime();
      const now = Date.now();
      let diff = target - now;

      const daysEl = widget.querySelector('[data-cd="days"]');
      const hoursEl = widget.querySelector('[data-cd="hours"]');
      const minutesEl = widget.querySelector('[data-cd="minutes"]');
      const secondsEl = widget.querySelector('[data-cd="seconds"]');

      if(diff <= 0){
        if(daysEl) daysEl.textContent = "0";
        if(hoursEl) hoursEl.textContent = "0";
        if(minutesEl) minutesEl.textContent = "0";
        if(secondsEl) secondsEl.textContent = "0";
        return;
      }

      const days = Math.floor(diff / 86400000);
      diff -= days * 86400000;
      const hours = Math.floor(diff / 3600000);
      diff -= hours * 3600000;
      const minutes = Math.floor(diff / 60000);
      diff -= minutes * 60000;
      const seconds = Math.floor(diff / 1000);

      if(daysEl) daysEl.textContent = days;
      if(hoursEl) hoursEl.textContent = hours;
      if(minutesEl) minutesEl.textContent = minutes;
      if(secondsEl) secondsEl.textContent = seconds;
    });
  }

  update();
  setInterval(update, 1000);
})();


// FAQ accordion (Questions page)
(function(){
  const items = document.querySelectorAll(".faq-item");
  if(!items.length) return;

  items.forEach(function(item){
    const btn = item.querySelector(".faq-question");
    const answer = item.querySelector(".faq-answer");
    if(!btn || !answer) return;

    btn.addEventListener("click", function(){
      const isOpen = item.classList.contains("open");
      item.classList.toggle("open", !isOpen);
      answer.style.maxHeight = isOpen ? "0" : answer.scrollHeight + "px";
    });
  });
})();


// Stats page - detailed member profile view
(function(){
  const overview=document.getElementById("statsOverview");
  const highlights=document.getElementById("statsHighlights");
  const directory=document.getElementById("statsDirectory");
  const refreshNote=document.getElementById("statsRefreshNote");
  const directoryNote=document.getElementById("statsDirectoryNote");
  if(!overview||!highlights||!directory)return;



  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,function(character){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character];});
  }
  function fmtInt(value){return Math.round(value||0).toLocaleString("en-US");}
  function fmtDecimal(value){return Number(value||0).toFixed(2);}
  function fmtPercent(value){return Number(value||0).toFixed(1)+"%";}
  function formatPacific(value){
    return new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
  }
  function leader(entries,key){
    return entries.reduce(function(best,entry){return !best||entry.stats[key]>best.stats[key]?entry:best;},null);
  }
  function highlight(label,entry,value){
    if(!entry)return "";
    return '<div class="stats-highlight"><span>'+label+'</span><strong>'+escapeHtml(entry.member.displayName)+'</strong><b>'+value+'</b></div>';
  }
  function initials(name){
    return name.replace(/[^A-Za-z0-9]/g,"").slice(0,2).toUpperCase()||"W";
  }

  Promise.all([
    fetch("data/roster.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():[];}).catch(function(){return [];}),
    fetch("data/latest.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():null;}).catch(function(){return null;})
  ]).then(function(results){
    const roster=Array.isArray(results[0])?results[0]:[];
    const snapshot=results[1];
    const players=snapshot&&snapshot.players?snapshot.players:{};
    const entries=roster.map(function(member){return {member:member,stats:players[member.id]||null};});
    const synced=entries.filter(function(entry){return entry.stats;});

    if(refreshNote&&snapshot&&snapshot.fetchedAt){
      refreshNote.textContent="Last updated "+formatPacific(snapshot.fetchedAt)+". Refreshes hourly on the hour.";
    }
    if(directoryNote){
      const fresh=entries.filter(entry=>window.WsbSync.status(snapshot,entry.member.id).state==='synced').length;
      directoryNote.textContent=fresh+" of "+roster.length+" profiles up to date. "+synced.length+" have saved stats.";
    }

    const total=function(key){return synced.reduce(function(sum,entry){return sum+(Number(entry.stats[key])||0);},0);};
    const summary=[
      ["LINKED PROFILES",synced.length+" / "+roster.length],
      ["TOTAL WINS",fmtInt(total("wins"))],
      ["TOTAL KILLS",fmtInt(total("kills"))],
      ["TOTAL MATCHES",fmtInt(total("matches"))]
    ];
    overview.innerHTML=summary.map(function(item){return '<div class="stats-summary-card"><span>'+item[0]+'</span><strong>'+item[1]+'</strong></div>';}).join("");

    const topKd=leader(synced,"kd");
    const topWinRate=leader(synced,"winrate");
    const topKills=leader(synced,"kills");
    const topWins=leader(synced,"wins");
    highlights.innerHTML=
      highlight("BEST K/D",topKd,topKd?fmtDecimal(topKd.stats.kd):"-")+
      highlight("BEST WIN RATE",topWinRate,topWinRate?fmtPercent(topWinRate.stats.winrate):"-")+
      highlight("MOST KILLS",topKills,topKills?fmtInt(topKills.stats.kills):"-")+
      highlight("MOST WINS",topWins,topWins?fmtInt(topWins.stats.wins):"-");

    const leaderIds=new Map([[topKd,"Top K/D"],[topWinRate,"Best Win Rate"],[topKills,"Most Kills"],[topWins,"Most Wins"]].filter(function(pair){return pair[0];}).map(function(pair){return [pair[0].member.id,pair[1]];}));
    const searchInput=document.getElementById("statsSearch");
    const sortInput=document.getElementById("statsSort");

    function metricValue(entry,key){
      if(!entry.stats)return null;
      if(key==="killsPerMatch")return entry.stats.matches?entry.stats.kills/entry.stats.matches:0;
      return Number(entry.stats[key])||0;
    }

    function playerCard(entry){
      const member=entry.member;
      const stats=entry.stats;
      const asset=member.profileImage;
      const avatar=asset
        ? '<div class="stats-avatar" style="background-image:url('+asset+')"></div>'
        : '<div class="stats-avatar stats-avatar-initial">'+initials(member.displayName)+'</div>';
      const badge=leaderIds.get(member.id)?'<span class="stats-badge">'+leaderIds.get(member.id)+'</span>':"";
      if(!stats){
        return '<a class="stats-player stats-player-issue" href="stats/'+encodeURIComponent(member.id)+'/" aria-label="Open '+escapeHtml(member.displayName)+' stats">'+avatar+'<div class="stats-player-head"><div><h3>'+escapeHtml(member.displayName)+'</h3><p>'+escapeHtml(member.username)+'</p></div><span class="stats-sync-state"><i></i>Waiting for first sync</span></div><p class="stats-issue-copy">'+escapeHtml(window.WsbSync.describe(snapshot,member.id))+'</p></a>';
      }
      const killsPerMatch=stats.matches?stats.kills/stats.matches:0;
      const sync=window.WsbSync.status(snapshot,member.id);
      return '<a class="stats-player" href="stats/'+encodeURIComponent(member.id)+'/" aria-label="Open '+escapeHtml(member.displayName)+' stats">'+avatar+'<div class="stats-player-head"><div><h3>'+escapeHtml(member.displayName)+'</h3><p>'+escapeHtml(stats.username||member.username)+'</p></div><span class="stats-sync-state '+(sync.state==='synced'?'stats-sync-ok':'stats-sync-stale')+'"><i></i>'+escapeHtml(sync.label)+'</span></div><p class="sync-detail">'+escapeHtml(window.WsbSync.describe(snapshot,member.id))+'</p>'+badge+'<div class="stats-metrics">'
        +'<div><span>K/D</span><b>'+fmtDecimal(stats.kd)+'</b></div>'
        +'<div><span>WIN RATE</span><b>'+fmtPercent(stats.winrate)+'</b></div>'
        +'<div><span>WINS</span><b>'+fmtInt(stats.wins)+'</b></div>'
        +'<div><span>KILLS</span><b>'+fmtInt(stats.kills)+'</b></div>'
        +'<div><span>MATCHES</span><b>'+fmtInt(stats.matches)+'</b></div>'
        +'<div><span>KILLS / MATCH</span><b>'+fmtDecimal(killsPerMatch)+'</b></div>'
        +'</div></a>';
    }

    let currentPage=1;
    const pageSize=8;
    const pagination=document.createElement("div");
    pagination.className="stats-pagination";
    pagination.setAttribute("aria-label","Player directory pages");
    directory.after(pagination);
    function renderDirectory(){
      const normalizeSearch=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase();
      const search=normalizeSearch(searchInput&&searchInput.value||"").trim();
      const sort=sortInput?sortInput.value:"roster";
      const filtered=entries.filter(function(entry){
        const searchable=normalizeSearch(entry.member.displayName+" "+entry.member.username+" "+entry.member.id+" "+(entry.stats?.username||""));
        return !search||searchable.includes(search);
      });
      if(sort==="name"){
        filtered.sort(function(a,b){return a.member.displayName.localeCompare(b.member.displayName);});
      }else if(sort==="issue"){
        filtered.sort(function(a,b){return Number(Boolean(a.stats))-Number(Boolean(b.stats));});
      }else if(sort!=="roster"){
        filtered.sort(function(a,b){
          const aValue=metricValue(a,sort);
          const bValue=metricValue(b,sort);
          if(aValue===null)return 1;
          if(bValue===null)return -1;
          return bValue-aValue||a.member.displayName.localeCompare(b.member.displayName);
        });
      }
      const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
      currentPage=Math.min(currentPage,pages);
      const start=(currentPage-1)*pageSize, visible=filtered.slice(start,start+pageSize);
      if(directoryNote)directoryNote.textContent=filtered.length?("Showing "+(start+1)+"-"+(start+visible.length)+" of "+filtered.length+" matching profiles."):"No matching profiles.";
      directory.innerHTML=visible.map(playerCard).join("")||'<p class="lb-empty">No players match your search.</p>';
      directory.querySelectorAll(".stats-player").forEach(function(card){card.classList.add("compact-stats");const more=document.createElement("span");more.className="stats-player-more";more.textContent="View full stats →";card.append(more);});
      pagination.innerHTML=pages>1?'<button type="button" class="outline-btn" data-page="prev" '+(currentPage===1?'disabled':'')+'>Previous</button><span role="status">Page '+currentPage+' of '+pages+'</span><button type="button" class="outline-btn" data-page="next" '+(currentPage===pages?'disabled':'')+'>Next</button>':'';
      pagination.querySelectorAll("button").forEach(function(button){button.addEventListener("click",function(){currentPage+=button.dataset.page==="next"?1:-1;renderDirectory();const target=document.querySelector(".stats-directory-heading");target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:"start",behavior:"instant"});});});
      document.dispatchEvent(new Event("wsb:directory-render"));
    }

    if(searchInput)searchInput.addEventListener("input",function(){currentPage=1;renderDirectory();});
    if(sortInput)sortInput.addEventListener("change",function(){currentPage=1;renderDirectory();});
    renderDirectory();
  });
})();


// Player Stats detail pages
(function(){
  const detail=document.getElementById("playerDetail");
  const memberId=document.body.dataset.memberId;
  const root=document.body.dataset.siteRoot||"";
  if(!detail||!memberId)return;


  const streamProfiles={
    lizzie:{platform:"TikTok",url:"https://www.tiktok.com/@ok.lizzlee"},
    jen:{platform:"TikTok",url:"https://www.tiktok.com/@jenclipsmen"}
  };
  const DAY_MS=24*60*60*1000;
  const WEEK_MS=7*DAY_MS;
  const BASELINE_TOLERANCE_MS=6*60*60*1000;
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(character){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character];});}
  function fmtInt(value){return Math.round(value||0).toLocaleString("en-US");}
  function fmtDecimal(value){return Number(value||0).toFixed(2);}
  function fmtPercent(value){return Number(value||0).toFixed(1)+"%";}
  function formatPacific(value){return new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));}
  function fitProfileName(){
    const name=detail.querySelector(".profile-hero-card h1");
    if(!name)return;
    name.style.fontSize="";
    name.style.whiteSpace="nowrap";
    const minimum=window.innerWidth<=650?24:30;
    let size=parseFloat(window.getComputedStyle(name).fontSize);
    while(name.scrollWidth>name.clientWidth&&size>minimum){
      size-=1;
      name.style.fontSize=size+"px";
    }
  }
  window.addEventListener("resize",fitProfileName);

  function setupComparison(synced,currentMember,currentStats){
    const toggle=document.getElementById("profileCompareToggle");
    const controls=document.getElementById("profileCompareControls");
    const select=document.getElementById("profileCompareSelect");
    const result=document.getElementById("profileCompareResult");
    if(!toggle||!controls||!select||!result)return;
    const candidates=synced.filter(function(entry){return entry.id!==currentMember.id;}).sort(function(a,b){return a.member.displayName.localeCompare(b.member.displayName);});
    select.innerHTML='<option value="">Choose a member</option>'+candidates.map(function(entry){return '<option value="'+escapeHtml(entry.id)+'">'+escapeHtml(entry.member.displayName)+'</option>';}).join("");
    toggle.addEventListener("click",function(){
      const opening=controls.hidden;
      controls.hidden=!opening;
      toggle.setAttribute("aria-expanded",opening?"true":"false");
    });
    function valueClass(current,other){
      if(current===other)return "";
      return current>other?"profile-compare-winner":"profile-compare-lower";
    }
    function row(label,current,other,formatter){
      return '<div class="profile-compare-row"><b class="'+valueClass(current,other)+'">'+formatter(current)+'</b><span>'+label+'</span><b class="'+valueClass(other,current)+'">'+formatter(other)+'</b></div>';
    }
    function render(otherEntry){
      const other=otherEntry.stats;
      const currentKpm=currentStats.matches?currentStats.kills/currentStats.matches:0;
      const otherKpm=other.matches?other.kills/other.matches:0;
      result.innerHTML='<div class="profile-compare-matchup"><div><span>VIEWING</span><strong>'+escapeHtml(currentMember.displayName)+'</strong></div><i>VS</i><div><span>COMPARING</span><strong>'+escapeHtml(otherEntry.member.displayName)+'</strong></div></div><div class="profile-compare-rows">'
        +row("K/D",currentStats.kd,other.kd,fmtDecimal)
        +row("WIN RATE",currentStats.winrate,other.winrate,fmtPercent)
        +row("WINS",currentStats.wins,other.wins,fmtInt)
        +row("KILLS",currentStats.kills,other.kills,fmtInt)
        +row("MATCHES",currentStats.matches,other.matches,fmtInt)
        +row("KILLS / MATCH",currentKpm,otherKpm,fmtDecimal)
        +'</div><p class="profile-compare-key"><b>Brighter number</b> has the higher value for that stat.</p>';
    }
    select.addEventListener("change",function(){
      const selected=candidates.find(function(entry){return entry.id===select.value;});
      result.innerHTML=selected?"":'<p class="profile-empty">Choose a synced member to compare their stats.</p>';
      if(selected)render(selected);
    });
    result.innerHTML='<p class="profile-empty">Choose a synced member to compare their stats.</p>';
  }

  function findBaseline(snapshots,targetTime){
    return snapshots.filter(function(snapshot){return snapshot&&snapshot.players&&Number.isFinite(Date.parse(snapshot.fetchedAt));})
      .sort(function(a,b){return Math.abs(Date.parse(a.fetchedAt)-targetTime)-Math.abs(Date.parse(b.fetchedAt)-targetTime);})
      .find(function(snapshot){return Math.abs(Date.parse(snapshot.fetchedAt)-targetTime)<=BASELINE_TOLERANCE_MS;});
  }
  function activity(latest,baseline,id,label,emptyText){
    const previous=baseline&&baseline.players?baseline.players[id]:null;
    const current=latest.players[id];
    if(!previous||!current||current.stale||previous.stale||window.WsbSync.status(latest,id).state==='stale')return '<section class="profile-panel"><p class="label">'+label+'</p><p class="profile-empty">'+(current && window.WsbSync.status(latest,id).state==='stale'?'Activity comparison is paused while stats are outdated.':emptyText)+"</p></section>";
    const kills=current.kills-previous.kills;
    const wins=current.wins-previous.wins;
    const matches=current.matches-previous.matches;
    if(kills<0||wins<0||matches<0)return '<section class="profile-panel"><p class="label">'+label+'</p><p class="profile-empty">New activity data will appear after the next refresh.</p></section>';
    return '<section class="profile-panel"><p class="label">'+label+'</p><div class="profile-activity-stats"><div><span>KILLS</span><b>'+fmtInt(kills)+'</b></div><div><span>WINS</span><b>'+fmtInt(wins)+'</b></div><div><span>MATCHES</span><b>'+fmtInt(matches)+'</b></div></div></section>';
  }

  Promise.all([
    fetch(root+"data/roster.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():[];}).catch(function(){return [];}),
    fetch(root+"data/latest.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():null;}).catch(function(){return null;}),
    fetch(root+"data/history.json",{cache:"no-store"}).then(function(response){return response.ok?response.json():null;}).catch(function(){return null;})
  ]).then(function(results){
    const roster=Array.isArray(results[0])?results[0]:[];
    const latest=results[1];
    const history=results[2];
    const member=roster.find(function(item){return item.id===memberId;});
    if(!member){detail.innerHTML='<section class="unavailable-profile"><p class="label">PLAYER PROFILE</p><h1>PROFILE UNAVAILABLE.</h1><p>This link may belong to a former member, or the roster could not be loaded. Find a current player in the member directory, or try again shortly.</p><a class="outline-btn" href="'+root+'members.html">BROWSE MEMBERS →</a><a class="outline-btn" href="'+root+'stats.html">ALL STATS →</a></section>';return;}
    const stats=latest&&latest.players?latest.players[member.id]:null;
    const asset=member.profileImage;
    const avatar=asset?'<div class="profile-avatar" style="background-image:url('+escapeHtml(root+asset)+')"></div>':'<div class="profile-avatar profile-avatar-initial">'+escapeHtml(member.displayName.replace(/[^A-Za-z0-9]/g,"").slice(0,2).toUpperCase()||"W")+'</div>';
    const sync=window.WsbSync.status(latest,member.id);
    const status='<span class="stats-sync-state '+(sync.state==='synced'?'stats-sync-ok':sync.state==='stale'?'stats-sync-stale':'')+'"><i></i>'+escapeHtml(sync.label)+'</span><p class="sync-detail">'+escapeHtml(window.WsbSync.describe(latest,member.id))+'</p>';
    const stream=streamProfiles[member.id];
    const streamLink=stream?'<a class="profile-stream-link" href="'+escapeHtml(stream.url)+'" target="_blank" rel="noopener"><i></i>'+escapeHtml(stream.platform).toUpperCase()+' STREAMER<span>VIEW PROFILE ↗</span></a>':'';
    let html='<a class="profile-back" href="'+root+'stats.html">← BACK TO ALL STATS</a><section class="profile-hero-card">'+avatar+'<div><p class="label">FORTNITE MEMBER PROFILE</p><h1>'+escapeHtml(member.displayName)+'</h1><p class="profile-username">'+escapeHtml((stats&&stats.username)||member.username)+'</p>'+status+streamLink+'</div></section>';
    if(!stats){
      detail.innerHTML=html+'<section class="profile-panel profile-panel-wide"><p class="label">PROFILE STATUS</p><h2>STATS NEED ATTENTION</h2><p class="profile-empty">The latest refresh did not return stats for this account. Missing data does not mean zero stats. Check Public Game Stats in Fortnite, or ask an admin to check the linked account.</p></section>';
      requestAnimationFrame(fitProfileName);
      document.dispatchEvent(new Event('wsb:profile-render'));
      return;
    }
    const rosterById=new Map(roster.map(function(entry){return [entry.id,entry];}));
    const synced=Object.keys(latest.players).map(function(id){
      const syncedMember=rosterById.get(id)||{id:id,displayName:latest.players[id].displayName||id};
      return {id:id,member:syncedMember,stats:latest.players[id]};
    });
    function rank(key){return synced.slice().sort(function(a,b){return b.stats[key]-a.stats[key];}).findIndex(function(entry){return entry.id===member.id;})+1;}
    const killsPerMatch=stats.matches?stats.kills/stats.matches:0;
    html+='<div class="profile-performance">'
      +'<div class="profile-stat-card"><span>K/D</span><b>'+fmtDecimal(stats.kd)+'</b></div>'
      +'<div class="profile-stat-card"><span>WIN RATE</span><b>'+fmtPercent(stats.winrate)+'</b></div>'
      +'<div class="profile-stat-card"><span>WINS</span><b>'+fmtInt(stats.wins)+'</b></div>'
      +'<div class="profile-stat-card"><span>KILLS</span><b>'+fmtInt(stats.kills)+'</b></div>'
      +'<div class="profile-stat-card"><span>MATCHES</span><b>'+fmtInt(stats.matches)+'</b></div>'
      +'<div class="profile-stat-card"><span>KILLS / MATCH</span><b>'+fmtDecimal(killsPerMatch)+'</b></div>'
      +'</div>';
    html+='<section class="profile-panel profile-compare-panel"><button type="button" class="profile-compare-toggle" id="profileCompareToggle" aria-expanded="false"><span>COMPARE WITH ANOTHER MEMBER</span><b>↔</b></button><div class="profile-compare-controls" id="profileCompareControls" hidden><label>SELECT A SYNCED MEMBER<select id="profileCompareSelect"></select></label><div id="profileCompareResult"></div></div></section>';
    html+='<section class="profile-panel"><p class="label">TEAM STANDING</p><div class="profile-ranks">'
      +'<div><span>K/D RANK</span><b>#'+rank("kd")+'</b></div>'
      +'<div><span>WIN RATE RANK</span><b>#'+rank("winrate")+'</b></div>'
      +'<div><span>WINS RANK</span><b>#'+rank("wins")+'</b></div>'
      +'<div><span>KILLS RANK</span><b>#'+rank("kills")+'</b></div>'
      +'<div><span>MATCHES RANK</span><b>#'+rank("matches")+'</b></div>'
      +'</div></section>';
    const snapshots=history&&Array.isArray(history.snapshots)?history.snapshots:[];
    const latestTime=Date.parse(latest.fetchedAt);
    html+='<div class="profile-activity-grid">'
      +activity(latest,findBaseline(snapshots,latestTime-DAY_MS),member.id,"PAST 24 HOURS","24-hour stats will be ready tomorrow.")
      +activity(latest,findBaseline(snapshots,latestTime-WEEK_MS),member.id,"PAST 7 DAYS","Weekly stats will be ready next week.")
      +'</div><p class="profile-data-note">'+escapeHtml(window.WsbSync.describe(latest,member.id))+'. Refresh attempts hourly on the hour.</p>';
    detail.innerHTML=html;
    setupComparison(synced,member,stats);
    document.dispatchEvent(new Event('wsb:profile-render'));
    requestAnimationFrame(fitProfileName);
  });
})();


// Games page - Blackjack & Roulette (virtual chips only, no real money)
(function(){
  const chipDisplay = document.getElementById("chipBalance");
  if(!chipDisplay) return;

  const CHIPS_KEY = "wsbGameChips";
  const STARTING_CHIPS = 1000;

  function getChips(){
    try{
      const v = parseInt(localStorage.getItem(CHIPS_KEY), 10);
      return isNaN(v) ? STARTING_CHIPS : v;
    }catch(e){ return STARTING_CHIPS; }
  }
  function setChips(n){
    try{ localStorage.setItem(CHIPS_KEY, String(n)); }catch(e){}
    chipDisplay.textContent = n.toLocaleString("en-US");
  }
  setChips(getChips());

  const resetBtn = document.getElementById("resetChips");
  if(resetBtn){
    resetBtn.addEventListener("click", function(){
      setChips(STARTING_CHIPS);
    });
  }

  // ---- Tab switching ----
  const tabs = document.querySelectorAll(".game-tab");
  const panels = {
    blackjack: document.getElementById("panel-blackjack"),
    roulette: document.getElementById("panel-roulette")
  };
  tabs.forEach(function(tab){
    tab.addEventListener("click", function(){
      tabs.forEach(function(t){ t.classList.remove("active"); });
      tab.classList.add("active");
      Object.keys(panels).forEach(function(key){
        if(panels[key]) panels[key].hidden = (key !== tab.dataset.game);
      });
    });
  });

  // ================= BLACKJACK =================
  (function(){
    const dealBtn = document.getElementById("bjDeal");
    const hitBtn = document.getElementById("bjHit");
    const standBtn = document.getElementById("bjStand");
    const betInput = document.getElementById("bjBet");
    const dealerCardsEl = document.getElementById("dealerCards");
    const playerCardsEl = document.getElementById("playerCards");
    const dealerScoreEl = document.getElementById("dealerScore");
    const playerScoreEl = document.getElementById("playerScore");
    const messageEl = document.getElementById("bjMessage");
    if(!dealBtn) return;

    const SUITS = ["♠","♥","♦","♣"];
    const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
    let deck = [];
    let dealerHand = [];
    let playerHand = [];
    let currentBet = 0;
    let roundActive = false;

    function freshDeck(){
      const d = [];
      SUITS.forEach(function(suit){
        RANKS.forEach(function(rank){
          d.push({ rank: rank, suit: suit });
        });
      });
      for(let i = d.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
      }
      return d;
    }

    function handValue(hand){
      let total = 0;
      let aces = 0;
      hand.forEach(function(card){
        if(card.rank === "A"){ total += 11; aces++; }
        else if(["J","Q","K"].indexOf(card.rank) !== -1){ total += 10; }
        else { total += parseInt(card.rank, 10); }
      });
      while(total > 21 && aces > 0){ total -= 10; aces--; }
      return total;
    }

    function renderCard(card, hidden){
      const isRed = card.suit === "♥" || card.suit === "♦";
      if(hidden) return '<div class="playing-card back"></div>';
      return '<div class="playing-card' + (isRed ? " red" : "") + '">' + card.rank + card.suit + "</div>";
    }

    function render(revealDealer){
      dealerCardsEl.innerHTML = dealerHand.map(function(c, i){
        return renderCard(c, !revealDealer && i === 1);
      }).join("");
      playerCardsEl.innerHTML = playerHand.map(function(c){ return renderCard(c, false); }).join("");
      playerScoreEl.textContent = "(" + handValue(playerHand) + ")";
      dealerScoreEl.textContent = revealDealer ? "(" + handValue(dealerHand) + ")" : "";
    }

    function endRound(outcome, payoutMultiplier){
      roundActive = false;
      hitBtn.disabled = true;
      standBtn.disabled = true;
      dealBtn.disabled = false;
      betInput.disabled = false;
      render(true);

      let chips = getChips();
      if(outcome === "win"){
        const winnings = Math.round(currentBet * payoutMultiplier);
        chips += winnings;
        messageEl.textContent = "You win " + winnings.toLocaleString("en-US") + " chips!";
      }else if(outcome === "push"){
        messageEl.textContent = "Push - bet returned.";
      }else{
        chips -= currentBet;
        messageEl.textContent = "Dealer wins. -" + currentBet.toLocaleString("en-US") + " chips.";
      }
      setChips(Math.max(chips, 0));
    }

    function dealerPlay(){
      while(handValue(dealerHand) < 17){
        dealerHand.push(deck.pop());
      }
      const playerTotal = handValue(playerHand);
      const dealerTotal = handValue(dealerHand);
      if(dealerTotal > 21 || playerTotal > dealerTotal) endRound("win", 1);
      else if(dealerTotal === playerTotal) endRound("push", 0);
      else endRound("lose", 0);
    }

    dealBtn.addEventListener("click", function(){
      const bet = parseInt(betInput.value, 10);
      const chips = getChips();
      if(!bet || bet < 10){ messageEl.textContent = "Minimum bet is 10 chips."; return; }
      if(bet > chips){ messageEl.textContent = "You don't have enough chips for that bet."; return; }

      currentBet = bet;
      deck = freshDeck();
      playerHand = [deck.pop(), deck.pop()];
      dealerHand = [deck.pop(), deck.pop()];
      roundActive = true;
      dealBtn.disabled = true;
      betInput.disabled = true;
      hitBtn.disabled = false;
      standBtn.disabled = false;
      messageEl.textContent = "Your move.";
      render(false);

      const playerBJ = handValue(playerHand) === 21;
      const dealerBJ = handValue(dealerHand) === 21;
      if(playerBJ || dealerBJ){
        hitBtn.disabled = true;
        standBtn.disabled = true;
        if(playerBJ && dealerBJ) endRound("push", 0);
        else if(playerBJ) endRound("win", 1.5);
        else endRound("lose", 0);
      }
    });

    hitBtn.addEventListener("click", function(){
      if(!roundActive) return;
      playerHand.push(deck.pop());
      const total = handValue(playerHand);
      render(false);
      if(total > 21){
        hitBtn.disabled = true;
        standBtn.disabled = true;
        endRound("lose", 0);
      }
    });

    standBtn.addEventListener("click", function(){
      if(!roundActive) return;
      hitBtn.disabled = true;
      standBtn.disabled = true;
      dealerPlay();
    });
  })();

  // ================= ROULETTE =================
  (function(){
    const spinBtn = document.getElementById("rlSpin");
    const resultEl = document.getElementById("rouletteResult");
    const messageEl = document.getElementById("rlMessage");
    const selectedLabel = document.getElementById("rlSelected");
    const wheelEl = document.getElementById("rouletteWheel");
    const ballTrackEl = document.getElementById("wheelBallTrack");
    const numbersEl = document.getElementById("btNumbers");
    const outsideEl = document.getElementById("btOutside");
    if(!spinBtn || !wheelEl) return;

    // Standard European wheel order (clockwise)
    const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const SEG_ANGLE = 360 / WHEEL_ORDER.length;

    function colorOf(n){
      if(n === 0) return "green";
      return RED_NUMBERS.indexOf(n) !== -1 ? "red" : "black";
    }

    // Build the wheel segments
    WHEEL_ORDER.forEach(function(num, i){
      const el = document.createElement("div");
      el.className = "wheel-number " + colorOf(num);
      el.style.transform = "rotate(" + (i * SEG_ANGLE) + "deg)";
      el.textContent = num;
      wheelEl.appendChild(el);
    });

    // Build the number grid: classic layout, 3 rows x 12 numbers, plus a 2:1
    // column-bet cell at the end of each row, and 0 spanning all 3 rows on the left.
    const dozensEl = document.getElementById("btDozens");
    const chipSelectEl = document.getElementById("chipSelect");
    const currentChipLabel = document.getElementById("rlCurrentChip");

    const TABLE_ROWS = [
      [3,6,9,12,15,18,21,24,27,30,33,36],
      [2,5,8,11,14,17,20,23,26,29,32,35],
      [1,4,7,10,13,16,19,22,25,28,31,34]
    ];

    const zeroCell = document.createElement("div");
    zeroCell.className = "bt-cell green zero-cell";
    zeroCell.textContent = "0";
    zeroCell.dataset.bet = "number:0";
    numbersEl.appendChild(zeroCell);

    TABLE_ROWS.forEach(function(row, rowIndex){
      row.forEach(function(n){
        const cell = document.createElement("div");
        cell.className = "bt-cell " + colorOf(n);
        cell.textContent = n;
        cell.dataset.bet = "number:" + n;
        cell.style.gridRow = rowIndex + 1;
        numbersEl.appendChild(cell);
      });
      const colCell = document.createElement("div");
      colCell.className = "bt-cell col2to1";
      colCell.textContent = "2:1";
      colCell.dataset.bet = "col" + (rowIndex + 1);
      colCell.style.gridRow = rowIndex + 1;
      colCell.style.gridColumn = 14;
      numbersEl.appendChild(colCell);
    });

    // Dozens (1st12 / 2nd12 / 3rd12) - each pays 2:1
    const DOZENS = [
      { key: "dozen1", label: "1st 12" },
      { key: "dozen2", label: "2nd 12" },
      { key: "dozen3", label: "3rd 12" }
    ];
    DOZENS.forEach(function(d){
      const cell = document.createElement("div");
      cell.className = "bt-outside-cell dozen-cell";
      cell.textContent = d.label;
      cell.dataset.bet = d.key;
      dozensEl.appendChild(cell);
    });

    // Outside bets
    const OUTSIDE_BETS = [
      { key: "low", label: "1-18", cls: "" },
      { key: "even", label: "EVEN", cls: "" },
      { key: "red", label: "PURPLE", cls: "red" },
      { key: "black", label: "BLACK", cls: "black" },
      { key: "odd", label: "ODD", cls: "" },
      { key: "high", label: "19-36", cls: "" }
    ];
    OUTSIDE_BETS.forEach(function(bet){
      const cell = document.createElement("div");
      cell.className = "bt-outside-cell" + (bet.cls ? " " + bet.cls : "");
      cell.textContent = bet.label;
      cell.dataset.bet = bet.key;
      outsideEl.appendChild(cell);
    });

    // Chip selector - different denominations, each a different color, like a real tray
    const CHIP_VALUES = [
      { value: 10,   cls: "chip-10"   },
      { value: 25,   cls: "chip-25"   },
      { value: 50,   cls: "chip-50"   },
      { value: 100,  cls: "chip-100"  },
      { value: 200,  cls: "chip-200"  },
      { value: 500,  cls: "chip-500"  },
      { value: 1000, cls: "chip-1000" }
    ];
    let currentBetValue = 50;
    const chipButtons = [];
    CHIP_VALUES.forEach(function(chip){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn " + chip.cls + (chip.value === currentBetValue ? " active" : "");
      btn.textContent = chip.value >= 1000 ? (chip.value / 1000) + "k" : chip.value;
      btn.addEventListener("click", function(){
        currentBetValue = chip.value;
        currentChipLabel.textContent = currentBetValue.toLocaleString("en-US");
        chipButtons.forEach(function(b){ b.classList.remove("active"); });
        btn.classList.add("active");
        const selectedCell = allCells.find(function(c){ return c.classList.contains("selected"); });
        if(selectedCell) placeChip(selectedCell);
      });
      chipSelectEl.appendChild(btn);
      chipButtons.push(btn);
    });

    let selectedBet = null; // e.g. "red" or "number:17"
    const allCells = Array.from(numbersEl.querySelectorAll(".bt-cell")).concat(Array.from(outsideEl.querySelectorAll(".bt-outside-cell"))).concat(Array.from(dozensEl.querySelectorAll(".bt-outside-cell")));

    function clearChips(){
      allCells.forEach(function(c){
        const chip = c.querySelector(".bet-chip");
        if(chip) chip.remove();
      });
    }
    function placeChip(cell){
      clearChips();
      const amount = currentBetValue;
      const chip = document.createElement("div");
      chip.className = "bet-chip";
      chip.textContent = amount >= 1000 ? Math.round(amount / 1000) + "k" : amount;
      cell.appendChild(chip);
    }

    function payoutLabelFor(betKey){
      if(betKey.indexOf("number:") === 0) return " (35:1)";
      if(betKey.indexOf("col") === 0 || betKey.indexOf("dozen") === 0) return " (2:1)";
      return " (1:1)";
    }

    function selectBet(cell){
      allCells.forEach(function(c){ c.classList.remove("selected"); });
      cell.classList.add("selected");
      selectedBet = cell.dataset.bet;
      selectedLabel.textContent = "Betting on: " + cell.textContent.trim() + payoutLabelFor(selectedBet);
      placeChip(cell);
    }
    allCells.forEach(function(cell){
      cell.addEventListener("click", function(){
        if(spinBtn.disabled) return;
        selectBet(cell);
      });
    });

    let currentRotation = 0;
    let currentBallRotation = 0;

    spinBtn.addEventListener("click", function(){
      const bet = currentBetValue;
      const chips = getChips();
      if(!selectedBet){ messageEl.textContent = "Pick a number or outside bet on the table first."; return; }
      if(bet > chips){ messageEl.textContent = "You don't have enough chips for that bet."; return; }

      spinBtn.disabled = true;
      resultEl.className = "roulette-result";
      resultEl.textContent = "...";
      messageEl.textContent = "Spinning...";

      const outcome = Math.floor(Math.random() * 37); // 0-36
      const color = colorOf(outcome);
      const wheelIndex = WHEEL_ORDER.indexOf(outcome);
      const segCenter = wheelIndex * SEG_ANGLE + SEG_ANGLE / 2;

      // Spin several extra full turns, landing the winning segment at the top
      const extraSpins = 6 + Math.floor(Math.random() * 3);
      const targetWithinTurn = (360 - segCenter) % 360;
      currentRotation += extraSpins * 360 + ((targetWithinTurn - (currentRotation % 360)) + 360) % 360;

      // Ball spins the opposite direction, but always settles back at the top -
      // the same spot the wheel just placed the winning number, so the ball
      // visually lands right on it.
      const ballExtraSpins = 8 + Math.floor(Math.random() * 3);
      currentBallRotation -= ballExtraSpins * 360;

      wheelEl.style.transform = "rotate(" + currentRotation + "deg)";
      ballTrackEl.style.transition = "transform 4s cubic-bezier(.12,.7,.1,1)";
      ballTrackEl.style.transform = "rotate(" + currentBallRotation + "deg)";

      setTimeout(function(){
        resultEl.textContent = outcome;
        resultEl.classList.add(color);

        let won = false;
        let multiplier = 1;
        if(selectedBet.indexOf("number:") === 0){
          const target = parseInt(selectedBet.split(":")[1], 10);
          if(target === outcome){ won = true; multiplier = 35; }
        }else if(selectedBet === "red" && color === "red") won = true;
        else if(selectedBet === "black" && color === "black") won = true;
        else if(selectedBet === "odd" && outcome !== 0 && outcome % 2 === 1) won = true;
        else if(selectedBet === "even" && outcome !== 0 && outcome % 2 === 0) won = true;
        else if(selectedBet === "low" && outcome >= 1 && outcome <= 18) won = true;
        else if(selectedBet === "high" && outcome >= 19 && outcome <= 36) won = true;
        else if(selectedBet === "dozen1" && outcome >= 1 && outcome <= 12){ won = true; multiplier = 2; }
        else if(selectedBet === "dozen2" && outcome >= 13 && outcome <= 24){ won = true; multiplier = 2; }
        else if(selectedBet === "dozen3" && outcome >= 25 && outcome <= 36){ won = true; multiplier = 2; }
        else if(selectedBet === "col1" && outcome !== 0 && outcome % 3 === 0){ won = true; multiplier = 2; }
        else if(selectedBet === "col2" && outcome !== 0 && outcome % 3 === 2){ won = true; multiplier = 2; }
        else if(selectedBet === "col3" && outcome !== 0 && outcome % 3 === 1){ won = true; multiplier = 2; }

        let newChips = chips;
        if(won){
          const winnings = bet * multiplier;
          newChips += winnings;
          messageEl.textContent = outcome + " (" + color.toUpperCase() + ") - you win " + winnings.toLocaleString("en-US") + " chips!";
        }else{
          newChips -= bet;
          messageEl.textContent = outcome + " (" + color.toUpperCase() + ") - no match. -" + bet.toLocaleString("en-US") + " chips.";
        }
        setChips(Math.max(newChips, 0));
        spinBtn.disabled = false;
      }, 4100);
    });
  })();
})();
