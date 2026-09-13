(()=>{
'use strict';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const COURSE_LIST=window.GVA_COURSES||[];
const COURSE_META=Object.fromEntries(COURSE_LIST.map(c=>[c.id,c]));
const views=['#appHomeView','#courseHomeView','#difficultView','#episodeView'];
const audio=$('#audio'), toast=$('#toast'), sidebar=$('#sidebar'), backdrop=$('#sidebarBackdrop');

const COURSE_DEFAULT={lastEpisode:1,sectionLastEpisodes:{},mode:'study',speed:1,positions:{},maxPositions:{},completed:{},bookmarks:[],revealEnglishOnAudio:false};
const APP_DEFAULT={theme:'light',textSize:'normal',lastCourse:'b1',libraryLayout:'grid',courses:{}};

function clone(x){return JSON.parse(JSON.stringify(x))}
function loadAppState(){
  let s;
  try{s=JSON.parse(localStorage.getItem('gvaAppState')||'null')}catch{}
  if(!s){
    s=clone(APP_DEFAULT);
    // Automatic migration from the earlier single-course B1 app when available.
    try{
      const old=JSON.parse(localStorage.getItem('goetheB1State')||'null');
      if(old){
        s.theme=old.theme||'light'; s.textSize=old.textSize||'normal';
        s.courses.b1=Object.assign(clone(COURSE_DEFAULT),old);
      }
    }catch{}
  }
  s=Object.assign(clone(APP_DEFAULT),s||{});
  s.courses=s.courses||{};
  return s;
}
let AS=loadAppState();
function save(){localStorage.setItem('gvaAppState',JSON.stringify(AS))}
function cs(id){
  if(!AS.courses[id])AS.courses[id]=clone(COURSE_DEFAULT);
  const s=AS.courses[id];
  if(!s.sectionLastEpisodes)s.sectionLastEpisodes={};
  return s;
}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmt(t){t=Math.max(0,Math.floor(+t||0));let h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function msg(x){toast.textContent=x;toast.classList.add('show');clearTimeout(msg.t);msg.t=setTimeout(()=>toast.classList.remove('show'),1300)}

let currentCourseId='b1', D=null, entryIndex={}, epMap={}, currentEp=null;
let lastActive=-1, segmentStop=null, manualEnglish=new Set(), manualRecall=new Set();
let pendingSeek=null,pendingFocusId=null,saveTick=0,libraryFilter='all',scrollTimer=null;
let libraryOpenSections=new Set();
let activeEpisodeSection=null;
let playerHasStarted=false;
const loaded={};
const loading={};

async function loadCourseData(id){
  if(loaded[id])return loaded[id];
  if(loading[id])return loading[id];
  const meta=COURSE_META[id];
  if(!meta||meta.status!=='ready')throw new Error('Course not available yet');
  loading[id]=new Promise((resolve,reject)=>{
    window.GVA_COURSE_DATA=undefined;
    const s=document.createElement('script');
    s.src=meta.dataScript;
    s.onload=()=>{
      const data=window.GVA_COURSE_DATA;
      if(!data){delete loading[id];return reject(new Error('Course data did not load'))}
      loaded[id]=data; window.GVA_COURSE_DATA=undefined; s.remove(); delete loading[id]; updateHeaderProgress(); resolve(data);
    };
    s.onerror=()=>{delete loading[id];reject(new Error(`Could not load ${meta.dataScript}`))};
    document.head.appendChild(s);
  });
  return loading[id];
}
async function activateCourse(id){
  const meta=COURSE_META[id];
  if(!meta)return false;
  if(meta.status!=='ready'){msg(`${meta.title} is prepared for a future course.`);return false}
  try{
    D=await loadCourseData(id);currentCourseId=id;AS.lastCourse=id;save();
    entryIndex=D.entry_index||{};epMap=Object.fromEntries(D.episodes.map(e=>[e.episode,e]));
    if(id==='b1'){
      const last=epMap[+courseState().lastEpisode||0];
      activeEpisodeSection=currentEp&&currentEp.section?currentEp.section:(last?.section||activeEpisodeSection||'core');
    }else activeEpisodeSection=null;
    populateSelect(activeEpisodeSection);updateCourseNavigation();updateHeaderProgress();return true;
  }catch(err){console.error(err);msg('Course data could not be loaded.');return false}
}

function applyPreferences(){
  document.documentElement.dataset.theme=AS.theme||'light';
  document.documentElement.dataset.textSize=AS.textSize||'normal';
  $('#themeBtn').textContent=AS.theme==='dark'?'☀ Light':'☾ Dark';
  $$('.top-mini').forEach(b=>b.classList.remove('active'));
  const map={small:'#textSmaller',normal:'#textNormal',large:'#textLarger'};
  if(map[AS.textSize]&&$(map[AS.textSize]))$(map[AS.textSize]).classList.add('active');
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=AS.theme==='dark'?'#070c14':'#101827';
}
function showView(id){
  views.forEach(v=>$(v).classList.toggle('hidden',v!==id));
  $('#backCurrent').classList.add('hidden');
  setActiveNav(id);
  closeSidebar();
  updatePersistentPlayerVisibility();
}
function setActiveNav(view){
  $$('.side-link').forEach(x=>x.classList.remove('active'));
  let nav=view==='#appHomeView'?'home':view==='#difficultView'?'difficult':view==='#courseHomeView'?'course':view==='#episodeView'?'course':'';
  const b=$(`[data-nav="${nav}"]`);if(b)b.classList.add('active');
}

function setSectionNav(sectionId=null){
  const core=$('#navCore'),adv=$('#navAdvanced');
  if(core)core.classList.toggle('section-selected',sectionId==='core');
  if(adv)adv.classList.toggle('section-selected',sectionId==='advanced');
}

function episodesForSection(sectionId=activeEpisodeSection){
  if(!D)return [];
  if(currentCourseId==='b1'&&sectionId)return D.episodes.filter(ep=>ep.section===sectionId);
  return D.episodes;
}
function lastEpisodeForSection(sectionId){
  const S=courseState();
  const remembered=+S.sectionLastEpisodes?.[sectionId]||0;
  if(remembered&&epMap[remembered]?.section===sectionId)return remembered;
  const globalLast=+S.lastEpisode||0;
  if(globalLast&&epMap[globalLast]?.section===sectionId)return globalLast;
  return episodesForSection(sectionId)[0]?.episode||D?.episodes?.[0]?.episode||1;
}
function setActiveEpisodeSection(sectionId=null){
  if(currentCourseId!=='b1'){
    activeEpisodeSection=null;
    populateSelect();
    return;
  }
  activeEpisodeSection=sectionId||currentEp?.section||epMap[+courseState().lastEpisode||0]?.section||'core';
  populateSelect(activeEpisodeSection);
}
function updateEpisodeNavButtons(){
  if(!currentEp||!D)return;
  const list=episodesForSection(currentEp.section||activeEpisodeSection);
  const idx=list.findIndex(ep=>ep.episode===currentEp.episode);
  $('#prevEpisode').disabled=idx<=0;
  $('#nextEpisode').disabled=idx<0||idx>=list.length-1;
}
function moveEpisodeWithinSection(delta){
  if(!currentEp)return;
  const list=episodesForSection(currentEp.section||activeEpisodeSection);
  const idx=list.findIndex(ep=>ep.episode===currentEp.episode);
  const target=list[idx+delta];
  if(target)openEpisode(target.episode,null,true);
}
function openSidebar(){sidebar.classList.add('open');backdrop.classList.add('show')}
function closeSidebar(){sidebar.classList.remove('open');backdrop.classList.remove('show')}

function courseState(){return cs(currentCourseId)}
function progressWords(data=D,state=courseState()){
  if(!data)return 0;let n=0;
  for(const ep of data.episodes){let max=state.completed[ep.episode]?ep.duration:(+state.maxPositions[ep.episode]||0);n+=ep.entries.filter(e=>e.end<=max).length}
  return n
}
function completedWords(ep){const S=courseState();let max=S.completed[ep.episode]?ep.duration:(+S.maxPositions[ep.episode]||0);return ep.entries.filter(e=>e.end<=max).length}
function pct(ep){const S=courseState();if(S.completed[ep.episode])return 100;return Math.min(100,100*(+S.maxPositions[ep.episode]||0)/ep.duration)}
function statusKey(ep){const S=courseState();if(S.completed[ep.episode])return'finished';return (+S.maxPositions[ep.episode]||0)>2?'in-progress':'not-started'}
function statusLabel(ep){let k=statusKey(ep);return k==='finished'?['✓ Finished','done']:k==='in-progress'?['◐ In progress','progressing']:['○ Not started','']}

function epDisplay(ep){return ep?.display_episode||ep?.episode||1}
function sectionMeta(id){return D?.sections?.find(s=>s.id===id)||null}
function episodeDisplayLabel(ep){
  if(!ep)return 'Episode 01';
  const n=String(epDisplay(ep)).padStart(2,'0');
  if(ep.section==='advanced')return `B1+ Advanced · Episode ${n}`;
  if(ep.section==='core')return `B1 Core · Episode ${n}`;
  return `Episode ${n}`;
}
function sectionEpisodes(id){return D?.episodes?.filter(ep=>ep.section===id)||[]}
function sectionProgress(id){
  const eps=sectionEpisodes(id);let done=0,total=0;
  for(const ep of eps){done+=completedWords(ep);total+=ep.word_count}
  return {done,total,pct:total?Math.round(100*done/total):0};
}
function sectionTarget(id){
  const eps=sectionEpisodes(id),S=courseState();if(!eps.length)return 1;
  if(eps.some(ep=>ep.episode===+S.lastEpisode))return +S.lastEpisode;
  return (eps.find(ep=>!S.completed[ep.episode])||eps[0]).episode;
}
async function openSection(id){
  if(!D||currentCourseId!=='b1'){if(!(await activateCourse('b1')))return}
  const t=sectionTarget(id);openEpisode(t,+courseState().positions[t]||0)
}
function stickyTopOffset(){
  const headerH=$('#appHeader')?.offsetHeight||66;
  const player=$('#persistentPlayerHost');
  const playerH=player&&!player.classList.contains('hidden')?player.offsetHeight:0;
  return headerH+playerH+12;
}
function scrollElementBelowPlayer(el,smooth=true){
  if(!el)return;
  const y=el.getBoundingClientRect().top+window.scrollY-stickyTopOffset();
  window.scrollTo({top:Math.max(0,y),behavior:smooth?'smooth':'auto'});
}
function activeEpisodeCardForSection(sectionId){
  if(!currentEp||!playerHasStarted||currentEp.section!==sectionId)return null;
  return document.querySelector(`.episode-card[data-ep="${currentEp.episode}"]`);
}
function scrollSectionToActiveEpisode(sectionId,smooth=true){
  const activeCard=activeEpisodeCardForSection(sectionId);
  if(activeCard){
    scrollElementBelowPlayer(activeCard,smooth);
    activeCard.classList.add('locate-pulse');
    setTimeout(()=>activeCard.classList.remove('locate-pulse'),900);
    return;
  }
  scrollElementBelowPlayer(document.getElementById(`library-section-${sectionId}`),smooth);
}
function scrollToEpisodeBrowser(sectionId=null){
  const host=$('#courseEpisodeBrowser');
  if(!host)return;
  if(sectionId){
    libraryOpenSections=new Set([sectionId]);
    setSectionNav(sectionId);
    renderEpisodeGrid();
  }
  setTimeout(()=>{
    if(sectionId)scrollSectionToActiveEpisode(sectionId,true);
    else scrollElementBelowPlayer(host,true);
  },100);
}

function courseProgressFromLoaded(id){
  const data=loaded[id];
  if(!data)return {done:0,total:0};
  const st=cs(id);
  return {done:progressWords(data,st),total:data.total_words||0};
}
function combinedProgress(){
  let done=0,total=0;
  for(const c of COURSE_LIST){
    if(c.status!=='ready')continue;
    const p=courseProgressFromLoaded(c.id);
    done+=p.done; total+=p.total;
  }
  return {done,total,pct:total?Math.round(100*done/total):0};
}
function updatePersistentPlayerVisibility(){
  const host=$('#persistentPlayerHost');
  if(!host)return;
  const onEpisode=!$('#episodeView').classList.contains('hidden');
  const shouldShow=onEpisode || (!audio.paused && !!currentEp);
  host.classList.toggle('hidden',!shouldShow);
}

function updateHeaderProgress(){
  const ring=$('#headerRing'),pctEl=$('#headerPct'),label=$('#headerProgressLabel'),wordsEl=$('#headerProgressWords');
  const onHome=!$('#appHomeView').classList.contains('hidden');

  if(onHome || !D){
    const p=combinedProgress();
    ring.style.setProperty('--pct',p.pct);
    pctEl.textContent=`${p.pct}%`;
    label.textContent='All courses';
    wordsEl.textContent=p.total?`${p.done} / ${p.total}`:'No course data';
    return;
  }

  const words=progressWords();
  const total=D.total_words||0;
  const pct=total?Math.round(100*words/total):0;
  const meta=COURSE_META[currentCourseId];

  ring.style.setProperty('--pct',pct);
  pctEl.textContent=`${pct}%`;
  label.textContent=`${meta.short} progress`;
  wordsEl.textContent=`${words} / ${total}`;
}
function updateCourseNavigation(){
  const meta=COURSE_META[currentCourseId];
  $('#navCourse').innerHTML=`<span>▶</span> ${esc(meta.short)} Vocabulary`;
  $('#navDifficult').title=`${meta.short} Difficult Words`;
  $$('.course-side').forEach(b=>b.classList.toggle('active-course',b.dataset.course===currentCourseId));
  $('#sideBookmarkCount').textContent=courseState().bookmarks.length;
  if($('#navCore'))$('#navCore').classList.toggle('hidden',currentCourseId!=='b1');
  if($('#navAdvanced'))$('#navAdvanced').classList.toggle('hidden',currentCourseId!=='b1');
}

function renderAppHome(){
  showView('#appHomeView');location.hash='home';
  $('#courseGrid').innerHTML=COURSE_LIST.map(c=>{
    let progressHtml='',action='';
    if(c.status==='ready'&&loaded[c.id]){
      const st=cs(c.id),data=loaded[c.id],words=progressWords(data,st),p=Math.round(100*words/data.total_words);
      progressHtml=`<div class="course-card-meta"><span>${words} / ${data.total_words} words</span><span>${p}%</span></div><div class="thinbar"><i style="width:${p}%"></i></div>`;
      action='<span class="coming-tag">Open course</span>';
    }else if(c.status==='ready'){
      progressHtml='<div class="course-card-meta"><span>Progress loads with course</span><span></span></div><div class="thinbar"><i style="width:0"></i></div>';
      action='<span class="coming-tag">Open course</span>';
    }else{
      progressHtml='<div class="course-card-meta"><span>Course structure prepared</span><span></span></div>';
      action='<span class="coming-tag">Coming soon</span>';
    }
    return `<article class="course-card ${c.status==='ready'?'ready':''} ${c.id==='technical'?'tech':''}" data-course="${c.id}">
      <div class="course-card-head"><div class="course-card-badge">${esc(c.short)}</div>${action}</div>
      <h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>
      <div class="course-card-footer">${progressHtml}</div></article>`
  }).join('');
  $$('.course-card[data-course]').forEach(card=>card.onclick=()=>openCourse(card.dataset.course));
  updateHeaderProgress();
}
async function openCourse(id='b1',sectionToOpen=null){
  if(!(await activateCourse(id)))return;
  const meta=COURSE_META[id],S=courseState(),words=progressWords(),p=Math.round(100*words/D.total_words);
  $('#courseEyebrow').textContent=`${meta.short} AUDIO COURSE`;
  $('#courseTitle').textContent=meta.title;
  $('#courseDescription').textContent=meta.description;
  $('#courseWords').textContent=D.total_words.toLocaleString();
  $('#courseEpisodes').textContent=D.episodes.length;
  $('#courseProgressText').textContent=`${p}%`;
  $('#courseProgressInline').textContent=`${words} / ${D.total_words} words · ${p}%`;
  $('#courseProgressFill').style.width=`${p}%`;
  $('#bookmarkCount').textContent=S.bookmarks.length;
  $('#sideBookmarkCount').textContent=S.bookmarks.length;
  let le=+S.lastEpisode||1,pos=+S.positions[le]||0,lastEp=epMap[le]||D.episodes[0],lastLabel=episodeDisplayLabel(lastEp);
  $('#continueBtn').textContent=pos>5?`Continue ${lastLabel} · ${fmt(pos)}`:`Start ${lastLabel}`;
  $('#continueSummary').textContent=pos>5?`Last position: ${lastLabel} at ${fmt(pos)}.`:'Your listening position is saved automatically.';
  libraryOpenSections=new Set(sectionToOpen?[sectionToOpen]:[]);
  if(id==='b1'&&sectionToOpen)setActiveEpisodeSection(sectionToOpen);
  else if(id==='b1')setActiveEpisodeSection(currentEp?.section||activeEpisodeSection||'core');
  else setActiveEpisodeSection(null);
  renderEpisodeGrid();
  $('#searchInput').value='';$('#searchPanel').classList.add('hidden');$('#bookmarksPanel').classList.add('hidden');$('#bookmarksBtn').classList.remove('active');
  showView('#courseHomeView');location.hash=`course-${id}`;updateHeaderProgress();
  setSectionNav(sectionToOpen);

  if(id==='b1'&&sectionToOpen&&currentEp&&playerHasStarted&&currentEp.section!==sectionToOpen){
    const wasPlaying=!audio.paused;
    const target=lastEpisodeForSection(sectionToOpen);
    const seek=+courseState().positions[target]||0;
    openEpisode(target,seek,wasPlaying,null,null,true);
  }
  if(sectionToOpen)scrollToEpisodeBrowser(sectionToOpen);
}

function episodeCardHtml(ep){
  let p=pct(ep),st=statusLabel(ep),cw=completedWords(ep);
  const isCurrent=!!(currentEp&&playerHasStarted&&currentEp.episode===ep.episode);
  const currentState=isCurrent?(audio.paused?['● Current','current-now']:['▶ Playing','playing-now']):st;
  return `<article class="episode-card ${ep.section==='advanced'?'advanced':''} ${isCurrent?'current-episode':''}" data-ep="${ep.episode}">
    <div class="ephead"><span class="epnum">Episode ${String(epDisplay(ep)).padStart(2,'0')}</span><span class="status ${currentState[1]}">${currentState[0]}</span></div>
    <div class="epmeta">${fmt(ep.duration)} · ${cw} / ${ep.word_count} words</div>
    <div class="epbar"><i style="width:${p}%"></i></div>
    <div class="epwords">${esc(ep.first_word)} → ${esc(ep.last_word)}</div></article>`
}

function applyLibraryLayout(){
  const layout=AS.libraryLayout==='list'?'list':'grid',grid=$('#episodeGrid');
  if(grid){
    grid.classList.toggle('grid-view',layout==='grid');
    grid.classList.toggle('list-view',layout==='list');
  }
  if($('#gridViewBtn')){
    $('#gridViewBtn').classList.toggle('active',layout==='grid');
    $('#gridViewBtn').setAttribute('aria-pressed',layout==='grid'?'true':'false');
  }
  if($('#listViewBtn')){
    $('#listViewBtn').classList.toggle('active',layout==='list');
    $('#listViewBtn').setAttribute('aria-pressed',layout==='list'?'true':'false');
  }
}
function setLibraryLayout(layout){
  AS.libraryLayout=layout==='list'?'list':'grid';save();applyLibraryLayout();
}
function toggleLibrarySection(id){
  if(libraryOpenSections.has(id)){
    libraryOpenSections.delete(id);
    setSectionNav(null);
    renderEpisodeGrid();
  }else{
    libraryOpenSections=new Set([id]);
    setSectionNav(id);
    renderEpisodeGrid();
    setTimeout(()=>scrollSectionToActiveEpisode(id,true),90);
  }
}
function renderEpisodeGrid(){
  if(!D||!$('#episodeGrid'))return;
  const filtered=D.episodes.filter(ep=>libraryFilter==='all'||statusKey(ep)===libraryFilter);
  let html='';
  if(D.sections?.length){
    for(const sec of D.sections){
      const eps=filtered.filter(ep=>ep.section===sec.id);
      const p=sectionProgress(sec.id),isOpen=libraryOpenSections.has(sec.id);
      html+=`<section class="library-section ${sec.id==='advanced'?'advanced':''} ${isOpen?'is-open':''}" id="library-section-${sec.id}">
        <button type="button" class="library-section-head" data-section-toggle="${sec.id}" aria-expanded="${isOpen?'true':'false'}">
          <div><span class="section-kicker">${sec.id==='advanced'?'B1+':'B1'}</span><h2>${esc(sec.title)}</h2><p>${sec.episodes} episodes · ${sec.total_words.toLocaleString()} words</p></div>
          <div class="library-section-head-right"><strong>${p.pct}%</strong><span class="section-chevron" aria-hidden="true">⌄</span></div>
        </button>
        <div class="library-section-body ${isOpen?'':'hidden'}">
          <div class="episode-grid-inner">${eps.length?eps.map(episodeCardHtml).join(''):'<div class="empty-state">No episodes in this section match the selected filter.</div>'}</div>
        </div>
      </section>`;
    }
  }else{
    html=filtered.map(episodeCardHtml).join('');
  }
  $('#episodeGrid').innerHTML=html||'<div class="empty-state">No episodes match this filter.</div>';
  applyLibraryLayout();
  $$('[data-section-toggle]').forEach(x=>x.onclick=()=>toggleLibrarySection(x.dataset.sectionToggle));
  $$('.episode-card').forEach(x=>x.onclick=()=>openEpisode(+x.dataset.ep,null,true));
}
function bookmarksHtml(){
  const S=courseState();
  if(!S.bookmarks.length)return '<b>No difficult words bookmarked yet.</b><p>Tap ☆ while studying to build your personal review list.</p>';
  return `<div class="section-head"><h2>My difficult words (${S.bookmarks.length})</h2><button class="text-btn danger clear-bookmarks">Clear bookmarks</button></div>`+
    S.bookmarks.map(id=>{
      let x=entryIndex[id];if(!x)return'';
      let full=epMap[x.episode]?.entries.find(e=>e.entry_id===id);
      return `<div class="bookmark-row"><div><b>${esc(x.german)}</b> — ${esc(x.english)}
        <small>${esc(episodeDisplayLabel(epMap[x.episode]))}${full?` · ${esc(full.difficulty)} · ${esc(full.type)}`:''}</small></div>
        <div class="row-actions"><button class="mini review" data-id="${id}">▶ Review</button><button class="mini openword" data-id="${id}">Open</button><button class="mini removebm" data-id="${id}">✕</button></div></div>`
    }).join('');
}
function bindBookmarkPanel(container,fromCourse=false){
  container.querySelectorAll('.review').forEach(b=>b.onclick=()=>reviewBookmark(b.dataset.id));
  container.querySelectorAll('.openword').forEach(b=>b.onclick=()=>{let x=entryIndex[b.dataset.id];openEpisode(x.episode,x.start,false,null,x.entry_id)});
  container.querySelectorAll('.removebm').forEach(b=>b.onclick=()=>toggleBookmark(b.dataset.id,true));
  const c=container.querySelector('.clear-bookmarks');
  if(c)c.onclick=()=>{if(confirm('Clear all difficult-word bookmarks?')){courseState().bookmarks=[];save();refreshBookmarkCounts();renderDifficultPanel();if(fromCourse)renderCourseBookmarkPanel(true)}}
}
function refreshBookmarkCounts(){
  const n=courseState().bookmarks.length;$('#bookmarkCount').textContent=n;$('#sideBookmarkCount').textContent=n;
}
function renderCourseBookmarkPanel(show=true){
  const p=$('#bookmarksPanel');p.innerHTML=bookmarksHtml();bindBookmarkPanel(p,true);
  if(show){p.classList.toggle('hidden');$('#bookmarksBtn').classList.toggle('active',!p.classList.contains('hidden'));if(!p.classList.contains('hidden'))$('#searchPanel').classList.add('hidden')}
}
function renderDifficultPanel(){
  const p=$('#difficultFullPanel');p.innerHTML=bookmarksHtml();bindBookmarkPanel(p,false);
}
async function openDifficult(){
  if(!D&&!(await activateCourse(AS.lastCourse||'b1')))return;
  renderDifficultPanel();showView('#difficultView');location.hash=`difficult-${currentCourseId}`;updateHeaderProgress();
}
function toggleBookmark(id,rerender=false){
  const S=courseState(),i=S.bookmarks.indexOf(id);
  if(i>=0)S.bookmarks.splice(i,1);else S.bookmarks.push(id);
  save();refreshBookmarkCounts();if(currentEp)updateStars();
  if(rerender){renderDifficultPanel();if(!$('#bookmarksPanel').classList.contains('hidden'))renderCourseBookmarkPanel(false)}
  msg(i>=0?'Bookmark removed':'Saved as difficult word')
}
function reviewBookmark(id){let x=entryIndex[id];openEpisode(x.episode,x.start,true,x.end,x.entry_id)}

function search(){
  if(!D)return;
  const q=$('#searchInput').value.trim().toLowerCase(),p=$('#searchPanel');
  if(!q){p.classList.add('hidden');return}
  let out=[];outer:for(const ep of D.episodes){for(const e of ep.entries){
    if(e.german.toLowerCase().includes(q)||e.english.toLowerCase().includes(q)){out.push(e);if(out.length>=80)break outer}
  }}
  p.innerHTML=`<div class="search-summary"><b>Search results (${out.length}${out.length===80?'+':''})</b><span>for “${esc(q)}”</span></div>`+
    (out.length?out.map(e=>`<div class="result-row clickable" data-id="${e.entry_id}"><div><b>${esc(e.german)}</b> — ${esc(e.english)}
    <small>${esc(episodeDisplayLabel(epMap[e.episode]))} · word ${e.position}</small></div><button class="mini searchopen" data-id="${e.entry_id}">Open</button></div>`).join(''):'<p>No matching words.</p>');
  p.classList.remove('hidden');$('#bookmarksPanel').classList.add('hidden');$('#bookmarksBtn').classList.remove('active');
  $$('.result-row[data-id]').forEach(r=>r.onclick=ev=>{if(!ev.target.closest('button'))openSearchResult(r.dataset.id)});
  $$('.searchopen').forEach(b=>b.onclick=()=>openSearchResult(b.dataset.id));
}
function openSearchResult(id){let x=entryIndex[id];openEpisode(x.episode,x.start,false,null,id)}

function currentEntry(){
  if(!currentEp)return null;let t=audio.currentTime||0,a=currentEp.entries,lo=0,hi=a.length-1,ans=0;
  while(lo<=hi){let m=(lo+hi)>>1;if(a[m].start<=t){ans=m;lo=m+1}else hi=m-1}return a[ans]
}
function updateWordProgress(){if(!currentEp)return;let e=currentEntry();$('#wordProgress').textContent=e?`${e.position} / ${currentEp.word_count} words`:`0 / ${currentEp.word_count} words`}
function updateStars(){
  if(!currentEp)return;const S=courseState();
  $$('.bookmark-card').forEach(b=>{let on=S.bookmarks.includes(b.dataset.id);b.classList.toggle('marked',on);b.textContent=on?'★':'☆'});
  let e=currentEntry(),marked=e&&S.bookmarks.includes(e.entry_id);
  $('#currentBookmark').textContent=marked?'★':'☆';$('#currentBookmark').classList.toggle('marked',!!marked);
  $('#lyricsStar').textContent=marked?'★ Difficult word':'☆ Difficult word';$('#lyricsStar').classList.toggle('marked',!!marked)
}
function line(ev,cls,label,text,en=false){
  if(!ev)return'';return `<div class="line ${cls}${en?' english':''}" data-event="${ev.id}" data-start="${ev.start}">
    <span class="smalllabel">${esc(label)}</span><span class="actual-text">${esc(text)}</span></div>`
}
function renderTranscript(){
  const S=courseState(),normal=$('#normalView'),lyrics=$('#lyricsView');
  let byBlock={},evByEntry={};currentEp.entries.forEach(e=>(byBlock[e.block]??=[]).push(e));currentEp.events.forEach(e=>(evByEntry[e.entry_id]??=[]).push(e));let h='';
  for(const rb of currentEp.recall_blocks){
    h+=`<div class="block-title">Learning block ${rb.block}</div>`;
    for(const e of byBlock[rb.block]){
      let evs=evByEntry[e.entry_id]||[],deex=evs.filter(x=>x.kind==='de_example'),enex=evs.filter(x=>x.kind==='en_example');
      h+=`<section class="vocab-card" id="entry-${e.entry_id}"><div class="card-meta"><span class="badge">#${e.position}</span><span class="badge ${e.difficulty}">${e.difficulty}</span><span class="badge">${esc(e.type)}</span>
      <button class="bookmark-card ${S.bookmarks.includes(e.entry_id)?'marked':''}" data-id="${e.entry_id}">${S.bookmarks.includes(e.entry_id)?'★':'☆'}</button></div>
      ${line(evs.find(x=>x.kind==='de_word'),'de-word','German word · spoken twice',e.german)}
      ${line(evs.find(x=>x.kind==='en_meaning'),'en-meaning','English meaning',e.english,true)}
      ${e.grammar?line(evs.find(x=>x.kind==='grammar'),'grammar','Grammar / plural / verb forms',e.grammar):''}<div class="example-wrap">`;
      e.examples.forEach((ex,i)=>{h+=line(deex[i],'de-example',`German example ${i+1} · spoken twice`,ex.de)+line(enex[i],'en-example',`English translation ${i+1}`,ex.en,true)});
      h+='</div></section>'
    }
    h+=`<section class="recall-card"><h3>◆ Recall after Block ${rb.block}</h3>`;
    rb.de_en.forEach(id=>{let evs=evByEntry[id]||[],p=evs.find(x=>x.kind==='recall_de_prompt'),a=evs.find(x=>x.kind==='recall_en_answer'),x=entryIndex[id];
      h+=`<div class="recall-item">${line(p,'de-example','German → English · 4-second recall',x.german)}<div class="line en-example english recall-answer auto-hidden" data-event="${a.id}" data-start="${a.start}" data-answer="${a.start}"><span class="smalllabel">Answer</span><span class="actual-text">${esc(x.english)}</span></div></div>`});
    rb.en_de.forEach(id=>{let evs=evByEntry[id]||[],p=evs.find(x=>x.kind==='recall_en_prompt'),a=evs.find(x=>x.kind==='recall_de_answer'),x=entryIndex[id];
      h+=`<div class="recall-item">${line(p,'en-example','English → German · 4-second recall',x.english,true)}<div class="line de-example recall-answer auto-hidden" data-event="${a.id}" data-start="${a.start}" data-answer="${a.start}"><span class="smalllabel">Answer</span><span class="actual-text">${esc(x.german)}</span></div></div>`});
    h+='</section>'
  }
  normal.innerHTML=h;
  $$('.bookmark-card').forEach(b=>b.onclick=()=>toggleBookmark(b.dataset.id));
  $$('.line[data-start]').forEach(el=>el.onclick=e=>{
    if(el.classList.contains('recall-answer')&&el.classList.contains('auto-hidden')){manualRecall.add(el.dataset.event);el.classList.add('revealed');e.stopPropagation();return}
    if(el.classList.contains('english')&&el.classList.contains('hidden-en')){manualEnglish.add(el.dataset.event);el.classList.add('user-revealed');applyEnglishVisibility(audio.currentTime||0);e.stopPropagation();return}
    audio.currentTime=+el.dataset.start;msg(`Jumped to ${fmt(audio.currentTime)}`)
  });
  applyMode()
}
function label(ev){return({de_word:'German word',en_meaning:'English meaning',grammar:'Grammar / plural / verb forms',de_example:'German example · spoken twice',en_example:'English translation',recall_de_prompt:'Recall · German → English · think 4 seconds',recall_en_answer:'Recall answer',recall_en_prompt:'Recall · English → German · think 4 seconds',recall_de_answer:'Recall answer'})[ev.kind]||''}
function activeIndex(t){let a=currentEp.events,lo=0,hi=a.length-1,ans=0;while(lo<=hi){let m=(lo+hi)>>1;if(a[m].start<=t){ans=m;lo=m+1}else hi=m-1}return ans}
function renderLyrics(i){let a=currentEp.events,prev=a[i-1],cur=a[i],next=a[i+1];$('#lyricPrev').textContent=prev?prev.text:'';$('#lyricCurrent').innerHTML=cur?`<span class="lyric-label">${esc(label(cur))}</span>${esc(cur.text)}`:'';$('#lyricNext').textContent=next?next.text:'';updateStars()}
function updateRecall(t){$$('.recall-answer').forEach(el=>{let autoAllowed=!(courseState().mode==='german'&&el.classList.contains('english'));let ok=manualRecall.has(el.dataset.event)||(autoAllowed&&t>=+el.dataset.answer);el.classList.toggle('revealed',ok)})}
function applyEnglishVisibility(t=0){
  const S=courseState();$$('.english').forEach(el=>{
    if(el.classList.contains('recall-answer'))return;
    let id=el.dataset.event,man=manualEnglish.has(id),hide=false;
    if(S.mode==='german')hide=!man;else if(S.mode==='study'&&S.revealEnglishOnAudio)hide=!man&&t<+el.dataset.start;
    el.classList.toggle('hidden-en',hide);el.classList.toggle('user-revealed',man&&!hide)
  })
}
function applyMode(){
  const S=courseState(),normal=$('#normalView'),lyrics=$('#lyricsView'),m=S.mode||'study';
  $$('.mode[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));
  normal.classList.toggle('normal-hidden',m==='lyrics');lyrics.classList.toggle('visible',m==='lyrics');
  $('#revealEnglishToggle').checked=!!S.revealEnglishOnAudio;applyEnglishVisibility(audio.currentTime||0);updateRecall(audio.currentTime||0);checkBackCurrent();sync(true)
}
function sync(force=false){
  if(!currentEp)return;const S=courseState(),t=audio.currentTime||0;
  $('#progress').value=t;$('#timebox').textContent=`${fmt(t)} / ${fmt(currentEp.duration)}`;updateWordProgress();updateRecall(t);
  if(segmentStop&&t>=segmentStop){audio.pause();segmentStop=null;$('#playerNote').textContent='Difficult-word review finished.';msg('Review complete')}
  let i=activeIndex(t);
  if(i!==lastActive||force){
    $$('.line.active').forEach(x=>x.classList.remove('active'));let ev=currentEp.events[i],el=document.querySelector(`.line[data-event="${ev.id}"]`);if(el)el.classList.add('active');
    renderLyrics(i);applyEnglishVisibility(t);
    if($('#followToggle').checked&&S.mode!=='lyrics'&&el&&i!==lastActive)el.scrollIntoView({behavior:'smooth',block:'center'});
    lastActive=i;setTimeout(checkBackCurrent,220)
  }
  if(Date.now()-saveTick>1800){S.positions[currentEp.episode]=t;S.maxPositions[currentEp.episode]=Math.max(+S.maxPositions[currentEp.episode]||0,t);S.lastEpisode=currentEp.episode;save();saveTick=Date.now();updateHeaderProgress()}
  updateStars()
}
function scrollToCurrentWord(smooth=true){
  if(!currentEp)return;let ev=currentEp.events[activeIndex(audio.currentTime||0)],id=ev&&ev.entry_id,card=id&&document.getElementById(`entry-${id}`),lineEl=ev&&document.querySelector(`.line[data-event="${ev.id}"]`);
  (lineEl||card)?.scrollIntoView({behavior:smooth?'smooth':'auto',block:'center'});$('#backCurrent').classList.add('hidden')
}
function checkBackCurrent(){
  const S=courseState(),btn=$('#backCurrent');if(!currentEp||S.mode==='lyrics'||$('#episodeView').classList.contains('hidden')){btn.classList.add('hidden');return}
  let ev=currentEp.events[activeIndex(audio.currentTime||0)],el=ev&&document.querySelector(`.line[data-event="${ev.id}"]`);if(!el){btn.classList.add('hidden');return}
  let r=el.getBoundingClientRect(),top=$('#appHeader').offsetHeight+$('.player').offsetHeight+8,visible=r.bottom>top&&r.top<window.innerHeight-60;btn.classList.toggle('hidden',visible)
}

async function openEpisode(n,seek=null,autoplay=false,stop=null,focusId=null,keepCourseView=false){
  if(!D&&!(await activateCourse(AS.lastCourse||'b1')))return;
  n=Math.max(1,Math.min(D.episodes.length,+n));currentEp=epMap[n];const S=courseState(),meta=COURSE_META[currentCourseId];
  if(!keepCourseView)showView('#episodeView');else showView('#courseHomeView');
  setSectionNav(currentEp?.section||null);
  S.lastEpisode=n;
  if(currentEp?.section)S.sectionLastEpisodes[currentEp.section]=n;
  save();manualEnglish=new Set();manualRecall=new Set();lastActive=-1;segmentStop=stop||null;pendingFocusId=focusId;
  playerHasStarted=true;
  setActiveEpisodeSection(currentEp?.section||null);
  updatePersistentPlayerVisibility();
  if($('#episodeSelect'))$('#episodeSelect').value=String(n);
  updateEpisodeNavButtons();
  $('#episodeIntro').innerHTML=`<h1>${esc(episodeDisplayLabel(currentEp))}</h1><p>${fmt(currentEp.duration)} · ${currentEp.word_count} words · ${esc(currentEp.first_word)} → ${esc(currentEp.last_word)}</p><p>Tap a transcript line to seek. Tap ☆ to save a difficult word.</p>`;
  renderTranscript();
  if(!meta.audioBase){
    $('#playerNote').textContent='Secure audio gateway is not configured yet.';
    msg('Secure audio gateway is not configured yet.');
    return;
  }
  let src=`${meta.audioBase}${currentEp.audio}`;
  pendingSeek=seek!=null?+seek:(+S.positions[n]||0);
  $('#playerNote').textContent=stop!=null?'Difficult-word review: this entry will stop automatically.':'Your position is saved automatically.';
  if(audio.getAttribute('src')!==src){
    audio.src=src;
    audio.load();
    // Start play() during the user's click/change event. Browsers can reject a
    // delayed play() from loadedmetadata as autoplay, even though the episode
    // change itself came from a user gesture. The pending seek is applied in
    // onloadedmetadata before normal playback can begin.
    if(autoplay)audio.play().catch(()=>{})
  }else{
    audio.currentTime=pendingSeek||0;pendingSeek=null;sync(true);
    if(pendingFocusId)setTimeout(scrollFocusEntry,80);
    if(autoplay)audio.play().catch(()=>{})
  }
  location.hash=keepCourseView?`course-${currentCourseId}`:`episode-${currentCourseId}-${n}`;
  updateHeaderProgress();
  if(keepCourseView){
    renderEpisodeGrid();
    setTimeout(()=>scrollSectionToActiveEpisode(currentEp.section,true),110);
  }
}
function scrollFocusEntry(){if(!pendingFocusId)return;let el=document.getElementById(`entry-${pendingFocusId}`);if(el)el.scrollIntoView({behavior:'smooth',block:'center'});pendingFocusId=null}
function populateSelect(sectionId=activeEpisodeSection){
  const sel=$('#episodeSelect');sel.innerHTML='';if(!D)return;
  const list=episodesForSection(sectionId);
  for(const e of list){
    let o=document.createElement('option');
    o.value=e.episode;
    o.textContent=`${episodeDisplayLabel(e)} · ${fmt(e.duration)} · ${e.word_count} words`;
    sel.appendChild(o);
  }
  let remembered=currentEp&&list.some(e=>e.episode===currentEp.episode)
    ?currentEp.episode
    :(currentCourseId==='b1'&&sectionId?lastEpisodeForSection(sectionId):(+courseState().lastEpisode||list[0]?.episode));
  if(list.some(e=>e.episode===+remembered))sel.value=String(remembered);
}

$('#menuBtn').onclick=openSidebar;backdrop.onclick=closeSidebar;
$('#brandHome').onclick=renderAppHome;
$('[data-nav="home"]').onclick=renderAppHome;
$('#navCourse').onclick=()=>openCourse(currentCourseId);
$('#navDifficult').onclick=openDifficult;
if($('#navCore'))$('#navCore').onclick=()=>openCourse('b1','core');
if($('#navAdvanced'))$('#navAdvanced').onclick=()=>openCourse('b1','advanced');
$$('.course-side').forEach(b=>b.onclick=()=>openCourse(b.dataset.course));

$('#continueBtn').onclick=()=>{const S=courseState(),ep=+S.lastEpisode||1;openEpisode(ep,+S.positions[ep]||0)};
$('#openLibraryBtn').onclick=$('#quickLibrary').onclick=()=>scrollToEpisodeBrowser();
$('#bookmarksBtn').onclick=()=>renderCourseBookmarkPanel(true);
$('#searchInput').oninput=search;
$('#resetProgress').onclick=()=>{if(confirm(`Reset listening progress for all ${D.episodes.length} episodes? Difficult-word bookmarks will be kept.`)){const S=courseState();S.positions={};S.maxPositions={};S.completed={};S.lastEpisode=1;save();renderEpisodeGrid();updateHeaderProgress();openCourse(currentCourseId);msg('Progress reset')}};
$$('[data-library-filter]').forEach(b=>b.onclick=()=>{libraryFilter=b.dataset.libraryFilter;$$('[data-library-filter]').forEach(x=>x.classList.toggle('active',x===b));renderEpisodeGrid()});
if($('#gridViewBtn'))$('#gridViewBtn').onclick=()=>setLibraryLayout('grid');
if($('#listViewBtn'))$('#listViewBtn').onclick=()=>setLibraryLayout('list');

// Episode changes made from the player controls should continue immediately.
$('#episodeSelect').onchange=e=>openEpisode(+e.target.value,null,true);
$('#prevEpisode').onclick=()=>moveEpisodeWithinSection(-1);
$('#nextEpisode').onclick=()=>moveEpisodeWithinSection(1);
$('#episodeLibrary').onclick=()=>openCourse(currentCourseId,currentEp?.section||null);
$('#back10').onclick=()=>audio.currentTime=Math.max(0,audio.currentTime-10);
$('#fwd10').onclick=()=>audio.currentTime=Math.min(currentEp.duration,audio.currentTime+10);
$('#playBtn').onclick=()=>audio.paused?audio.play().catch(()=>{}):audio.pause();
$('#progress').oninput=e=>{audio.currentTime=+e.target.value;sync(true)};
$('#followToggle').onchange=()=>sync(true);
$$('.mode[data-mode]').forEach(b=>b.onclick=()=>{courseState().mode=b.dataset.mode;save();applyMode()});
$('#revealEnglishToggle').onchange=e=>{courseState().revealEnglishOnAudio=e.target.checked;save();applyEnglishVisibility(audio.currentTime||0);msg(e.target.checked?'English will appear with its audio':'English always visible in Study mode')};
const speeds={'.8×':.8,'.9×':.9,'1×':1,'1.1×':1.1,'1.25×':1.25,'1.5×':1.5};
$('#speedSelect').onchange=e=>{courseState().speed=speeds[e.target.value]||1;audio.playbackRate=courseState().speed;save()};
$('#currentBookmark').onclick=$('#lyricsStar').onclick=()=>{let e=currentEntry();if(e)toggleBookmark(e.entry_id)};
$('#backCurrent').onclick=()=>scrollToCurrentWord(true);

const backTop=$('#backToTop');
function updateBackTop(){
  if(backTop)backTop.classList.toggle('hidden',window.scrollY<420);
}
if(backTop){
  backTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
  window.addEventListener('scroll',updateBackTop,{passive:true});
  updateBackTop();
}

$('#themeBtn').onclick=()=>{AS.theme=AS.theme==='dark'?'light':'dark';save();applyPreferences()};
$('#textSmaller').onclick=()=>{AS.textSize='small';save();applyPreferences()};
$('#textNormal').onclick=()=>{AS.textSize='normal';save();applyPreferences()};
$('#textLarger').onclick=()=>{AS.textSize='large';save();applyPreferences()};

window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(checkBackCurrent,120)},{passive:true});
window.addEventListener('resize',checkBackCurrent);

audio.onloadedmetadata=()=>{
  if(!currentEp)return;const S=courseState();$('#progress').max=currentEp.duration;audio.playbackRate=+S.speed||1;
  let key=Object.entries(speeds).find(([k,v])=>v===+S.speed)?.[0]||'1×';$('#speedSelect').value=key;
  if(pendingSeek!=null){audio.currentTime=Math.min(pendingSeek,audio.duration-.1);pendingSeek=null}sync(true);if(pendingFocusId)setTimeout(scrollFocusEntry,150)
};
audio.ontimeupdate=()=>sync();
audio.onplay=()=>{
  $('#playBtn').textContent='❚❚';playerHasStarted=true;updatePersistentPlayerVisibility();
  if(currentEp)setSectionNav(currentEp.section||null);
  if(!$('#courseHomeView').classList.contains('hidden'))renderEpisodeGrid();
};
audio.onpause=()=>{
  $('#playBtn').textContent='▶';
  if(currentEp){courseState().positions[currentEp.episode]=audio.currentTime;save()}
  updatePersistentPlayerVisibility();
  if(!$('#courseHomeView').classList.contains('hidden'))renderEpisodeGrid();
};
audio.onended=()=>{if(!currentEp)return;const S=courseState();S.completed[currentEp.episode]=true;S.positions[currentEp.episode]=currentEp.duration;S.maxPositions[currentEp.episode]=currentEp.duration;save();updateHeaderProgress();updatePersistentPlayerVisibility();msg('Episode completed ✓')};
audio.onerror=()=>$('#playerNote').textContent='Audio stream could not be opened. Please refresh and try again.';

if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});

async function route(){
  const h=(location.hash||'#home').slice(1);
  if(h==='home'){renderAppHome();return}
  let m;
  if((m=h.match(/^course-(.+)$/))){await openCourse(m[1]);return}
  if((m=h.match(/^library-(.+)$/))){await openCourse(m[1]);return}
  if((m=h.match(/^difficult-(.+)$/))){if(await activateCourse(m[1]))await openDifficult();return}
  if((m=h.match(/^episode-([^-]+)-(\d+)$/))){if(await activateCourse(m[1]))await openEpisode(+m[2]);return}
  renderAppHome()
}

applyPreferences();
loadCourseData('b1').then(data=>{loaded.b1=data;if(!D&&AS.lastCourse==='b1'){D=data;currentCourseId='b1';entryIndex=D.entry_index||{};epMap=Object.fromEntries(D.episodes.map(e=>[e.episode,e]));updateCourseNavigation();updateHeaderProgress();renderAppHome()}}).catch(()=>{});
route();
})();