(() => {
  'use strict';

  const THEME_KEY='znaya-theme';
  function currentTheme(){return document.documentElement.dataset.theme==='dark'?'dark':'light';}
  function applyTheme(theme,{persist=true}={}){
    const next=theme==='dark'?'dark':'light';
    document.documentElement.dataset.theme=next;
    document.documentElement.style.colorScheme=next;
    if(persist){try{localStorage.setItem(THEME_KEY,next);}catch{}}
    const toggle=document.getElementById('themeToggle');
    if(toggle){const darkMode=next==='dark';toggle.setAttribute('aria-pressed',String(darkMode));toggle.setAttribute('aria-label',darkMode?'Включи светла тема':'Включи тъмна тема');toggle.title=darkMode?'Светла тема':'Тъмна тема';}
    const meta=document.getElementById('themeColorMeta');if(meta)meta.setAttribute('content',next==='dark'?'#0f1117':'#fafaff');
    document.querySelectorAll('.theme-brand-image[data-logo-light][data-logo-dark]').forEach(img=>{img.src=next==='dark'?img.dataset.logoDark:img.dataset.logoLight;});
  }
  function initTheme(){let saved='light';try{saved=localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}catch{}applyTheme(saved,{persist:false});}
  const STORE_KEY='biohim21-state-v2';
  const SUBJECTS=[
    {id:'biology',label:'Биология',color:'#4f9f7e'},
    {id:'chemistry',label:'Химия',color:'#5f82c9'},
    {id:'history-law',label:'История на държавата и правото',color:'#8a78b7'},
    {id:'theory-law',label:'Обща теория на правото',color:'#c28b58'},
    {id:'human-action',label:'Човешко действие (икономика)',color:'#6f8ea0'}
  ];
  const SUBJECT_MAP=Object.fromEntries(SUBJECTS.map(s=>[s.id,s]));
  SUBJECT_MAP.law=SUBJECT_MAP['theory-law'];
  const ALLOWED_TYPES=new Set(['mcq','open','yesno','combo','match']);
  const TYPE_LABELS={mcq:'Избор',open:'Отворен',yesno:'Да / Не',combo:'Комбиниран',match:'Свързване'};

  function defaultState(){return {deck:[],results:[],mistakes:{},streak:0,settings:{},deckLibrary:[],currentDeckId:null,currentDeckName:''};}
  function loadState(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
      return {...defaultState(),...raw,deck:Array.isArray(raw.deck)?raw.deck:[],results:Array.isArray(raw.results)?raw.results:[],mistakes:raw.mistakes&&typeof raw.mistakes==='object'?raw.mistakes:{},settings:raw.settings&&typeof raw.settings==='object'?raw.settings:{},deckLibrary:Array.isArray(raw.deckLibrary)?raw.deckLibrary:[]};
    }catch{return defaultState();}
  }
  let state=loadState();
  window.ZNAYA_STATE=state;
  function saveState(){
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state));window.ZNAYA_STATE=state;return true;}
    catch(err){console.error('ZNAYA storage error',err);toast('Браузърът не успя да запази данните. Освободи място и опитай отново.');return false;}
  }

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const subjectInfo=id=>SUBJECT_MAP[id]||{id,label:'Предмет',color:'#6366f1'};
  function formatDate(){const text=new Intl.DateTimeFormat('bg-BG',{weekday:'long',day:'numeric',month:'long'}).format(new Date());return text.charAt(0).toUpperCase()+text.slice(1);}
  function deckDate(deck){const t=Date.parse(deck?.updatedAt||deck?.createdAt||'');return Number.isFinite(t)?t:0;}
  function deckMetrics(deck,currentState){
    const cards=Array.isArray(deck?.cards)?deck.cards:[], ids=new Set(cards.map(c=>String(c.id||'')));
    const attempts=(currentState.results||[]).filter(r=>ids.has(String(r.id||'')));
    const accuracy=attempts.length?Math.round(attempts.filter(r=>r.ok).length/attempts.length*100):0;
    const reviewed=new Set(attempts.map(r=>String(r.id||'')));
    const mastered=cards.length?Math.round(cards.filter(c=>reviewed.has(String(c.id||''))&&!(currentState.mistakes?.[c.id]>0)).length/cards.length*100):0;
    return {cards:cards.length,attempts:attempts.length,accuracy,mastered};
  }

  function ensureLegacyLibrary(){
    state=loadState();
    if((state.deckLibrary||[]).length||!(state.deck||[]).length)return;
    const now=new Date().toISOString(), id=String(state.currentDeckId||`legacy-${Date.now()}`);
    state.deckLibrary=[{id,name:state.currentDeckName||'Моят комплект',subject:(state.deck[0]?.subject||'biology'),source:'BioHim 4.4',studyMode:state.deck[0]?.studyMode||'cards',createdAt:now,updatedAt:now,cards:JSON.parse(JSON.stringify(state.deck))}];
    state.currentDeckId=id;saveState();
  }
  function findDeck(id){return (state.deckLibrary||[]).find(d=>String(d.id)===String(id))||null;}
  function formatUpdated(deck){const t=deckDate(deck);if(!t)return 'Без дата';try{return new Intl.DateTimeFormat('bg-BG',{day:'numeric',month:'short',year:'numeric'}).format(new Date(t));}catch{return 'Без дата';}}

  let toastTimer;
  function toast(message){const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
  window.toast=toast;

  function renderSubjects(){
    const wrap=document.getElementById('subjectSuggestions');
    wrap.innerHTML=SUBJECTS.map(s=>`<button class="subject-chip" type="button" data-subject="${esc(s.id)}"><span class="subject-dot" style="--subject-color:${s.color}"></span>${esc(s.label)}</button>`).join('');
    wrap.querySelectorAll('[data-subject]').forEach(btn=>btn.addEventListener('click',()=>{
      createState.subject=btn.dataset.subject;
      wrap.querySelectorAll('[data-subject]').forEach(x=>x.classList.toggle('chosen',x===btn));
      document.getElementById('topicInput')?.focus();
      toast(`Предмет: ${subjectInfo(btn.dataset.subject).label}`);
    }));
  }

  function renderHome(){
    state=loadState();window.ZNAYA_STATE=state;
    const decks=[...(state.deckLibrary||[])].sort((a,b)=>deckDate(b)-deckDate(a));
    const currentId=String(state.currentDeckId||'');
    if(currentId)decks.sort((a,b)=>String(a.id)===currentId?-1:String(b.id)===currentId?1:deckDate(b)-deckDate(a));
    const recent=decks.slice(0,3),grid=document.getElementById('continueGrid');
    if(!recent.length){
      grid.innerHTML=`<div class="empty-card"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 8h8M8 12h6"/></svg></div><strong>Библиотеката ти е празна</strong>Създай първия си комплект от тема, PDF или снимки.</div>`;
    }else{
      grid.innerHTML=recent.map(deck=>{const s=subjectInfo(deck.subject),m=deckMetrics(deck,state);return `<article class="deck-card" data-deck-id="${esc(deck.id)}"><div class="deck-subject"><span class="subject-dot" style="--subject-color:${s.color}"></span>${esc(s.label)}</div><div class="deck-title">${esc(deck.name||'Без име')}</div><div class="deck-meta">${m.cards} карти${m.attempts?` · ${m.accuracy}% точност`:''}</div><div class="deck-bottom"><div class="progress-track"><div class="progress-fill" style="width:${m.mastered}%"></div></div><div class="progress-row"><span>${m.mastered}% овладяно</span><span>Продължи →</span></div></div></article>`}).join('');
      grid.querySelectorAll('.deck-card').forEach(card=>card.addEventListener('click',()=>openDeckDetail(card.dataset.deckId)));
    }
    const results=state.results||[], accuracy=results.length?Math.round(results.filter(r=>r.ok).length/results.length*100):null;
    document.getElementById('accuracyStat').textContent=accuracy===null?'—':`${accuracy}%`;
    document.getElementById('decksStat').textContent=String(decks.length);
    const dueCards=reviewQueue('all',state);
    document.getElementById('reviewTitle').textContent=dueCards.length?`${dueCards.length} ${dueCards.length===1?'карта чака':'карти чакат'} преговор`:'Няма карти за преговор';
    document.getElementById('reviewText').textContent=dueCards.length?'Трудните карти са подредени по приоритет и са готови за кратка сесия.':'Когато отбележиш трудни карти, ZNAYA ще ги събира тук.';
  }


  function collectCards(currentState=state){
    const rows=[];
    for(const deck of currentState.deckLibrary||[]){
      for(const card of deck.cards||[])rows.push({card,deck,subject:subjectInfo(deck.subject)});
    }
    return rows;
  }
  function lastAttemptByCard(currentState=state){
    const out={};
    for(const r of currentState.results||[]){
      const id=String(r.id||''),t=Date.parse(r.at||'')||0;
      if(!out[id]||t>out[id].time)out[id]={...r,time:t};
    }
    return out;
  }
  function reviewQueue(subject='all',currentState=state){
    const last=lastAttemptByCard(currentState);
    return collectCards(currentState).filter(({card,deck})=>{
      const due=Number(currentState.mistakes?.[card.id]||0)>0;
      return due&&(subject==='all'||deck.subject===subject);
    }).map(row=>({
      ...row,
      mistakes:Number(currentState.mistakes?.[row.card.id]||0),
      lastAt:last[String(row.card.id||'')]?.time||0
    })).sort((a,b)=>b.mistakes-a.mistakes||a.lastAt-b.lastAt||String(a.card.q||'').localeCompare(String(b.card.q||''),'bg'));
  }
  function subjectMetrics(subjectId,currentState=state){
    const decks=(currentState.deckLibrary||[]).filter(d=>d.subject===subjectId),cards=decks.flatMap(d=>d.cards||[]),ids=new Set(cards.map(c=>String(c.id||'')));
    const attempts=(currentState.results||[]).filter(r=>ids.has(String(r.id||''))),reviewed=new Set(attempts.map(r=>String(r.id||'')));
    const accuracy=attempts.length?Math.round(attempts.filter(r=>r.ok).length/attempts.length*100):null;
    const mastered=cards.length?Math.round(cards.filter(c=>reviewed.has(String(c.id||''))&&Number(currentState.mistakes?.[c.id]||0)<=0).length/cards.length*100):0;
    const due=cards.filter(c=>Number(currentState.mistakes?.[c.id]||0)>0).length;
    return {subject:subjectInfo(subjectId),decks:decks.length,cards:cards.length,attempts:attempts.length,accuracy,mastered,due};
  }
  function attemptAgeLabel(ts){
    if(!ts)return 'няма предишен опит';
    const now=new Date(),d=new Date(ts),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=new Date(d.getFullYear(),d.getMonth(),d.getDate()),diff=Math.round((today-day)/86400000);
    if(diff<=0)return 'упражнявана днес';if(diff===1)return 'упражнявана вчера';if(diff<7)return `преди ${diff} дни`;
    return new Intl.DateTimeFormat('bg-BG',{day:'numeric',month:'short'}).format(d);
  }
  function renderReview(){
    state=loadState();const queue=reviewQueue('all',state),high=queue.filter(x=>x.mistakes>=2),subjectIds=new Set(queue.map(x=>x.deck.subject));
    const count=document.getElementById('reviewDueCount'),desc=document.getElementById('reviewDueDescription'),start=document.getElementById('reviewStartAll');
    if(!count)return;
    count.textContent=queue.length?`${queue.length} ${queue.length===1?'карта':'карти'}`:'Всичко е преговорено';
    desc.textContent=queue.length?'Започни с най-трудните карти. При правилен отговор приоритетът им постепенно намалява.':'В момента няма карти с натрупани грешки. Продължи да учиш и ZNAYA ще обновява тази опашка.';
    start.disabled=!queue.length;start.textContent=queue.length?'Започни преговор →':'Няма карти за преговор';
    document.getElementById('reviewHighCount').textContent=String(high.length);document.getElementById('reviewSubjectCount').textContent=String(subjectIds.size);
    const priority=document.getElementById('reviewPriorityList');
    priority.innerHTML=queue.length?queue.slice(0,6).map((x,i)=>`<article class="priority-row"><div class="priority-rank">${i+1}</div><div class="priority-copy"><div class="priority-meta"><span class="subject-dot" style="--subject-color:${x.subject.color}"></span>${esc(x.subject.label)} · ${esc(x.deck.name||'Без име')}</div><strong>${esc(x.card.q||'Без въпрос')}</strong><small>${x.mistakes>=2?'Висок приоритет':'За преговор'} · ${x.mistakes} ${x.mistakes===1?'натрупана грешка':'натрупани грешки'} · ${esc(attemptAgeLabel(x.lastAt))}</small></div><button class="priority-open" type="button" data-review-open="${esc(x.deck.id)}">Отвори</button></article>`).join(''):`<div class="insight-empty"><div class="empty-icon">✓</div><strong>Няма трудни карти</strong><span>Когато отбележиш „Не знаех“ или сгрешиш интерактивна карта, тя ще се появи тук.</span></div>`;
    const grid=document.getElementById('reviewSubjectGrid'),metrics=SUBJECTS.map(s=>subjectMetrics(s.id,state)).filter(m=>m.due>0).sort((a,b)=>b.due-a.due);
    grid.innerHTML=metrics.length?metrics.map(m=>`<article class="review-subject-card"><div class="review-subject-head"><span class="subject-dot large" style="--subject-color:${m.subject.color}"></span><div><strong>${esc(m.subject.label)}</strong><span>${m.due} ${m.due===1?'карта':'карти'} за преговор</span></div></div><div class="review-subject-progress"><span>${m.accuracy===null?'Без резултати':`${m.accuracy}% обща точност`}</span><span>${m.mastered}% овладяно</span></div><button type="button" data-review-subject="${esc(m.subject.id)}">Преговори предмета →</button></article>`).join(''):`<div class="insight-empty compact"><strong>Няма предмети с чакащ преговор</strong><span>Тук ще се появят автоматично, когато има трудни карти.</span></div>`;
  }
  function renderSubjectsPage(){
    state=loadState();const metrics=SUBJECTS.map(s=>subjectMetrics(s.id,state)),active=metrics.filter(m=>m.decks||m.cards),totalDecks=(state.deckLibrary||[]).length,totalCards=collectCards(state).length,totalDue=reviewQueue('all',state).length;
    const summary=document.getElementById('subjectPageSummary');if(!summary)return;
    summary.innerHTML=`<div><strong>${active.length}</strong><span>активни предмета</span></div><div><strong>${totalDecks}</strong><span>учебни комплекта</span></div><div><strong>${totalCards}</strong><span>карти общо</span></div><div><strong>${totalDue}</strong><span>за преговор</span></div>`;
    document.getElementById('subjectsDashboard').innerHTML=metrics.map(m=>`<article class="subject-dashboard-card"><div class="subject-dashboard-top"><span class="subject-dot xlarge" style="--subject-color:${m.subject.color}"></span><div><h2>${esc(m.subject.label)}</h2><p>${m.decks} ${m.decks===1?'комплект':'комплекта'} · ${m.cards} ${m.cards===1?'карта':'карти'}</p></div></div><div class="subject-dashboard-stats"><div><strong>${m.accuracy===null?'—':`${m.accuracy}%`}</strong><span>точност</span></div><div><strong>${m.mastered}%</strong><span>овладяно</span></div><div><strong>${m.due}</strong><span>за преговор</span></div></div><div class="progress-track"><div class="progress-fill" style="width:${m.mastered}%"></div></div><div class="subject-dashboard-actions"><button type="button" data-subject-library="${esc(m.subject.id)}">Виж комплектите</button><button type="button" class="${m.due?'accent':''}" data-subject-review="${esc(m.subject.id)}" ${m.due?'':'disabled'}>${m.due?'Преговори':'Няма преговор'}</button></div></article>`).join('');
  }
  function localDayKey(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function currentStudyStreak(currentState=state){const days=new Set((currentState.results||[]).map(r=>localDayKey(r.at)).filter(Boolean));let d=new Date(),n=0;while(days.has(localDayKey(d))){n++;d.setDate(d.getDate()-1);}return n;}
  function activityDays(currentState=state,count=7){
    const tally={};for(const r of currentState.results||[]){const k=localDayKey(r.at);if(k)tally[k]=(tally[k]||0)+1;}
    const rows=[];for(let i=count-1;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const k=localDayKey(d);rows.push({key:k,label:new Intl.DateTimeFormat('bg-BG',{weekday:'short'}).format(d).replace('.',''),count:tally[k]||0,isToday:i===0});}return rows;
  }
  function renderProgress(){
    state=loadState();const cards=collectCards(state),results=state.results||[],reviewed=new Set(results.map(r=>String(r.id||''))),mastered=cards.filter(({card})=>reviewed.has(String(card.id||''))&&Number(state.mistakes?.[card.id]||0)<=0).length,due=reviewQueue('all',state).length,accuracy=results.length?Math.round(results.filter(r=>r.ok).length/results.length*100):null,streak=currentStudyStreak(state);
    const kpis=document.getElementById('progressKpis');if(!kpis)return;
    kpis.innerHTML=`<article><span>Обща точност</span><strong>${accuracy===null?'—':`${accuracy}%`}</strong><small>${results.length?`${results.length} отговора общо`:'Започни учебна сесия'}</small></article><article><span>Овладени карти</span><strong>${mastered}</strong><small>от ${cards.length} карти</small></article><article><span>За преговор</span><strong>${due}</strong><small>${due?'трудни карти в опашката':'всичко е чисто'}</small></article><article><span>Текуща серия</span><strong>${streak}</strong><small>${streak===1?'ден':`${streak} дни`}</small></article>`;
    const days=activityDays(state,7),max=Math.max(1,...days.map(d=>d.count)),total=days.reduce((n,d)=>n+d.count,0);document.getElementById('activityTotal').textContent=`${total} ${total===1?'отговор':'отговора'}`;
    document.getElementById('activityChart').innerHTML=days.map(d=>`<div class="activity-day"><div class="activity-value">${d.count||''}</div><div class="activity-bar-wrap"><i class="activity-bar ${d.isToday?'today':''}" style="height:${d.count?Math.max(12,Math.round(d.count/max*100)):4}%"></i></div><span>${esc(d.label)}</span></div>`).join('');
    const metrics=SUBJECTS.map(s=>subjectMetrics(s.id,state)),withAttempts=metrics.filter(m=>m.attempts>0),strongest=[...withAttempts].sort((a,b)=>(b.accuracy??-1)-(a.accuracy??-1)||b.mastered-a.mastered)[0],needs=[...metrics].filter(m=>m.due>0).sort((a,b)=>b.due-a.due||(a.accuracy??101)-(b.accuracy??101))[0];
    const insight=document.getElementById('progressInsightCard');
    insight.innerHTML=results.length?`<span class="panel-eyebrow">Как се справяш</span><h2>${strongest?`Най-силен: ${esc(strongest.subject.label)}`:'Имаш първи резултати'}</h2><p>${strongest&&strongest.accuracy!==null?`Точността ти там е ${strongest.accuracy}% при ${strongest.attempts} отговора.`:'Продължи да учиш, за да видиш по-ясна картина.'}</p>${needs?`<div class="attention-callout"><span>Има нужда от внимание</span><strong>${esc(needs.subject.label)}</strong><small>${needs.due} ${needs.due===1?'карта чака':'карти чакат'} преговор</small><button type="button" data-progress-review="${esc(needs.subject.id)}">Преговори →</button></div>`:`<div class="attention-callout success"><span>Опашката е чиста</span><strong>Няма чакащ преговор</strong><small>Продължи със следващ комплект.</small></div>`}`:`<span class="panel-eyebrow">Как се справяш</span><h2>Още няма достатъчно данни</h2><p>След първата учебна сесия тук ще виждаш най-силния предмет и къде има нужда от повече работа.</p>`;
    document.getElementById('subjectProgressList').innerHTML=metrics.map(m=>`<article class="subject-progress-row"><div class="subject-progress-name"><span class="subject-dot" style="--subject-color:${m.subject.color}"></span><div><strong>${esc(m.subject.label)}</strong><span>${m.cards} ${m.cards===1?'карта':'карти'} · ${m.attempts} ${m.attempts===1?'отговор':'отговора'}</span></div></div><div class="subject-progress-meter"><div class="subject-progress-copy"><span>${m.mastered}% овладяно</span><span>${m.accuracy===null?'—':`${m.accuracy}% точност`}</span></div><div class="progress-track"><div class="progress-fill" style="width:${m.mastered}%"></div></div></div><div class="subject-progress-due ${m.due?'has-due':''}"><strong>${m.due}</strong><span>за преговор</span></div></article>`).join('');
  }


  const SETTINGS_DEFAULTS={defaultStudyMode:'cards',defaultCardCount:10,defaultDifficulty:'medium',rememberLastSubject:true,aiMode:'auto',puterModel:'openai/gpt-5.6-luna',backupProvider:'none',geminiModel:'gemini-3.8-flash',groqModel:'qwen/qwen3.8-27b'};
  const SESSION_AI_KEYS={gemini:'znaya-gemini-key',groq:'znaya-groq-key'};
  function effectiveSettings(){return {...SETTINGS_DEFAULTS,...(state.settings||{})};}
  function setSettingValue(id,value){const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!value;else el.value=String(value??'');}
  function sessionKeyPresent(provider){try{return !!sessionStorage.getItem(SESSION_AI_KEYS[provider]);}catch{return false;}}
  function updateAiKeyInputs(){for(const provider of ['gemini','groq']){const el=document.getElementById(`${provider}SessionKey`);if(el){el.value='';el.placeholder=sessionKeyPresent(provider)?'Ключът е запазен за тази сесия':'Постави ключ за тази сесия';}}}
  function storageBytes(){try{return new Blob([localStorage.getItem(STORE_KEY)||'']).size;}catch{return 0;}}
  function formatBytes(n){if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(2)} MB`;}
  const PUTER_CREDIT_DISPLAY_MAX=1000;
  function bgNumber(value,digits=1){return new Intl.NumberFormat('bg-BG',{maximumFractionDigits:digits,minimumFractionDigits:0}).format(value);}
  function setPuterCreditUI({value='Проверка…',meta='Месечен остатък',percent=0,stateClass='',title=''}){
    const card=document.getElementById('puterCreditCard'),valueEl=document.getElementById('puterCreditValue'),metaEl=document.getElementById('puterCreditMeta'),bar=document.getElementById('puterCreditBar');
    const mobile=document.getElementById('puterCreditMobile'),mobileValue=document.getElementById('puterCreditMobileValue');
    if(mobile&&mobileValue){mobileValue.textContent=value;mobile.classList.remove('low','empty','signed-out','unavailable');if(stateClass)mobile.classList.add(stateClass);mobile.title=title||meta||'Puter кредити';}
    if(!card||!valueEl||!metaEl||!bar)return;
    card.classList.remove('low','empty','signed-out','unavailable');if(stateClass)card.classList.add(stateClass);valueEl.textContent=value;metaEl.textContent=meta;bar.style.width=`${Math.max(0,Math.min(100,Number(percent)||0))}%`;card.title=title||`${value} · ${meta}`;card.setAttribute('aria-label',`Puter кредити: ${value}. ${meta}`);
  }
  async function refreshPuterCredits({interactive=false}={}){
    if(window.ZNAYA_PREVIEW_MODE){setPuterCreditUI({value:'805,8 / 1000',meta:'кредита остават',percent:80.58,title:'Preview на месечния Puter кредит'});return;}
    setPuterCreditUI({value:'Проверка…',meta:'Puter месечен кредит',percent:0});
    try{
      if(window.ZNAYAPuterReady)await window.ZNAYAPuterReady;
      if(!window.puter?.auth?.getMonthlyUsage){setPuterCreditUI({value:'Недостъпно',meta:'Puter не се зареди',percent:0,stateClass:'unavailable'});return;}
      if(!puter.auth.isSignedIn()){
        if(!interactive){setPuterCreditUI({value:'Вход в Puter',meta:'Натисни, за да видиш кредита',percent:0,stateClass:'signed-out'});return;}
        await puter.auth.signIn();
      }
      if(!puter.auth.isSignedIn()){setPuterCreditUI({value:'Вход в Puter',meta:'Натисни, за да видиш кредита',percent:0,stateClass:'signed-out'});return;}
      const usage=await puter.auth.getMonthlyUsage(), allowance=Number(usage?.allowanceInfo?.monthUsageAllowance), remaining=Number(usage?.allowanceInfo?.remaining);
      if(!Number.isFinite(allowance)||allowance<=0||!Number.isFinite(remaining)){setPuterCreditUI({value:'Няма данни',meta:'Puter не върна месечна квота',percent:0,stateClass:'unavailable'});return;}
      const ratio=Math.max(0,Math.min(1,remaining/allowance)), credits=ratio*PUTER_CREDIT_DISPLAY_MAX, percent=ratio*100;
      setPuterCreditUI({value:`${bgNumber(credits)} / ${PUTER_CREDIT_DISPLAY_MAX}`,meta:'кредита остават',percent,stateClass:percent<=0?'empty':percent<=15?'low':'',title:`Остават ${bgNumber(percent)}% от месечния Puter кредит`});
    }catch(err){
      const code=String(err?.error||err?.code||'');
      if(/auth_window_closed|cancel/i.test(code)||/затвор|отказ/i.test(String(err?.message||''))){setPuterCreditUI({value:'Вход в Puter',meta:'Натисни, за да видиш кредита',percent:0,stateClass:'signed-out'});return;}
      console.warn('ZNAYA Puter credit check failed',err);setPuterCreditUI({value:'Недостъпно',meta:'Провери интернет връзката',percent:0,stateClass:'unavailable'});
    }
  }
  window.ZNAYA_REFRESH_PUTER_CREDITS=()=>refreshPuterCredits();
  function renderStorageSummary(){const el=document.getElementById('storageSummary');if(!el)return;state=loadState();const cards=(state.deckLibrary||[]).reduce((n,d)=>n+(d.cards?.length||0),0);el.innerHTML=`<div><strong>${(state.deckLibrary||[]).length}</strong><span>комплекта</span></div><div><strong>${cards}</strong><span>карти</span></div><div><strong>${(state.results||[]).length}</strong><span>отговора</span></div><div><strong>${formatBytes(storageBytes())}</strong><span>локални данни</span></div>`;}
  function renderSettings(){
    state=loadState();window.ZNAYA_STATE=state;const s=effectiveSettings();
    setSettingValue('settingStudyMode',s.defaultStudyMode);setSettingValue('settingCardCount',s.defaultCardCount);setSettingValue('settingDifficulty',s.defaultDifficulty);setSettingValue('settingRememberSubject',s.rememberLastSubject!==false);
    setSettingValue('settingAiMode',['auto','puter','off'].includes(s.aiMode)?s.aiMode:'auto');setSettingValue('settingBackupProvider',s.backupProvider||'none');setSettingValue('settingPuterModel',s.puterModel);setSettingValue('settingGeminiModel',s.geminiModel);setSettingValue('settingGroqModel',s.groqModel);updateAiKeyInputs();renderStorageSummary();updateNetworkStatus();renderAiStatus();
  }
  function updateNetworkStatus(){const el=document.getElementById('networkStatus');if(el)el.textContent=navigator.onLine?'Онлайн':'Офлайн';const pwa=document.getElementById('pwaStatus');if(pwa)pwa.textContent=window.matchMedia?.('(display-mode: standalone)')?.matches?'Инсталирано PWA':'Web / готово за PWA';}
  function saveLearningSettings(){state=loadState();state.settings={...(state.settings||{}),defaultStudyMode:document.getElementById('settingStudyMode').value,defaultCardCount:Number(document.getElementById('settingCardCount').value)||10,defaultDifficulty:document.getElementById('settingDifficulty').value,rememberLastSubject:document.getElementById('settingRememberSubject').checked};saveState();const msg=document.getElementById('learningSettingsState');if(msg)msg.textContent='Запазено.';toast('Настройките за учене са запазени.');}
  function renderAiStatus(){const pill=document.getElementById('aiStatusPill');if(!pill)return;const s=effectiveSettings();if(s.aiMode==='off'){pill.textContent='AI изключен';pill.className='status-pill muted';return;}const backup=s.backupProvider!=='none'&&sessionKeyPresent(s.backupProvider);pill.textContent=backup?'Основен + резервен':'Основен AI';pill.className='status-pill ok';}
  function saveAiSettings(){state=loadState();state.settings={...(state.settings||{}),aiMode:document.getElementById('settingAiMode').value,backupProvider:document.getElementById('settingBackupProvider').value,puterModel:document.getElementById('settingPuterModel').value.trim()||SETTINGS_DEFAULTS.puterModel,geminiModel:document.getElementById('settingGeminiModel').value.trim()||SETTINGS_DEFAULTS.geminiModel,groqModel:document.getElementById('settingGroqModel').value.trim()||SETTINGS_DEFAULTS.groqModel};saveState();window.ZNAYA_STATE=state;renderAiStatus();const msg=document.getElementById('aiSettingsState');if(msg)msg.textContent='Запазено.';toast('ZNAYA AI настройките са запазени.');}
  function saveSessionKey(provider){const input=document.getElementById(`${provider}SessionKey`),value=String(input?.value||'').trim();if(!value){toast('Постави API ключ.');return;}try{sessionStorage.setItem(SESSION_AI_KEYS[provider],value);input.value='';updateAiKeyInputs();renderAiStatus();toast(`${provider==='gemini'?'Gemini':'Groq'} ключът е запазен само за тази сесия.`);}catch{toast('Браузърът не позволи сесийно съхранение.');}}
  function clearSessionKey(provider){try{sessionStorage.removeItem(SESSION_AI_KEYS[provider]);}catch{}updateAiKeyInputs();renderAiStatus();toast('Сесийният API ключ е изчистен.');}
  async function connectPuter(){const btn=document.getElementById('connectPuter');if(!window.ZNAYAAI?.ensureSignedIn){toast(window.ZNAYA_PREVIEW_MODE?'Puter входът не се стартира в preview режима.':'ZNAYA AI модулът не е готов.');return;}const old=btn.textContent;btn.disabled=true;btn.textContent='Свързване…';try{await window.ZNAYAAI.ensureSignedIn();toast('Puter е свързан.');btn.textContent='Свързан';refreshPuterCredits();}catch(err){toast(err?.message||'Свързването не успя.');btn.textContent=old;}finally{btn.disabled=false;}}
  function exportBackup(){state=loadState();const payload={format:'ZNAYA-backup',version:1,exportedAt:new Date().toISOString(),state};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ZNAYA-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup файлът е изтеглен.');}
  function validImportedState(raw){const candidate=raw?.format==='ZNAYA-backup'?raw.state:raw;if(!candidate||typeof candidate!=='object')return null;const next={...defaultState(),...candidate};next.deck=Array.isArray(next.deck)?next.deck:[];next.results=Array.isArray(next.results)?next.results:[];next.mistakes=next.mistakes&&typeof next.mistakes==='object'?next.mistakes:{};next.settings=next.settings&&typeof next.settings==='object'?next.settings:{};next.deckLibrary=Array.isArray(next.deckLibrary)?next.deckLibrary:[];return next;}
  async function importBackupFile(file){try{const text=await file.text(),raw=JSON.parse(text),next=validImportedState(raw);if(!next)throw new Error('Невалиден ZNAYA backup.');state=next;if(!saveState())return;renderSettings();renderHome();toast('Backup файлът е възстановен.');}catch(err){console.error(err);toast(err?.message||'Неуспешен импорт.');}}
  let pendingDataAction=null;
  function askDataAction(kind){pendingDataAction=kind;const b=document.getElementById('dataConfirmBackdrop'),title=document.getElementById('dataConfirmTitle'),text=document.getElementById('dataConfirmText'),accept=document.getElementById('dataConfirmAccept');if(kind==='progress'){title.textContent='Изчистване на напредъка';text.textContent='Комплектите ще останат, но резултатите, серията и картите за преговор ще бъдат нулирани.';accept.textContent='Изчисти напредъка';}else{title.textContent='Изтриване на всички данни';text.textContent='Това ще премахне всички комплекти, резултати и настройки от този браузър. Действието не може да бъде отменено.';accept.textContent='Изтрий всичко';}b.hidden=false;b.classList.add('open');b.setAttribute('aria-hidden','false');}
  function closeDataConfirm(){const b=document.getElementById('dataConfirmBackdrop');b.classList.remove('open');b.setAttribute('aria-hidden','true');b.hidden=true;pendingDataAction=null;}
  function executeDataAction(){const kind=pendingDataAction;if(!kind)return;if(kind==='progress'){state=loadState();state.results=[];state.mistakes={};state.streak=0;saveState();toast('Напредъкът е изчистен.');}else{state=defaultState();saveState();try{sessionStorage.removeItem(SESSION_AI_KEYS.gemini);sessionStorage.removeItem(SESSION_AI_KEYS.groq);}catch{}toast('Локалните данни са изтрити.');}closeDataConfirm();renderSettings();renderHome();}
  async function runDiagnostics(){const out=document.getElementById('diagnosticText'),btn=document.getElementById('runDiagnostics');btn.disabled=true;btn.textContent='Проверка…';const checks=[];checks.push(localStorage?'локално съхранение ✓':'локално съхранение ✕');checks.push(navigator.onLine?'мрежа ✓':'офлайн режим');if(window.ZNAYA_PREVIEW_MODE){checks.push('preview режим');out.textContent=`Готово: ${checks.join(' · ')}`;btn.disabled=false;btn.textContent='Провери';return;}try{const r=await fetch('/api/health',{cache:'no-store'});checks.push(r.ok?'сървър ✓':'сървър ✕');}catch{checks.push('сървър недостъпен');}checks.push('serviceWorker' in navigator?'PWA ✓':'PWA не се поддържа');out.textContent=`Готово: ${checks.join(' · ')}`;btn.disabled=false;btn.textContent='Провери';}
  function setView(name){
    const allowed=['home','create','library','study','review','subjects','progress','settings'];if(!allowed.includes(name))name='home';
    document.querySelectorAll('[data-view-panel]').forEach(p=>p.classList.toggle('active',p.dataset.viewPanel===name));
    document.querySelectorAll('[data-view]').forEach(a=>{const active=a.dataset.view===name;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(name==='home')renderHome();
    if(name==='create')renderCreate();
    if(name==='library')renderLibrary();
    if(name==='study')renderStudy();
    if(name==='review')renderReview();
    if(name==='subjects')renderSubjectsPage();
    if(name==='progress')renderProgress();
    if(name==='settings')renderSettings();
    window.scrollTo({top:0,behavior:'auto'});
  }
  function go(name){location.hash=name;setView(name);}


  const libraryState={query:'',subject:'all',sort:'recent',openDeckId:null,editDraft:null};
  function filteredDecks(){
    state=loadState();let decks=[...(state.deckLibrary||[])];const q=libraryState.query.trim().toLocaleLowerCase('bg-BG');
    if(libraryState.subject!=='all')decks=decks.filter(d=>d.subject===libraryState.subject);
    if(q)decks=decks.filter(d=>`${d.name||''} ${subjectInfo(d.subject).label}`.toLocaleLowerCase('bg-BG').includes(q));
    const sort=libraryState.sort;
    decks.sort((a,b)=>sort==='name'?String(a.name||'').localeCompare(String(b.name||''),'bg'):sort==='cards'?(b.cards?.length||0)-(a.cards?.length||0):sort==='progress'?deckMetrics(b,state).mastered-deckMetrics(a,state).mastered:deckDate(b)-deckDate(a));
    return decks;
  }
  function renderLibraryFilters(){
    const wrap=document.getElementById('libraryFilters');if(!wrap)return;
    const counts=Object.fromEntries(SUBJECTS.map(s=>[s.id,(state.deckLibrary||[]).filter(d=>d.subject===s.id).length]));
    wrap.innerHTML=`<button class="filter-chip ${libraryState.subject==='all'?'active':''}" type="button" data-library-subject="all">Всички · ${(state.deckLibrary||[]).length}</button>`+SUBJECTS.map(s=>`<button class="filter-chip ${libraryState.subject===s.id?'active':''}" type="button" data-library-subject="${esc(s.id)}"><span class="subject-dot" style="--subject-color:${s.color}"></span>${esc(s.label)} · ${counts[s.id]||0}</button>`).join('');
  }
  function libraryCard(deck){const s=subjectInfo(deck.subject),m=deckMetrics(deck,state);return `<article class="library-card" data-library-card="${esc(deck.id)}"><div class="library-card-top"><div class="library-card-subject"><span class="subject-dot" style="--subject-color:${s.color}"></span><span>${esc(s.label)}</span></div><button class="deck-menu-button" type="button" data-open-deck="${esc(deck.id)}" aria-label="Опции">•••</button></div><h3>${esc(deck.name||'Без име')}</h3><div class="library-card-meta">${m.cards} ${m.cards===1?'карта':'карти'} · обновен ${esc(formatUpdated(deck))}</div><div class="library-card-progress"><div class="library-card-progress-row"><span>${m.mastered}% овладяно</span><span>${m.attempts?`${m.accuracy}% точност`:'Не е започнат'}</span></div><div class="progress-track"><div class="progress-fill" style="width:${m.mastered}%"></div></div><div class="library-card-actions"><button class="study-small" type="button" data-study-deck="${esc(deck.id)}">Учи</button><button class="open-small" type="button" data-open-deck="${esc(deck.id)}">Отвори</button></div></div></article>`;}
  function renderLibrary(){
    state=loadState();renderLibraryFilters();const decks=filteredDecks(),grid=document.getElementById('libraryGrid');if(!grid)return;
    const total=(state.deckLibrary||[]).length;document.getElementById('libraryCount').textContent=`${decks.length} ${decks.length===1?'комплект':'комплекта'}`;
    document.getElementById('libraryResultHint').textContent=(libraryState.query||libraryState.subject!=='all')&&decks.length!==total?`от общо ${total}`:'';
    if(!decks.length){grid.innerHTML=`<div class="library-empty"><div><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div><strong>${total?'Няма съвпадения':'Библиотеката ти е празна'}</strong><p>${total?'Промени търсенето или избери друг предмет.':'Създай първия си учебен комплект от тема, PDF, текст или снимки.'}</p>${total?'':`<button class="primary-button" type="button" data-empty-create>＋ Създай комплект</button>`}</div></div>`;return;}
    grid.innerHTML=decks.map(libraryCard).join('');
  }
  function openDeckDetail(id){state=loadState();const deck=findDeck(id);if(!deck)return;libraryState.openDeckId=String(id);const s=subjectInfo(deck.subject),m=deckMetrics(deck,state),cards=deck.cards||[];
    document.getElementById('deckDetailSubject').innerHTML=`<span class="subject-dot" style="--subject-color:${s.color}"></span>${esc(s.label)}`;document.getElementById('deckDetailTitle').textContent=deck.name||'Без име';document.getElementById('deckDetailMeta').textContent=`Обновен ${formatUpdated(deck)} · ${deck.source||'ZNAYA'}`;
    document.getElementById('deckDetailStats').innerHTML=`<div class="detail-stat"><strong>${m.cards}</strong><span>карти</span></div><div class="detail-stat"><strong>${m.attempts?`${m.accuracy}%`:'—'}</strong><span>точност</span></div><div class="detail-stat"><strong>${m.mastered}%</strong><span>овладяно</span></div>`;
    document.getElementById('deckPreviewCount').textContent=`${cards.length} ${cards.length===1?'карта':'карти'}`;document.getElementById('deckPreviewList').innerHTML=cards.slice(0,7).map(c=>`<article class="deck-preview-card"><span class="type-pill">${esc(TYPE_LABELS[c.type]||'Карта')}</span>${hasQuestionCrop(c)?`<img class="deck-preview-crop" src="${c.crop}" alt="Изрязан въпрос">`:''}<strong>${esc(c.q||'Без въпрос')}</strong><p>${esc(correctText(c)||'Няма зададен отговор')}</p></article>`).join('')+(cards.length>7?`<div class="deck-preview-more">+ още ${cards.length-7} карти</div>`:'');
    const b=document.getElementById('deckBackdrop');b.hidden=false;b.classList.add('open');b.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  }
  function closeDeckDetail(){const b=document.getElementById('deckBackdrop');b.classList.remove('open');b.setAttribute('aria-hidden','true');b.hidden=true;document.body.style.overflow='';}
  function duplicateDeck(id){state=loadState();const src=findDeck(id);if(!src)return;const now=new Date().toISOString(),deckId=`deck-${Date.now()}`;const cards=(src.cards||[]).map((c,i)=>({...JSON.parse(JSON.stringify(c)),id:`c${Date.now()}-${i}`,createdAt:now}));const copy={...JSON.parse(JSON.stringify(src)),id:deckId,name:`Копие на ${src.name||'комплект'}`,createdAt:now,updatedAt:now,cards};state.deckLibrary.unshift(copy);cards.forEach(c=>state.mistakes[c.id]=0);saveState();closeDeckDetail();renderLibrary();renderHome();toast('Комплектът е дублиран.');}
  function askDeleteDeck(id){const deck=findDeck(id);if(!deck)return;libraryState.openDeckId=String(id);document.getElementById('confirmText').textContent=`„${deck.name||'Този комплект'}“ и статистиката му ще бъдат премахнати.`;const cb=document.getElementById('confirmBackdrop');cb.hidden=false;cb.classList.add('open');cb.setAttribute('aria-hidden','false');}
  function deleteOpenDeck(){state=loadState();const id=libraryState.openDeckId,deck=findDeck(id);if(!deck)return;const ids=new Set((deck.cards||[]).map(c=>String(c.id)));state.deckLibrary=(state.deckLibrary||[]).filter(d=>String(d.id)!==String(id));state.results=(state.results||[]).filter(r=>!ids.has(String(r.id)));ids.forEach(cid=>delete state.mistakes[cid]);if(String(state.currentDeckId||'')===String(id)){const next=state.deckLibrary[0];state.currentDeckId=next?.id||null;state.currentDeckName=next?.name||'';state.deck=next?JSON.parse(JSON.stringify(next.cards||[])):[];}saveState();{const cb=document.getElementById('confirmBackdrop');cb.classList.remove('open');cb.setAttribute('aria-hidden','true');cb.hidden=true;}closeDeckDetail();renderLibrary();renderHome();toast('Комплектът е изтрит.');}
  function editCardMarkup(c,i){const type=TYPE_LABELS[c.type]||'Карта';let ans;if(c.type==='mcq'){const opts=Array.isArray(c.o)?c.o:['','','',''];ans=`<div class="edit-mcq">${opts.map((o,j)=>`<label class="edit-option"><input type="radio" name="edit-a-${i}" value="${'ABCD'[j]}" data-edit-a="${i}" ${c.a==='ABCD'[j]?'checked':''}><span>${'ABCD'[j]}</span><input type="text" data-edit-option="${i}:${j}" value="${esc(o)}"></label>`).join('')}</div>`;}else if(c.type==='match'){const left=Array.isArray(c.matchLeft)?c.matchLeft:[],right=Array.isArray(c.matchRight)?c.matchRight:[],n=Math.max(2,left.length,right.length);ans=`<div class="match-editor-grid"><div><label class="mini-label">Лява колона</label>${Array.from({length:n},(_,j)=>`<label class="match-edit-row"><span>${String.fromCharCode(65+j)}</span><input type="text" data-edit-match-side="matchLeft" data-edit-match-item="${j}" data-edit-index="${i}" value="${esc(left[j]||'')}"></label>`).join('')}</div><div><label class="mini-label">Дясна колона</label>${Array.from({length:n},(_,j)=>`<label class="match-edit-row"><span>${j+1}</span><input type="text" data-edit-match-side="matchRight" data-edit-match-item="${j}" data-edit-index="${i}" value="${esc(right[j]||'')}"></label>`).join('')}</div></div><label class="mini-label">Правилно свързване</label><input class="match-map-input" type="text" data-edit-field="matchAnswer" data-edit-index="${i}" value="${esc(c.matchAnswer||'')}" placeholder="A:1; B:3; C:2">`;}else{const field=c.type==='combo'?'comboAnswer':'answer';const value=c[field]||'';ans=`<label class="mini-label">Правилен отговор</label><textarea rows="2" data-edit-field="${field}" data-edit-index="${i}">${esc(value)}</textarea>`;}const cropEdit=hasQuestionCrop(c)?`<div class="edit-crop"><span>Оригинален въпрос</span><img src="${c.crop}" alt="Изрязан въпрос"></div>`:'';return `<article class="edit-card" data-edit-card="${i}"><div class="edit-card-head"><span class="type-pill">${esc(type)}</span><button type="button" class="edit-remove" data-edit-remove="${i}">Премахни</button></div>${cropEdit}<label class="mini-label">${cropEdit?'Разпознат текст':'Въпрос'}</label><textarea rows="2" data-edit-field="q" data-edit-index="${i}">${esc(c.q||'')}</textarea>${ans}<label class="mini-label">Обяснение</label><textarea rows="2" data-edit-field="e" data-edit-index="${i}">${esc(c.e||'')}</textarea></article>`;}

  function renderEditCards(){const d=libraryState.editDraft;if(!d)return;document.getElementById('editCards').innerHTML=(d.cards||[]).map(editCardMarkup).join('')||'<div class="empty-card"><strong>Няма карти</strong>Остави поне една карта, за да запазиш комплекта.</div>';}
  function openDeckEditor(id){state=loadState();const deck=findDeck(id);if(!deck)return;libraryState.editDraft=JSON.parse(JSON.stringify(deck));document.getElementById('editDeckName').value=deck.name||'';document.getElementById('editDeckSubject').innerHTML=SUBJECTS.map(s=>`<option value="${esc(s.id)}" ${deck.subject===s.id?'selected':''}>${esc(s.label)}</option>`).join('');renderEditCards();closeDeckDetail();const b=document.getElementById('editBackdrop');b.hidden=false;b.classList.add('open');b.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
  function closeDeckEditor(){const b=document.getElementById('editBackdrop');b.classList.remove('open');b.setAttribute('aria-hidden','true');b.hidden=true;libraryState.editDraft=null;document.body.style.overflow='';}
  function saveDeckEdits(){const d=libraryState.editDraft;if(!d)return;if(!(d.cards||[]).length){toast('Комплектът трябва да има поне една карта.');return;}d.name=document.getElementById('editDeckName').value.trim()||'Без име';d.subject=document.getElementById('editDeckSubject').value;d.updatedAt=new Date().toISOString();d.cards.forEach((c,i)=>{c.number=i+1;c.subject=d.subject;});state=loadState();const idx=state.deckLibrary.findIndex(x=>String(x.id)===String(d.id));if(idx<0)return;state.deckLibrary[idx]=JSON.parse(JSON.stringify(d));if(String(state.currentDeckId||'')===String(d.id)){state.currentDeckName=d.name;state.deck=JSON.parse(JSON.stringify(d.cards));}saveState();closeDeckEditor();renderLibrary();renderHome();toast('Промените са запазени.');}

  const STUDY_TYPE_META={
    mcq:{label:'Избор от отговори',help:'Избери един отговор, след което провери решението.'},
    open:{label:'Отворен въпрос',help:'Формулирай отговора си, преди да покажеш решението.'},
    yesno:{label:'Да / Не',help:'Избери „Да“ или „Не“, след което провери решението.'},
    combo:{label:'Комбинация',help:'Прегледай твърденията и избери вярната комбинация.'},
    match:{label:'Свързване',help:'Свържи всеки елемент отляво с правилния елемент отдясно.'}
  };
  const studyState={deckId:null,index:0,revealed:false,selected:null,known:0,unknown:0,matchMap:{},matchOrder:[],activeMatch:null,matchChecked:false,matchResult:null,mode:'deck',returnView:'library',reviewSubject:'all',reviewCards:[]};
  function resetStudyCardState(){studyState.revealed=false;studyState.selected=null;studyState.matchMap={};studyState.matchOrder=[];studyState.activeMatch=null;studyState.matchChecked=false;studyState.matchResult=null;}
  function startStudy(id){state=loadState();const deck=findDeck(id);if(!deck||!(deck.cards||[]).length){toast('Този комплект няма карти.');return;}closeDeckDetail();studyState.mode='deck';studyState.returnView='library';studyState.reviewSubject='all';studyState.reviewCards=[];studyState.deckId=String(id);studyState.index=0;studyState.known=0;studyState.unknown=0;resetStudyCardState();state.currentDeckId=deck.id;state.currentDeckName=deck.name;state.deck=JSON.parse(JSON.stringify(deck.cards));saveState();go('study');}
  function startReview(subject='all'){state=loadState();const queue=reviewQueue(subject,state);if(!queue.length){toast('Няма карти за преговор в тази категория.');return;}closeDeckDetail();studyState.mode='review';studyState.returnView='review';studyState.reviewSubject=subject;studyState.reviewCards=queue.map(x=>({...JSON.parse(JSON.stringify(x.card)),_deckId:x.deck.id,_deckName:x.deck.name,_subject:x.deck.subject,_reviewWeight:x.mistakes}));studyState.deckId='__review__';studyState.index=0;studyState.known=0;studyState.unknown=0;resetStudyCardState();go('study');}
  function studySessionDeck(){if(studyState.mode==='review'){const cards=studyState.reviewCards||[];return {id:'__review__',name:studyState.reviewSubject==='all'?'Преговор':`Преговор · ${subjectInfo(studyState.reviewSubject).label}`,subject:cards[0]?._subject||studyState.reviewSubject,cards};}return findDeck(studyState.deckId||state.currentDeckId);}
  function currentStudyCard(){const deck=studySessionDeck();return deck?.cards?.[studyState.index]||null;}
  function cleanMatchItems(values){return (Array.isArray(values)?values:[]).map(v=>String(v??'').trim()).filter(Boolean).slice(0,8);}
  function shuffledMatchOrder(length){const order=Array.from({length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}return order;}
  function ensureMatchOrder(length){const current=Array.isArray(studyState.matchOrder)?studyState.matchOrder:[];const valid=current.length===length&&new Set(current).size===length&&current.every(i=>Number.isInteger(i)&&i>=0&&i<length);if(!valid)studyState.matchOrder=shuffledMatchOrder(length);return studyState.matchOrder;}
  function displayedMatchNumber(originalRightIndex,order){const pos=order.indexOf(originalRightIndex);return pos>=0?pos+1:originalRightIndex+1;}
  function parseMatchAnswer(answer,leftCount,rightCount){const out={};const text=String(answer||'');const re=/([A-H]|\d+)\s*(?::|=|→|->|-)\s*(\d+)/gi;let m;while((m=re.exec(text))){let li;if(/^[A-H]$/i.test(m[1]))li=m[1].toUpperCase().charCodeAt(0)-65;else li=Number(m[1])-1;const ri=Number(m[2])-1;if(li>=0&&li<leftCount&&ri>=0&&ri<rightCount)out[li]=ri;}return out;}
  function matchSolutionMarkup(c){
    const left=cleanMatchItems(c.matchLeft),right=cleanMatchItems(c.matchRight),expected=parseMatchAnswer(c.matchAnswer,left.length,right.length),order=ensureMatchOrder(right.length);
    if(!left.length||!right.length)return `<div class="study-match-fallback"><strong>Няма записани елементи за свързване.</strong><p>Тази стара карта съдържа само текстов отговор. Можеш да я редактираш от Библиотеката.</p></div>`;
    return `<div class="match-solution-list">${left.map((item,i)=>{const ri=expected[i],displayNo=Number.isInteger(ri)?displayedMatchNumber(ri,order):'?';return `<div class="match-solution-row"><span class="match-key">${String.fromCharCode(65+i)}</span><span>${esc(item)}</span><b>→</b><span class="match-key right">${displayNo}</span><span>${Number.isInteger(ri)&&right[ri]?esc(right[ri]):'Не е определено'}</span></div>`;}).join('')}</div>`;
  }
  function renderMatchBody(c){
    const left=cleanMatchItems(c.matchLeft),right=cleanMatchItems(c.matchRight);
    if(left.length<2||right.length<2||left.length!==right.length){return `<div class="study-match-fallback"><strong>Тази карта няма валиден набор от двойки.</strong><p>За „Свързване“ трябва да има еднакъв брой елементи в двете колони. Отвори комплекта от Библиотеката и редактирай картата.</p></div>${studyState.revealed?'':`<div class="study-reveal"><button class="primary-button" type="button" data-study-reveal>Покажи записания отговор</button></div>`}`;}
    const order=ensureMatchOrder(right.length),expected=parseMatchAnswer(c.matchAnswer,left.length,right.length),map=studyState.matchMap||{},used=new Map();Object.keys(map).forEach(k=>used.set(Number(map[k]),Number(k)));
    const leftHtml=left.map((item,i)=>{const paired=Number.isInteger(map[i]),ri=paired?Number(map[i]):null,displayNo=paired?displayedMatchNumber(ri,order):null;let status='';if(studyState.matchChecked&&paired&&Object.keys(expected).length)status=expected[i]===ri?' correct':' wrong';return `<button type="button" class="match-item match-left${studyState.activeMatch===i?' active':''}${paired?' paired':''}${status}" data-match-left="${i}"><span class="match-key">${String.fromCharCode(65+i)}</span><span class="match-copy">${esc(item)}</span>${paired?`<span class="match-pair-indicator">→ ${displayNo}</span>`:''}</button>`;}).join('');
    const rightHtml=order.map((originalIndex,displayIndex)=>{const item=right[originalIndex],li=used.has(originalIndex)?used.get(originalIndex):null;let status='';if(studyState.matchChecked&&li!==null&&Object.keys(expected).length)status=expected[li]===originalIndex?' correct':' wrong';return `<button type="button" class="match-item match-right${li!==null?' paired':''}${status}" data-match-right="${originalIndex}" ${studyState.matchChecked?'disabled':''}><span class="match-key right">${displayIndex+1}</span><span class="match-copy">${esc(item)}</span>${li!==null?`<span class="match-pair-indicator">${String.fromCharCode(65+li)} ↔</span>`:''}</button>`;}).join('');
    const pairedCount=Object.keys(map).length,complete=pairedCount>=left.length,expectedComplete=Object.keys(expected).length===left.length;
    let result='';if(studyState.matchChecked){const correctCount=left.reduce((n,_,i)=>n+(expected[i]===Number(map[i])?1:0),0);studyState.matchResult={correct:expectedComplete&&correctCount===left.length,correctCount,total:left.length};result=`<div class="match-result ${studyState.matchResult.correct?'success':'needs-work'}"><strong>${studyState.matchResult.correct?'Всички двойки са правилни.':`${correctCount} от ${left.length} двойки са правилни.`}</strong><span>${studyState.matchResult.correct?'Отлично свързване.':'Виж правилните връзки по-долу.'}</span></div>${matchSolutionMarkup(c)}<div class="study-auto-next"><button class="primary-button" type="button" data-study-match-next>Продължи</button></div>`;}
    return `<div class="match-toolbar"><span>${studyState.matchChecked?'Резултат':`${pairedCount} от ${left.length} свързани`}</span>${!studyState.matchChecked&&pairedCount?'<button type="button" data-match-reset>Нулирай</button>':''}</div><div class="match-board"><div class="match-column"><div class="match-column-title">Елементи</div>${leftHtml}</div><div class="match-column"><div class="match-column-title">Съответствия</div>${rightHtml}</div></div>${studyState.matchChecked?result:`<div class="match-check-row"><button class="primary-button" type="button" data-match-check ${complete?'':'disabled'}>${expectedComplete?'Провери свързването':'Покажи решението'}</button></div>`}`;
  }
  function renderStudy(){
    const root=document.getElementById('studyShell');if(!root)return;state=loadState();const deck=studySessionDeck();const cards=deck?.cards||[];
    if(!deck||!cards.length){root.innerHTML=`<div class="study-finish"><h2>${studyState.mode==='review'?'Няма карти за преговор':'Няма избран комплект'}</h2><p>${studyState.mode==='review'?'Опашката за преговор е празна.':'Отвори библиотеката и избери комплект, който искаш да учиш.'}</p><button class="primary-button" type="button" data-study-return>${studyState.mode==='review'?'Към преговора':'Към библиотеката'}</button></div>`;return;}
    if(studyState.index>=cards.length){const total=studyState.known+studyState.unknown,acc=total?Math.round(studyState.known/total*100):0,isReview=studyState.mode==='review';root.innerHTML=`<div class="study-finish"><div class="study-finish-mark">✓</div><h2>${isReview?'Преговорът е готов':'Сесията е готова'}</h2><p>${isReview?'Мина през всички избрани трудни карти. Опашката вече е обновена според резултатите ти.':`Мина през всички карти в „${esc(deck.name)}“. Резултатите вече са записани.`}</p><div class="study-finish-stats"><div class="finish-stat"><strong>${cards.length}</strong><span>карти</span></div><div class="finish-stat"><strong>${studyState.known}</strong><span>знаех</span></div><div class="finish-stat"><strong>${acc}%</strong><span>точност</span></div></div><div class="study-finish-actions"><button class="secondary-button" type="button" data-study-return>${isReview?'Към преговора':'Библиотека'}</button>${isReview?'<button class="primary-button" type="button" data-study-review-again>Преговори оставащите</button>':'<button class="primary-button" type="button" data-study-repeat>Учи отново</button>'}</div></div>`;return;}
    const c=cards[studyState.index],subjectId=c._subject||deck.subject,s=subjectInfo(subjectId),pct=Math.round(studyState.index/cards.length*100),meta=STUDY_TYPE_META[c.type]||{label:TYPE_LABELS[c.type]||'Карта',help:'Отговори на въпроса и провери решението.'};let body='',specialMatch=c.type==='match';
    if(c.type==='mcq'&&Array.isArray(c.o)){const cropped=hasQuestionCrop(c);body=`<div class="study-options ${cropped?'study-options-crop':''}">${c.o.map((o,i)=>`<button type="button" class="study-option ${studyState.selected==='ABCD'[i]?'selected':''}" data-study-option="${'ABCD'[i]}"><strong>${'ABCD'[i]}${cropped?'':'.'}</strong>${cropped?'':` ${esc(o)}`}</button>`).join('')}</div>`;}
    else if(c.type==='yesno'){body=`<div class="study-options study-options-two"><button type="button" class="study-option ${studyState.selected==='Да'?'selected':''}" data-study-option="Да"><strong>Да</strong></button><button type="button" class="study-option ${studyState.selected==='Не'?'selected':''}" data-study-option="Не"><strong>Не</strong></button></div>`;}
    else if(c.type==='combo'){const sub=Array.isArray(c.subpoints)?c.subpoints.filter(Boolean):[],opts=Array.isArray(c.comboOptions)?c.comboOptions.filter(Boolean):[];body=`${sub.length?`<div class="combo-statements">${sub.map((v,i)=>`<div><span>${i+1}</span>${esc(v)}</div>`).join('')}</div>`:''}${opts.length?`<div class="study-options combo-options">${opts.map(v=>`<button type="button" class="study-option ${studyState.selected===v?'selected':''}" data-study-option="${esc(v)}">${esc(v)} са верни</button>`).join('')}</div>`:''}`;}
    else if(c.type==='match'){body=renderMatchBody(c);}
    else{body='<div class="open-question-note">Помисли за отговора си. Когато си готов, покажи решението и се самооцени.</div>';}
    const genericAnswer=studyState.revealed?`<div class="study-answer"><span class="study-answer-label">Правилен отговор</span><strong>${esc(correctText(c)||'—')}</strong>${c.e?`<p>${esc(c.e)}</p>`:''}</div><div class="study-rate"><button class="rate-no" type="button" data-study-rate="no">Не знаех</button><button class="rate-yes" type="button" data-study-rate="yes">Знаех</button></div>`:`<div class="study-reveal"><button class="primary-button" type="button" data-study-reveal>Покажи отговора</button></div>`;
    const backLabel=studyState.mode==='review'?'← Преговор':'← Библиотека',deckContext=studyState.mode==='review'&&c._deckName?` · ${esc(c._deckName)}`:'';
    const questionFront=hasQuestionCrop(c)?`<div class="study-question-crop"><img src="${c.crop}" alt="Оригинален въпрос ${esc(c.sourceQuestionNumber||c.number||studyState.index+1)}"><div class="study-question-crop-caption"><span>Оригинален въпрос от материала</span>${c.sourceImageName?`<small>${esc(c.sourceImageName)}</small>`:''}</div></div>`:`<div class="study-question">${esc(c.q||'')}</div>`;
    root.innerHTML=`<div class="study-top"><button class="study-back" type="button" data-study-return>${backLabel}</button><div class="study-progress-copy"><strong>${esc(deck.name)}</strong>${studyState.index+1} от ${cards.length}</div></div><div class="study-progress-line"><i style="width:${pct}%"></i></div><article class="study-card"><div class="study-meta-row"><div class="study-subject"><span class="subject-dot" style="--subject-color:${s.color}"></span>${esc(s.label)}${deckContext}</div><div class="study-type-badge"><span>Вид въпрос</span><strong>${esc(meta.label)}</strong></div></div><div class="study-type-help">${esc(meta.help)}</div>${questionFront}${body}${specialMatch?(studyState.revealed?genericAnswer:''):genericAnswer}</article>`;
  }
  function rateStudy(ok){
    state=loadState();const sessionCard=currentStudyCard();if(!sessionCard)return;let deck,c;
    if(studyState.mode==='review'){deck=findDeck(sessionCard._deckId);c=deck?.cards?.find(x=>String(x.id)===String(sessionCard.id));}
    else{deck=findDeck(studyState.deckId);c=deck?.cards?.[studyState.index];}
    if(!deck||!c)return;state.results.push({id:c.id,ok:!!ok,at:new Date().toISOString(),deckId:deck.id});state.mistakes=state.mistakes||{};state.mistakes[c.id]=ok?Math.max(0,Number(state.mistakes[c.id]||0)-1):Number(state.mistakes[c.id]||0)+1;deck.updatedAt=new Date().toISOString();if(ok)studyState.known++;else studyState.unknown++;studyState.index++;resetStudyCardState();saveState();renderStudy();
  }

  const createState={step:1,sourceType:'topic',materialMode:'content',files:[],subject:null,studyMode:'cards',generated:[],busy:false};
  function resetCreate({keepSubject=true}={}){
    state=loadState();const prefs=effectiveSettings();
    const subject=keepSubject&&prefs.rememberLastSubject!==false?(createState.subject||prefs.lastSubject||null):null;
    createState.step=1;createState.sourceType='topic';createState.materialMode='content';createState.files=[];createState.subject=subject;createState.studyMode=['cards','test','mixed'].includes(prefs.defaultStudyMode)?prefs.defaultStudyMode:'cards';createState.generated=[];createState.busy=false;
    for(const id of ['createTopic','materialText','materialTopic','deckName']){const el=document.getElementById(id);if(el)el.value='';}
    const mf=document.getElementById('materialFiles');if(mf)mf.value='';
    const cc=document.getElementById('cardCount');if(cc)cc.value=String(prefs.defaultCardCount||10);
    const d=document.getElementById('difficulty');if(d)d.value=prefs.defaultDifficulty||'medium';
    renderFiles();setSourceType('topic');setMaterialMode('content');setStudyMode(createState.studyMode);setCreateStep(1);renderSubjectPicker();
  }
  function openCreate({source='topic',topic='',pickFiles=false}={}){
    resetCreate({keepSubject:true});
    setSourceType(source);
    if(topic)document.getElementById('createTopic').value=topic;
    go('create');
    if(pickFiles)setTimeout(()=>document.getElementById('materialFiles')?.click(),50);
  }
  function renderCreate(){renderSubjectPicker();renderFiles();renderCreateSummary();setCreateStep(createState.step);}
  function setCreateStep(step){
    createState.step=Math.max(1,Math.min(3,Number(step)||1));
    document.querySelectorAll('[data-create-step]').forEach(el=>el.classList.toggle('active',Number(el.dataset.createStep)===createState.step));
    document.querySelectorAll('[data-progress-step]').forEach(el=>{const n=Number(el.dataset.progressStep);el.classList.toggle('active',n===createState.step);el.classList.toggle('done',n<createState.step);});
    const titles={1:['От какво искаш да учиш?','Добави материал или напиши тема. Ще подготвим всичко останало.'],2:['Настрой учебния комплект','Само няколко избора. Техническата част остава зад кулисите.'],3:['Прегледай преди да запазиш','ZNAYA подготви комплекта. Провери го и го добави в библиотеката.']};
    document.getElementById('createTitle').textContent=titles[createState.step][0];document.getElementById('createSubtitle').textContent=titles[createState.step][1];
    updateCreateModeUI();
    renderCreateSummary();window.scrollTo({top:0,behavior:'auto'});
  }
  function isExerciseFlow(){return createState.sourceType==='material'&&createState.materialMode==='exercise';}
  function updateCreateModeUI(){
    const exercise=isExerciseFlow();
    const advanced=document.getElementById('advancedCreateSettings');
    const note=document.getElementById('exerciseSettingsNote');
    const textBlock=document.getElementById('materialTextBlock');
    if(advanced)advanced.classList.toggle('hidden',exercise);
    if(note)note.classList.toggle('hidden',!exercise||createState.step!==2);
    if(textBlock)textBlock.classList.toggle('hidden',exercise);
  }
  function setMaterialMode(mode){
    createState.materialMode=mode==='exercise'?'exercise':'content';
    document.querySelectorAll('[data-material-mode]').forEach(btn=>{const active=btn.dataset.materialMode===createState.materialMode;btn.classList.toggle('active',active);btn.setAttribute('aria-checked',String(active));});
    const hint=document.getElementById('materialModeHint');
    if(hint)hint.textContent=isExerciseFlow()?'ZNAYA ще създаде точно толкова въпроси, колкото има в качените задачи, и ще запази оригиналната им трудност.':'За учебен материал можеш да зададеш брой въпроси и трудност на следващата стъпка.';
    updateCreateModeUI();renderCreateSummary();
  }
  function setSourceType(type){
    createState.sourceType=type==='material'?'material':'topic';
    document.querySelectorAll('[data-source]').forEach(btn=>{const active=btn.dataset.source===createState.sourceType;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('[data-source-panel]').forEach(p=>p.classList.toggle('active',p.dataset.sourcePanel===createState.sourceType));
    updateCreateModeUI();renderCreateSummary();
  }
  function validateSource(){
    if(createState.sourceType==='topic'){
      if(!document.getElementById('createTopic').value.trim()){toast('Напиши тема, урок или глава.');document.getElementById('createTopic').focus();return false;}
    }else if(isExerciseFlow()){
      if(!createState.files.length){toast('Качи снимка или PDF с тестовите задачи.');return false;}
      if(!createState.files.some(isImageFile)){toast('За автоматично изрязване на въпросите качи поне една PNG, JPG или WEBP снимка.');return false;}
    }else{
      const text=document.getElementById('materialText').value.trim();
      if(!createState.files.length&&!text){toast('Качи материал или постави текст.');return false;}
    }
    return true;
  }
  function renderSubjectPicker(){
    const wrap=document.getElementById('createSubjectPicker');if(!wrap)return;
    wrap.innerHTML=SUBJECTS.map(s=>`<button type="button" class="subject-option ${createState.subject===s.id?'active':''}" data-create-subject="${s.id}"><span class="subject-dot" style="--subject-color:${s.color}"></span><strong>${esc(s.label)}</strong><i>✓</i></button>`).join('');
    wrap.querySelectorAll('[data-create-subject]').forEach(btn=>btn.addEventListener('click',()=>{createState.subject=btn.dataset.createSubject;state=loadState();if(effectiveSettings().rememberLastSubject!==false){state.settings={...(state.settings||{}),lastSubject:createState.subject};saveState();}renderSubjectPicker();renderCreateSummary();}));
  }
  function setStudyMode(mode){
    createState.studyMode=['cards','test','mixed'].includes(mode)?mode:'cards';
    document.querySelectorAll('[data-study-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.studyMode===createState.studyMode));renderCreateSummary();
  }
  function sourceTitle(){return createState.sourceType==='topic'?document.getElementById('createTopic').value.trim():(document.getElementById('materialTopic').value.trim()||createState.files[0]?.name?.replace(/\.[^.]+$/,'')||'Учебен материал');}
  function renderCreateSummary(){
    const box=document.getElementById('createSummary');if(!box)return;
    const subject=createState.subject?subjectInfo(createState.subject).label:'Не е избран';
    const mode={cards:'Карти',test:'Тест',mixed:'Смесено'}[createState.studyMode];
    const count=document.getElementById('cardCount')?.value||'10';
    const difficultyLabel={easy:'Лесна',medium:'Средна',hard:'Трудна',university:'Университетска'}[document.getElementById('difficulty')?.value||'medium'];
    const src=createState.sourceType==='topic'?'Тема':(isExerciseFlow()?`${createState.files.length||0} файла · тестови задачи`:`${createState.files.length?createState.files.length+' файла':'Поставен текст'}`);
    const sizing=isExerciseFlow()?`<div><dt>Брой въпроси</dt><dd>Определя се от теста</dd></div><div><dt>Трудност</dt><dd>Запазва се оригиналната</dd></div>`:`<div><dt>Брой</dt><dd>${esc(count)} карти</dd></div><div><dt>Трудност</dt><dd>${esc(difficultyLabel)}</dd></div>`;
    box.innerHTML=`<span class="summary-label">Твоят комплект</span><h3>${esc(sourceTitle()||'Нова тема')}</h3><dl><div><dt>Източник</dt><dd>${esc(src)}</dd></div><div><dt>Предмет</dt><dd>${esc(subject)}</dd></div><div><dt>Режим</dt><dd>${esc(mode)}</dd></div>${sizing}</dl><p>${isExerciseFlow()?'Всеки оригинален въпрос ще стане отделна карта с изображение на условието и всички опции под него.':'ZNAYA ще използва AI само за създаването. Комплектът ще остане в локалната ти библиотека.'}</p>`;
  }

  function validFile(file){return /^(image\/(png|jpeg|webp)|application\/pdf)$/i.test(file.type)||/\.(png|jpe?g|webp|pdf)$/i.test(file.name||'');}
  function addFiles(filesLike){
    const incoming=Array.from(filesLike||[]).filter(validFile), rejected=Array.from(filesLike||[]).filter(f=>!validFile(f));
    if(rejected.length)toast('Поддържат се PDF, PNG, JPG и WEBP.');
    const map=new Map(createState.files.map(f=>[`${f.name}|${f.size}|${f.lastModified}`,f]));incoming.forEach(f=>map.set(`${f.name}|${f.size}|${f.lastModified}`,f));
    let next=[...map.values()].slice(0,10);
    const tooLarge=next.find(f=>f.size>20*1024*1024);if(tooLarge){toast(`${tooLarge.name} е над 20 MB.`);next=next.filter(f=>f!==tooLarge);}
    while(next.reduce((sum,f)=>sum+f.size,0)>35*1024*1024)next.pop();
    createState.files=next;renderFiles();renderCreateSummary();
  }
  function renderFiles(){
    const wrap=document.getElementById('fileList');if(!wrap)return;
    if(!createState.files.length){wrap.innerHTML='';wrap.classList.remove('has-files');return;}
    wrap.classList.add('has-files');
    wrap.innerHTML=createState.files.map((f,i)=>`<div class="file-item"><span class="file-kind">${/pdf/i.test(f.type)||/\.pdf$/i.test(f.name)?'PDF':'IMG'}</span><span class="file-copy"><strong>${esc(f.name)}</strong><small>${(f.size/1024/1024).toFixed(f.size>1024*1024?1:2)} MB</small></span><button type="button" data-remove-file="${i}" aria-label="Премахни ${esc(f.name)}">×</button></div>`).join('');
    wrap.querySelectorAll('[data-remove-file]').forEach(btn=>btn.addEventListener('click',()=>{createState.files.splice(Number(btn.dataset.removeFile),1);renderFiles();renderCreateSummary();}));
  }

  const isImageFile=file=>!!file&&(/^image\//i.test(file.type||'')||/\.(?:png|jpe?g|webp)$/i.test(file.name||''));
  function ensureZnayaTesseract(){
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(window.__znayaTesseractPromise)return window.__znayaTesseractPromise;
    window.__znayaTesseractPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async=true;
      script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(new Error('OCR библиотеката не се инициализира.'));
      script.onerror=()=>reject(new Error('OCR библиотеката не може да се зареди.'));
      document.head.appendChild(script);
    });
    return window.__znayaTesseractPromise;
  }
  function cleanCropOcrLine(line){return String(line||'').replace(/\u00a0/g,' ').replace(/[|¦]/g,'I').replace(/[“”„]/g,'"').replace(/[‘’]/g,"'").replace(/\t/g,' ').replace(/\s+/g,' ').trim();}
  // Deliberately strict: a question number must begin the line. This prevents titles such as "ТЕМА 1." from being treated as question 1.
  function parseCropQuestionStart(line){
    const s=cleanCropOcrLine(line);
    let m=s.match(/^[^\p{L}\p{N}]{0,3}(?:въпрос\s*)?(\d{1,3})\s*[\.:)\-]\s*(.+)$/iu);
    if(!m)m=s.match(/^[^\p{L}\p{N}]{0,3}(?:въпрос\s*)?(\d{1,3})\s+(.+)$/iu);
    return m?{number:Number(m[1]),text:cleanCropOcrLine(m[2])}:null;
  }
  function groupCropWordsIntoLines(words){
    const items=(Array.isArray(words)?words:[]).filter(w=>String(w?.text||'').trim()).map(w=>({text:String(w.text||'').trim(),bbox:{x0:Number(w?.bbox?.x0??0),y0:Number(w?.bbox?.y0??0),x1:Number(w?.bbox?.x1??0),y1:Number(w?.bbox?.y1??0)}})).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
    const lines=[];
    for(const word of items){
      const cy=(word.bbox.y0+word.bbox.y1)/2,h=Math.max(10,word.bbox.y1-word.bbox.y0);let row=null;
      for(let j=lines.length-1;j>=0;j--){if(Math.abs(lines[j].cy-cy)<=Math.max(12,h*.75)){row=lines[j];break;}}
      if(!row){row={cy,words:[]};lines.push(row);}row.words.push(word);row.cy=(row.cy*(row.words.length-1)+cy)/row.words.length;
    }
    return lines.map(row=>{row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);const xs0=row.words.map(w=>w.bbox.x0),ys0=row.words.map(w=>w.bbox.y0),xs1=row.words.map(w=>w.bbox.x1),ys1=row.words.map(w=>w.bbox.y1);return {text:cleanCropOcrLine(row.words.map(w=>w.text).join(' ')),bbox:{x0:Math.min(...xs0),y0:Math.min(...ys0),x1:Math.max(...xs1),y1:Math.max(...ys1)}};}).filter(l=>l.text).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  }
  function loadCropImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=err=>{URL.revokeObjectURL(url);reject(err);};img.src=url;});}
  function cropRegionToDataUrl(img,block){
    const maxWidth=1500,scale=Math.min(1,maxWidth/block.w),w=Math.max(1,Math.round(block.w*scale)),h=Math.max(1,Math.round(block.h*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,block.x,block.y,block.w,block.h,0,0,w,h);return canvas.toDataURL('image/jpeg',.88);
  }
  function questionsForImage(allQuestions,file,fileIndex,totalFiles){
    const indexed=allQuestions.map((q,qi)=>({q,qi}));
    const exact=indexed.filter(({q})=>Number(q.sourceImageIndex)===fileIndex||String(q.sourceImageName||'')===String(file.name||''));
    if(exact.length)return exact;
    return totalFiles===1?indexed:[];
  }
  async function analyzeExerciseImage(file,fileIndex,expectedEntries){
    await ensureZnayaTesseract();
    const img=await loadCropImage(file),imageHeight=img.naturalHeight||img.height,imageWidth=img.naturalWidth||img.width,worker=await Tesseract.createWorker('bul+eng');
    try{
      await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
      const result=await worker.recognize(file),lines=groupCropWordsIntoLines(result?.data?.words||[]);
      // Real question numbers sit in the left part of the page. Reject centered headings and right-side page metadata.
      const candidates=[];
      lines.forEach((line,idx)=>{const header=parseCropQuestionStart(line.text);if(header&&line.bbox.x0<=imageWidth*.38)candidates.push({idx,number:header.number,bbox:line.bbox,text:line.text});});
      if(!candidates.length||!expectedEntries.length)return [];
      const expected=[...expectedEntries].sort((a,b)=>(Number(a.q.number)||a.qi+1)-(Number(b.q.number)||b.qi+1));
      const mapped=[];let afterIdx=-1;
      for(const entry of expected){
        const wanted=Number(entry.q.number)||entry.qi+1;
        // Exact printed number after the previous confirmed question. Never fall back to an unrelated number: wrong crop is worse than no crop.
        const hit=candidates.find(c=>c.idx>afterIdx&&c.number===wanted);
        if(!hit)continue;
        mapped.push({qi:entry.qi,start:hit,number:wanted});afterIdx=hit.idx;
      }
      if(!mapped.length)return [];
      return mapped.map((m,pos)=>{
        const next=pos<mapped.length-1?mapped[pos+1].start:null;
        const nextStartIdx=next?next.idx:lines.length;
        let blockLines=lines.slice(m.start.idx,nextStartIdx);
        // Ignore printer/page-footer noise in the bottom ~5% for the final question.
        if(!next)blockLines=blockLines.filter(l=>l.bbox.y0<imageHeight*.94||l.bbox.y0<m.start.bbox.y0+80);
        const top=Math.max(0,Math.round(m.start.bbox.y0-18));
        const bottom=next?Math.min(imageHeight,Math.round(next.bbox.y0-10)):Math.min(imageHeight,Math.round(Math.max(...blockLines.map(l=>l.bbox.y1),m.start.bbox.y1)+24));
        // Use nearly the full printable width. This guarantees that long answer options are not clipped horizontally when OCR misses words.
        const left=Math.max(0,Math.round(Math.min(m.start.bbox.x0,...blockLines.map(l=>l.bbox.x0))-35));
        const right=Math.min(imageWidth,Math.round(Math.max(imageWidth*.94,...blockLines.map(l=>l.bbox.x1))+18));
        const block={x:left,y:top,w:Math.max(80,right-left),h:Math.max(60,bottom-top)};
        return {qi:m.qi,number:m.number,fileIndex,fileName:file.name,crop:cropRegionToDataUrl(img,block)};
      });
    }finally{await worker.terminate();}
  }
  async function buildVisualExerciseCropPlan(files,questions){
    const plan=[],list=Array.from(files||[]);
    for(let i=0;i<list.length;i++){
      const file=list[i];if(!isImageFile(file))continue;
      const expected=questionsForImage(questions,file,i,list.length);if(!expected.length)continue;
      try{plan.push(...await analyzeExerciseImage(file,i,expected));}catch(err){console.warn('ZNAYA visual crop skipped for',file.name,err);}
    }
    return plan;
  }
  function attachVisualExerciseCrops(questions,plan){
    if(!Array.isArray(plan)||!plan.length)return questions;
    const byQuestion=new Map(plan.map(p=>[p.qi,p]));
    return questions.map((q,qi)=>{const hit=byQuestion.get(qi);return hit?{...q,crop:hit.crop,visualExercise:true,sourceImageIndex:hit.fileIndex,sourceImageName:hit.fileName,sourceQuestionNumber:hit.number}:q;});
  }
  function hasQuestionCrop(q){return !!(q&&typeof q.crop==='string'&&q.crop.startsWith('data:image/'));}

  function normalizeQuestion(raw,index){
    const type=ALLOWED_TYPES.has(raw?.type)?raw.type:'open';
    const rawNumber=Number(raw?.number);
    const sourceImageIndex=Number.isInteger(Number(raw?.sourceImageIndex))?Number(raw.sourceImageIndex):-1;
    return {type,number:Number.isFinite(rawNumber)&&rawNumber>0?rawNumber:index+1,q:String(raw?.q||'').trim(),o:Array.isArray(raw?.o)?raw.o.map(String).slice(0,4):[],a:String(raw?.a||'').toUpperCase(),answer:String(raw?.answer||'').trim(),subpoints:Array.isArray(raw?.subpoints)?raw.subpoints.map(String):[],comboOptions:Array.isArray(raw?.comboOptions)?raw.comboOptions.map(String):[],comboAnswer:String(raw?.comboAnswer||''),matchLeft:Array.isArray(raw?.matchLeft)?raw.matchLeft.map(String):[],matchRight:Array.isArray(raw?.matchRight)?raw.matchRight.map(String):[],matchAnswer:String(raw?.matchAnswer||''),e:String(raw?.e||'').trim(),topic:String(raw?.topic||sourceTitle()||subjectInfo(createState.subject).label).trim(),sourceImageIndex,sourceImageName:String(raw?.sourceImageName||''),crop:String(raw?.crop||''),visualExercise:raw?.visualExercise===true,source:'ZNAYA AI',materialGenerated:true};
  }
  function sampleQuestions(){
    const title=sourceTitle()||'Темата';
    return [
      {type:'open',q:`Кое е основното понятие в „${title}“?`,answer:'Основният термин или принцип, около който е организирана темата.',e:'Тази карта проверява дали разпознаваш централната идея.',topic:title},
      {type:'mcq',q:`Кое твърдение най-точно обобщава „${title}“?`,o:['Основната идея и нейните връзки','Несвързан пример','Само историческа дата','Техническа подробност'],a:'A',answer:'',e:'Търси обобщението, а не второстепенен детайл.',topic:title},
      {type:'yesno',q:`Разбирането на „${title}“ изисква да свързваш понятията, а не само да ги запаметяваш.`,answer:'Да',e:'ZNAYA насърчава активно разбиране.',topic:title}
    ];
  }
  async function generateDeck(){
    if(createState.busy)return;
    if(!createState.subject){toast('Избери предмет.');return;}
    createState.busy=true;createState.generated=[];setCreateStep(3);
    document.getElementById('reviewWorkspace').classList.add('hidden');document.getElementById('generationState').classList.remove('hidden');
    document.getElementById('generationMessage').textContent=isExerciseFlow()?'Разпознаваме задачите, изрязваме всеки въпрос заедно с опциите му и пазим номерацията…':(createState.files.some(isImageFile)?'Разчитаме материала и подготвяме учебни въпроси…':(createState.files.length?'Четем материала и подбираме най-важното…':'Структурираме темата и подготвяме подходящи въпроси…'));
    try{
      let payload;
      if(window.ZNAYA_PREVIEW_MODE){await new Promise(r=>setTimeout(r,850));payload={questions:sampleQuestions()};}
      else{
        if(!window.ZNAYAAI?.generateMaterial)throw new Error('ZNAYA AI модулът не се зареди. Провери интернет връзката.');
        const settings=window.ZNAYAAI.settings();
        if(settings.mode==='auto'||settings.mode==='puter')await window.ZNAYAAI.ensureSignedIn();
        payload=await window.ZNAYAAI.generateMaterial({subject:createState.subject,title:sourceTitle(),count:isExerciseFlow()?undefined:(Number(document.getElementById('cardCount').value)||10),difficulty:isExerciseFlow()?undefined:(document.getElementById('difficulty').value||'medium'),studyMode:createState.studyMode,files:createState.files,materialText:createState.sourceType==='material'?document.getElementById('materialText').value.trim():'',materialMode:createState.materialMode});
      }
      createState.generated=(payload?.questions||[]).map(normalizeQuestion).filter(q=>q.q);
      if(isExerciseFlow()&&createState.files.some(isImageFile)){
        const cropPlan=await buildVisualExerciseCropPlan(createState.files,createState.generated).catch(err=>{console.warn('ZNAYA crop plan failed',err);return [];});
        if(cropPlan.length)createState.generated=attachVisualExerciseCrops(createState.generated,cropPlan);
      }
      if(!createState.generated.length)throw new Error('ZNAYA не успя да създаде карти от този материал.');
      const name=document.getElementById('deckName');name.value=sourceTitle()||`${subjectInfo(createState.subject).label} — нов комплект`;
      renderGenerated();
      document.getElementById('generationState').classList.add('hidden');document.getElementById('reviewWorkspace').classList.remove('hidden');
      toast(`Готови са ${createState.generated.length} карти.`);
    }catch(err){
      console.error(err);setCreateStep(2);toast(err?.message||'Генерирането не успя.');
    }finally{createState.busy=false;}
  }
  function correctText(q){
    if(q.type==='mcq'){const idx='ABCD'.indexOf(q.a);return idx>=0&&q.o[idx]?q.o[idx]:(q.answer||q.a||'');}
    if(q.type==='match')return q.matchAnswer||q.answer;
    if(q.type==='combo')return q.comboAnswer||q.answer;
    return q.answer;
  }
  function generatedEditor(q,index){
    let answer='';
    if(q.type==='mcq'){
      answer=`<div class="option-editor">${q.o.map((opt,i)=>`<label class="option-edit ${q.a==='ABCD'[i]?'correct':''}"><input type="radio" name="correct-${index}" value="${'ABCD'[i]}" data-card-a="${index}" ${q.a==='ABCD'[i]?'checked':''}><span>${'ABCD'[i]}</span><input value="${esc(opt)}" data-option-index="${i}" data-card-index="${index}" aria-label="Отговор ${'ABCD'[i]}"></label>`).join('')}</div>`;
    }else if(q.type==='match'){
      const left=Array.isArray(q.matchLeft)?q.matchLeft:[],right=Array.isArray(q.matchRight)?q.matchRight:[],n=Math.max(2,left.length,right.length);
      answer=`<div class="match-editor-grid"><div><label class="mini-label">Лява колона</label>${Array.from({length:n},(_,j)=>`<label class="match-edit-row"><span>${String.fromCharCode(65+j)}</span><input value="${esc(left[j]||'')}" data-card-match-side="matchLeft" data-match-item-index="${j}" data-card-index="${index}"></label>`).join('')}</div><div><label class="mini-label">Дясна колона</label>${Array.from({length:n},(_,j)=>`<label class="match-edit-row"><span>${j+1}</span><input value="${esc(right[j]||'')}" data-card-match-side="matchRight" data-match-item-index="${j}" data-card-index="${index}"></label>`).join('')}</div></div><label class="mini-label">Правилно свързване</label><input class="match-map-input" value="${esc(q.matchAnswer||'')}" data-card-field="matchAnswer" data-card-index="${index}" placeholder="A:1; B:3; C:2">`;
    }else{
      const value=q.type==='combo'?q.comboAnswer:q.answer;
      const field=q.type==='combo'?'comboAnswer':'answer';
      answer=`<label class="mini-label">Правилен отговор</label><textarea class="answer-edit" rows="2" data-card-field="${field}" data-card-index="${index}">${esc(value)}</textarea>`;
    }
    const cropPreview=hasQuestionCrop(q)?`<div class="generated-crop"><div class="generated-crop-head"><strong>Оригинален въпрос</strong><span>${esc(q.sourceImageName||'качена снимка')}</span></div><img src="${q.crop}" alt="Изрязан въпрос ${esc(q.number||index+1)}"></div>`:'';
    return `<article class="generated-card" data-generated-card="${index}"><div class="generated-card-top"><div class="generated-card-meta"><span class="type-pill">${esc(TYPE_LABELS[q.type]||'Карта')}</span><span class="question-index">Въпрос ${esc(q.sourceQuestionNumber||q.number||index+1)}</span></div><button class="delete-card" type="button" data-delete-card="${index}">Премахни</button></div>${cropPreview}<label class="mini-label">${cropPreview?'Разпознат текст':'Въпрос'}</label><textarea class="question-edit" rows="2" data-card-field="q" data-card-index="${index}">${esc(q.q)}</textarea>${answer}<div class="generated-explain"><span>Обяснение</span><textarea rows="2" data-card-field="e" data-card-index="${index}" placeholder="Кратко обяснение…">${esc(q.e)}</textarea></div></article>`;
  }

  function renderGenerated(){
    const list=document.getElementById('generatedList');
    document.getElementById('reviewCount').textContent=`${createState.generated.length} ${createState.generated.length===1?'карта':'карти'}`;
    list.innerHTML=createState.generated.map(generatedEditor).join('');
  }
  function saveDeck(){
    if(!createState.generated.length){toast('Няма карти за запазване.');return;}
    const name=document.getElementById('deckName').value.trim()||sourceTitle()||'Нов комплект';
    state=loadState();const now=new Date().toISOString(),deckId=`deck-${Date.now()}`;
    const cards=createState.generated.map((q,idx)=>({...q,number:Number(q.sourceQuestionNumber||q.number||idx+1),id:`c${Date.now()}-${idx}`,subject:createState.subject,source:'ZNAYA AI',studyMode:createState.studyMode,createdAt:now}));
    const deck={id:deckId,name,subject:createState.subject,source:'ZNAYA AI',studyMode:createState.studyMode,createdAt:now,updatedAt:now,cards:JSON.parse(JSON.stringify(cards))};
    state.deck=JSON.parse(JSON.stringify(cards));state.currentDeckId=deckId;state.currentDeckName=name;state.deckLibrary=Array.isArray(state.deckLibrary)?state.deckLibrary:[];state.deckLibrary.unshift(deck);state.mistakes=state.mistakes&&typeof state.mistakes==='object'?state.mistakes:{};cards.forEach(c=>{if(state.mistakes[c.id]===undefined)state.mistakes[c.id]=0;});
    if(!saveState()){toast('Комплектът не беше запазен. Изрязаните изображения може да са запълнили локалното хранилище.');return;}
    resetCreate({keepSubject:true});go('library');toast(`„${name}“ е добавен в библиотеката.`);
  }

  // Initial render
  ensureLegacyLibrary();document.getElementById('dateLabel').textContent=formatDate();renderSubjects();renderHome();renderSubjectPicker();renderLibrary();

  document.querySelectorAll('[data-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();go(a.dataset.view);}));
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  document.getElementById('topSettings').addEventListener('click',()=>go('settings'));
  document.getElementById('createMain').addEventListener('click',()=>openCreate());
  document.getElementById('startCreate').addEventListener('click',()=>openCreate({source:'topic',topic:document.getElementById('topicInput').value.trim()}));
  document.getElementById('uploadMaterial').addEventListener('click',()=>openCreate({source:'material',pickFiles:true}));
  document.getElementById('writeTopic').addEventListener('click',()=>document.getElementById('topicInput').focus());
  document.getElementById('topicInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();openCreate({source:'topic',topic:e.currentTarget.value.trim()});}});
  document.getElementById('reviewHomeCard').addEventListener('click',()=>go('review'));
  document.getElementById('reviewHomeCard').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go('review');}});
  document.getElementById('reviewStartAll').addEventListener('click',()=>startReview('all'));
  document.getElementById('reviewPriorityList').addEventListener('click',e=>{const b=e.target.closest('[data-review-open]');if(b)openDeckDetail(b.dataset.reviewOpen);});
  document.getElementById('reviewSubjectGrid').addEventListener('click',e=>{const b=e.target.closest('[data-review-subject]');if(b)startReview(b.dataset.reviewSubject);});
  document.getElementById('subjectsDashboard').addEventListener('click',e=>{const lib=e.target.closest('[data-subject-library]');if(lib){libraryState.subject=lib.dataset.subjectLibrary;go('library');return;}const rev=e.target.closest('[data-subject-review]');if(rev&&!rev.disabled)startReview(rev.dataset.subjectReview);});
  document.getElementById('progressInsightCard').addEventListener('click',e=>{const b=e.target.closest('[data-progress-review]');if(b)startReview(b.dataset.progressReview);});

  document.getElementById('createBack').addEventListener('click',()=>go('home'));
  document.querySelectorAll('[data-source]').forEach(btn=>btn.addEventListener('click',()=>setSourceType(btn.dataset.source)));
  document.querySelectorAll('[data-material-mode]').forEach(btn=>btn.addEventListener('click',()=>setMaterialMode(btn.dataset.materialMode)));
  document.getElementById('sourceNext').addEventListener('click',()=>{if(validateSource())setCreateStep(2);});
  document.querySelectorAll('[data-create-prev]').forEach(btn=>btn.addEventListener('click',()=>setCreateStep(Number(btn.dataset.createPrev))));
  document.querySelectorAll('[data-study-mode]').forEach(btn=>btn.addEventListener('click',()=>setStudyMode(btn.dataset.studyMode)));
  ['cardCount','difficulty'].forEach(id=>document.getElementById(id).addEventListener('change',renderCreateSummary));
  ['createTopic','materialText','materialTopic'].forEach(id=>document.getElementById(id).addEventListener('input',renderCreateSummary));
  document.getElementById('generateButton').addEventListener('click',generateDeck);
  document.getElementById('regenerateButton').addEventListener('click',generateDeck);
  document.getElementById('saveDeckButton').addEventListener('click',saveDeck);

  const fileInput=document.getElementById('materialFiles'),dropzone=document.getElementById('materialDropzone');
  dropzone.addEventListener('click',()=>fileInput.click());fileInput.addEventListener('change',e=>addFiles(e.target.files));
  ['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag');}));
  ['dragleave','dragend'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag');}));
  dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('drag');addFiles(e.dataTransfer?.files||[]);});

  document.getElementById('generatedList').addEventListener('input',e=>{
    const idx=Number(e.target.dataset.cardIndex);if(!Number.isInteger(idx)||!createState.generated[idx])return;
    if(e.target.dataset.cardField)createState.generated[idx][e.target.dataset.cardField]=e.target.value;
    if(e.target.dataset.optionIndex!==undefined){createState.generated[idx].o[Number(e.target.dataset.optionIndex)]=e.target.value;}
    if(e.target.dataset.cardMatchSide){const side=e.target.dataset.cardMatchSide,item=Number(e.target.dataset.matchItemIndex);createState.generated[idx][side]=Array.isArray(createState.generated[idx][side])?createState.generated[idx][side]:[];createState.generated[idx][side][item]=e.target.value;}
  });
  document.getElementById('generatedList').addEventListener('change',e=>{const idx=Number(e.target.dataset.cardA);if(Number.isInteger(idx)&&createState.generated[idx])createState.generated[idx].a=e.target.value;});
  document.getElementById('generatedList').addEventListener('click',e=>{const btn=e.target.closest('[data-delete-card]');if(!btn)return;createState.generated.splice(Number(btn.dataset.deleteCard),1);renderGenerated();});

  document.getElementById('libraryCreate').addEventListener('click',()=>openCreate());
  document.getElementById('librarySearch').addEventListener('input',e=>{libraryState.query=e.currentTarget.value;renderLibrary();});
  document.getElementById('librarySort').addEventListener('change',e=>{libraryState.sort=e.currentTarget.value;renderLibrary();});
  document.getElementById('libraryFilters').addEventListener('click',e=>{const b=e.target.closest('[data-library-subject]');if(!b)return;libraryState.subject=b.dataset.librarySubject;renderLibrary();});
  document.getElementById('libraryGrid').addEventListener('click',e=>{const create=e.target.closest('[data-empty-create]');if(create){openCreate();return;}const study=e.target.closest('[data-study-deck]');if(study){startStudy(study.dataset.studyDeck);return;}const open=e.target.closest('[data-open-deck]');if(open){openDeckDetail(open.dataset.openDeck);return;}const card=e.target.closest('[data-library-card]');if(card)openDeckDetail(card.dataset.libraryCard);});
  document.getElementById('deckDetailClose').addEventListener('click',closeDeckDetail);document.getElementById('deckBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDeckDetail();});
  document.getElementById('deckStudyButton').addEventListener('click',()=>startStudy(libraryState.openDeckId));document.getElementById('deckEditButton').addEventListener('click',()=>openDeckEditor(libraryState.openDeckId));document.getElementById('deckDuplicateButton').addEventListener('click',()=>duplicateDeck(libraryState.openDeckId));document.getElementById('deckDeleteButton').addEventListener('click',()=>askDeleteDeck(libraryState.openDeckId));
  document.getElementById('editDeckClose').addEventListener('click',closeDeckEditor);document.getElementById('editCancel').addEventListener('click',closeDeckEditor);document.getElementById('editSave').addEventListener('click',saveDeckEdits);document.getElementById('editBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDeckEditor();});
  document.getElementById('editCards').addEventListener('input',e=>{const d=libraryState.editDraft;if(!d)return;const idx=Number(e.target.dataset.editIndex);if(Number.isInteger(idx)&&d.cards[idx]&&e.target.dataset.editField)d.cards[idx][e.target.dataset.editField]=e.target.value;const opt=e.target.dataset.editOption;if(opt){const [ci,oi]=opt.split(':').map(Number);if(d.cards[ci]){d.cards[ci].o=d.cards[ci].o||[];d.cards[ci].o[oi]=e.target.value;}}if(Number.isInteger(idx)&&d.cards[idx]&&e.target.dataset.editMatchSide){const side=e.target.dataset.editMatchSide,item=Number(e.target.dataset.editMatchItem);d.cards[idx][side]=Array.isArray(d.cards[idx][side])?d.cards[idx][side]:[];d.cards[idx][side][item]=e.target.value;}});document.getElementById('editCards').addEventListener('change',e=>{const idx=Number(e.target.dataset.editA);if(Number.isInteger(idx)&&libraryState.editDraft?.cards?.[idx])libraryState.editDraft.cards[idx].a=e.target.value;});document.getElementById('editCards').addEventListener('click',e=>{const b=e.target.closest('[data-edit-remove]');if(!b||!libraryState.editDraft)return;libraryState.editDraft.cards.splice(Number(b.dataset.editRemove),1);renderEditCards();});
  const closeConfirm=()=>{const b=document.getElementById('confirmBackdrop');b.classList.remove('open');b.setAttribute('aria-hidden','true');b.hidden=true;};
  document.getElementById('confirmCancel').addEventListener('click',closeConfirm);document.getElementById('confirmDelete').addEventListener('click',deleteOpenDeck);document.getElementById('confirmBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeConfirm();});
  document.getElementById('studyShell').addEventListener('click',e=>{if(e.target.closest('[data-study-return]')||e.target.closest('[data-study-library]')){go(studyState.returnView||'library');return;}if(e.target.closest('[data-study-review-again]')){startReview(studyState.reviewSubject||'all');return;}if(e.target.closest('[data-study-repeat]')){studyState.index=0;studyState.known=0;studyState.unknown=0;resetStudyCardState();renderStudy();return;}const opt=e.target.closest('[data-study-option]');if(opt){studyState.selected=opt.dataset.studyOption;renderStudy();return;}const ml=e.target.closest('[data-match-left]');if(ml&&!studyState.matchChecked){studyState.activeMatch=Number(ml.dataset.matchLeft);renderStudy();return;}const mr=e.target.closest('[data-match-right]');if(mr&&!studyState.matchChecked){if(studyState.activeMatch===null){toast('Първо избери елемент от лявата колона.');return;}const ri=Number(mr.dataset.matchRight);Object.keys(studyState.matchMap).forEach(k=>{if(Number(studyState.matchMap[k])===ri)delete studyState.matchMap[k];});studyState.matchMap[studyState.activeMatch]=ri;const card=currentStudyCard(),left=cleanMatchItems(card?.matchLeft);studyState.activeMatch=left.findIndex((_,i)=>studyState.matchMap[i]===undefined);if(studyState.activeMatch<0)studyState.activeMatch=null;renderStudy();return;}if(e.target.closest('[data-match-reset]')){studyState.matchMap={};studyState.activeMatch=null;studyState.matchChecked=false;studyState.matchResult=null;renderStudy();return;}if(e.target.closest('[data-match-check]')){const card=currentStudyCard(),left=cleanMatchItems(card?.matchLeft);if(Object.keys(studyState.matchMap).length<left.length){toast('Свържи всички елементи преди проверката.');return;}studyState.matchChecked=true;renderStudy();return;}if(e.target.closest('[data-study-match-next]')){rateStudy(!!studyState.matchResult?.correct);return;}if(e.target.closest('[data-study-reveal]')){studyState.revealed=true;renderStudy();return;}const rate=e.target.closest('[data-study-rate]');if(rate)rateStudy(rate.dataset.studyRate==='yes');});
  document.querySelectorAll('[data-settings-tab]').forEach(btn=>btn.addEventListener('click',()=>{const tab=btn.dataset.settingsTab;document.querySelectorAll('[data-settings-tab]').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('[data-settings-panel]').forEach(x=>x.classList.toggle('active',x.dataset.settingsPanel===tab));}));
  document.getElementById('saveLearningSettings').addEventListener('click',saveLearningSettings);
  document.getElementById('saveAiSettings').addEventListener('click',saveAiSettings);
  document.getElementById('connectPuter').addEventListener('click',connectPuter);
  document.querySelectorAll('[data-save-session-key]').forEach(btn=>btn.addEventListener('click',()=>saveSessionKey(btn.dataset.saveSessionKey)));
  document.querySelectorAll('[data-clear-session-key]').forEach(btn=>btn.addEventListener('click',()=>clearSessionKey(btn.dataset.clearSessionKey)));
  document.getElementById('puterCreditCard')?.addEventListener('click',()=>refreshPuterCredits({interactive:true}));
  document.getElementById('puterCreditMobile')?.addEventListener('click',()=>refreshPuterCredits({interactive:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshPuterCredits();});
  window.addEventListener('online',()=>refreshPuterCredits());
  refreshPuterCredits();
  document.getElementById('exportData').addEventListener('click',exportBackup);
  document.getElementById('importData').addEventListener('click',()=>document.getElementById('importDataFile').click());
  document.getElementById('importDataFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)importBackupFile(file);e.target.value='';});
  document.getElementById('resetProgress').addEventListener('click',()=>askDataAction('progress'));
  document.getElementById('eraseAllData').addEventListener('click',()=>askDataAction('all'));
  document.getElementById('dataConfirmCancel').addEventListener('click',closeDataConfirm);
  document.getElementById('dataConfirmAccept').addEventListener('click',executeDataAction);
  document.getElementById('dataConfirmBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDataConfirm();});
  document.getElementById('runDiagnostics').addEventListener('click',runDiagnostics);
  window.addEventListener('online',updateNetworkStatus);window.addEventListener('offline',updateNetworkStatus);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('dataConfirmBackdrop').classList.contains('open'))closeDataConfirm();else if(document.getElementById('confirmBackdrop').classList.contains('open'))closeConfirm();else if(document.getElementById('editBackdrop').classList.contains('open'))closeDeckEditor();else if(document.getElementById('deckBackdrop').classList.contains('open'))closeDeckDetail();}});

  window.addEventListener('unhandledrejection',e=>{const msg=String(e.reason?.message||e.reason||'');if(msg&&!/auth_window_closed|cancel/i.test(msg)){console.error('ZNAYA unhandled rejection',e.reason);}});
  window.addEventListener('hashchange',()=>setView((location.hash||'#home').slice(1)));
  setView((location.hash||'#home').slice(1));
})();


  initTheme();
  document.getElementById('themeToggle')?.addEventListener('click',()=>applyTheme(currentTheme()==='dark'?'light':'dark'));

if('serviceWorker' in navigator&&!window.ZNAYA_PREVIEW_MODE){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
