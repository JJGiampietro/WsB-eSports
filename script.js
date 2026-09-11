const menu=document.querySelector(".menu");const nav=document.querySelector("#navlinks");menu.addEventListener("click",()=>nav.classList.toggle("open"));document.querySelectorAll("#navlinks a").forEach(a=>a.addEventListener("click",()=>nav.classList.remove("open")));

// Player bio modal
(function(){
  const modal=document.getElementById("bioModal");
  const photo=document.getElementById("bioPhoto");
  const role=document.getElementById("bioRole");
  const name=document.getElementById("bioName");
  const text=document.getElementById("bioText");
  const tiktok=document.getElementById("bioTiktok");
  const cards=document.querySelectorAll(".player-card");
  if(!modal||!cards.length)return;

  function openBio(card){
    const nameEl=card.querySelector(".player-name h3");
    const bg=card.style.getPropertyValue("--player-photo");
    photo.style.backgroundImage=bg||"none";
    role.textContent=card.dataset.role||"";
    name.textContent=nameEl?nameEl.textContent.trim():"";
    text.textContent=card.dataset.bio||"Bio coming soon.";
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
  let timer=null;
  const DELAY=7000;

  function show(i){
    index=(i+slides.length)%slides.length;
    slides.forEach((s,n)=>s.classList.toggle("active",n===index));
    dots.forEach((d,n)=>d.classList.toggle("active",n===index));
  }
  function next(){show(index+1);}
  function prev(){show(index-1);}
  function start(){timer=setInterval(next,DELAY);}
  function stop(){clearInterval(timer);}
  function restart(){stop();start();}

  nextBtn.addEventListener("click",()=>{next();restart();});
  prevBtn.addEventListener("click",()=>{prev();restart();});
  dots.forEach((d,n)=>d.addEventListener("click",()=>{show(n);restart();}));
  carousel.addEventListener("mouseenter",stop);
  carousel.addEventListener("mouseleave",start);

  show(0);
  start();
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

  // Tiny synthesized 8-bit-style blip — no external audio file needed.
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


// Live Fortnite stats via fortnite-api.com (Members page)
// NOTE: this key is publicly visible in this file since it's a static site with
// no backend to hide it behind. If it ever gets abused, generate a fresh one at
// dash.fortnite-api.com and swap it in below.
// Every card keeps its manually-entered numbers as a fallback — if a lookup fails
// (wrong username, rate limit, CORS block, etc.) the existing static stats just stay put.
(function(){
  const API_KEY = "0d88443d-d00a-42aa-b4c2-77ec9bc5acd8";
  const cards = document.querySelectorAll("[data-fn-user]");
  if(!cards.length) return;

  // fortnite-api.com uses "epic" for PC/Epic accounts rather than "pc"
  const PLATFORM_MAP = { pc: "epic", epic: "epic", xbl: "xbl", psn: "psn" };

  function fmtInt(n){
    return Math.round(n).toLocaleString("en-US");
  }

  function pickStats(json){
    // Defensive parsing in case the response shape shifts.
    try{
      const overall = json.data.stats.all.overall;
      if(overall){
        const winRateRaw = parseFloat(overall.winRate);
        return {
          kd: parseFloat(overall.kd),
          winrate: winRateRaw <= 1 ? winRateRaw*100 : winRateRaw,
          wins: parseFloat(overall.wins),
          kills: parseFloat(overall.kills),
          matches: parseFloat(overall.matches)
        };
      }
    }catch(e){}
    return null;
  }

  function applyStats(card, stats){
    const map = {
      kd: v => v.toFixed(2),
      winrate: v => v.toFixed(1) + "%",
      wins: v => fmtInt(v),
      kills: v => fmtInt(v),
      matches: v => fmtInt(v)
    };
    Object.keys(map).forEach(function(key){
      if(stats[key]===undefined || isNaN(stats[key])) return;
      const el = card.querySelector('[data-stat="'+key+'"]');
      if(el) el.textContent = map[key](stats[key]);
    });
  }

  async function updateCard(card){
    const user = card.getAttribute("data-fn-user");
    const rawPlatform = card.getAttribute("data-fn-platform") || "pc";
    const accountType = PLATFORM_MAP[rawPlatform] || "epic";
    try{
      const url = "https://fortnite-api.com/v2/stats/br/v2?name="
        + encodeURIComponent(user) + "&accountType=" + accountType;
      const res = await fetch(url, { headers: { "Authorization": API_KEY } });
      if(!res.ok) return; // leave static fallback numbers as-is
      const json = await res.json();
      const stats = pickStats(json);
      if(stats) applyStats(card, stats);
    }catch(e){
      // network error, CORS block, etc. — fallback numbers already in the HTML stay put
    }
  }

  // Stagger requests to be a polite, well-behaved API consumer
  cards.forEach(function(card, i){
    setTimeout(function(){ updateCard(card); }, i*1200);
  });
})();


// Spooky Surprise theme toggle — persists across pages via localStorage
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


// Leaderboards page — reads the JSON snapshots written weekly by GitHub Actions
(function(){
  const weeklyGrid = document.getElementById("lbWeeklyGrid");
  const lifetimeGrid = document.getElementById("lbLifetimeGrid");
  const updatedNote = document.getElementById("lbUpdatedNote");
  if(!weeklyGrid || !lifetimeGrid) return;

  function fmtInt(n){
    return Math.round(n).toLocaleString("en-US");
  }

  function medalRank(i){
    return i + 1;
  }

  function buildCategory(title, rows, valueFmt, deltaLabel){
    if(!rows.length) return "";
    let html = '<div class="lb-category"><h3>' + title + "</h3>";
    rows.slice(0, 5).forEach(function(row, i){
      html += '<div class="lb-row">'
        + '<div class="lb-rank">' + medalRank(i) + "</div>"
        + '<div class="lb-name">' + row.name + "</div>"
        + '<div class="lb-value">' + valueFmt(row.value)
        + (deltaLabel ? '<span class="lb-delta">' + deltaLabel + "</span>" : "")
        + "</div></div>";
    });
    html += "</div>";
    return html;
  }

  function topBy(entries, key, n){
    return entries
      .filter(function(e){ return typeof e[key] === "number" && !isNaN(e[key]); })
      .sort(function(a,b){ return b[key] - a[key]; })
      .slice(0, n || 5)
      .map(function(e){ return { name: e.displayName, value: e[key] }; });
  }

  Promise.all([
    fetch("data/latest.json").then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }),
    fetch("data/previous.json").then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; })
  ]).then(function(results){
    const latest = results[0];
    const previous = results[1];

    if(!latest || !latest.players || !Object.keys(latest.players).length){
      // No snapshot yet — leave the "waiting on first snapshot" placeholders as-is.
      return;
    }

    if(latest.fetchedAt && updatedNote){
      const d = new Date(latest.fetchedAt);
      updatedNote.textContent = "Last updated " + d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " — pulled automatically, nobody has to type these in.";
    }

    // ---- Lifetime leaders (current totals from the latest snapshot) ----
    const lifetimeEntries = Object.values(latest.players);
    let lifetimeHtml = "";
    lifetimeHtml += buildCategory("Best K/D", topBy(lifetimeEntries, "kd"), function(v){ return v.toFixed(2); });
    lifetimeHtml += buildCategory("Most Kills (Lifetime)", topBy(lifetimeEntries, "kills"), fmtInt);
    lifetimeHtml += buildCategory("Most Wins (Lifetime)", topBy(lifetimeEntries, "wins"), fmtInt);
    lifetimeGrid.innerHTML = lifetimeHtml || lifetimeGrid.innerHTML;

    // ---- This week's leaders (delta between latest and previous snapshot) ----
    if(!previous || !previous.players || !Object.keys(previous.players).length){
      weeklyGrid.innerHTML = '<p class="lb-empty">This is the first snapshot on record, so there\'s nothing to compare it to yet. Weekly deltas will show up starting next Monday.</p>';
      return;
    }

    const deltaEntries = [];
    Object.keys(latest.players).forEach(function(id){
      const cur = latest.players[id];
      const prev = previous.players[id];
      if(!prev) return; // player is new since last snapshot, no delta yet
      const deltaKills = cur.kills - prev.kills;
      const deltaWins = cur.wins - prev.wins;
      const deltaMatches = cur.matches - prev.matches;
      if(deltaKills < 0 || deltaWins < 0 || deltaMatches < 0) return; // guard against a bad/reset read
      deltaEntries.push({
        displayName: cur.displayName,
        deltaKills: deltaKills,
        deltaWins: deltaWins,
        deltaMatches: deltaMatches
      });
    });

    let weeklyHtml = "";
    weeklyHtml += buildCategory("Most Kills This Week", topBy(deltaEntries, "deltaKills"), fmtInt);
    weeklyHtml += buildCategory("Most Wins This Week", topBy(deltaEntries, "deltaWins"), fmtInt);
    weeklyHtml += buildCategory("Most Matches Played This Week", topBy(deltaEntries, "deltaMatches"), fmtInt);

    weeklyGrid.innerHTML = weeklyHtml || '<p class="lb-empty">No week-over-week change detected yet.</p>';
  });
})();


// Live countdown timers (Announcements + Events pages)
(function(){
  const widgets = document.querySelectorAll("[data-countdown-target]");
  if(!widgets.length) return;

  function update(){
    widgets.forEach(function(widget){
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
