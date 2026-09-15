(()=>{
'use strict';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const COURSE_LIST=window.GVA_COURSES||[];
const COURSE_META=Object.fromEntries(COURSE_LIST.map(c=>[c.id,c]));
const views=['#appHomeView','#courseHomeView','#quizHistoryView','#difficultView','#episodeView'];
const audio=$('#audio'), toast=$('#toast'), sidebar=$('#sidebar'), backdrop=$('#sidebarBackdrop');

const COURSE_DEFAULT={lastEpisode:1,sectionLastEpisodes:{},mode:'study',speed:1,positions:{},maxPositions:{},completed:{},bookmarks:[],revealEnglishOnAudio:false,quizBest:{},quizHistory:{},quizHistoryVersion:1};
const APP_DEFAULT={theme:'light',textSize:'normal',uiLanguage:'en',quizSound:true,lastCourse:'b1',libraryLayout:'grid',endBehavior:'stop',endBehaviorUiVersion:4,courses:{}};

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
  if(s.endBehaviorUiVersion!==4){s.endBehavior='stop';s.endBehaviorUiVersion=4;}
  if(!['stop','next','repeat'].includes(s.endBehavior))s.endBehavior='stop';
  if(!['en','bn','de'].includes(s.uiLanguage))s.uiLanguage='en';
  if(typeof s.quizSound!=='boolean')s.quizSound=true;
  return s;
}
let AS=loadAppState();

const QUIZ_COUNT=15;
const QUIZ_PASS=12;
let quizState=null;

const APP_VERSION='1.0.5';
const APP_UPDATED='15 September 2026';
let swRegistration=null;
let swReloading=false;
let updateCheckTimer=null;
function isInstalledApp(){
  return window.matchMedia?.('(display-mode: standalone)').matches===true ||
    window.navigator.standalone===true ||
    document.referrer.startsWith('android-app://');
}

function save(){localStorage.setItem('gvaAppState',JSON.stringify(AS))}
function cs(id){
  if(!AS.courses[id])AS.courses[id]=clone(COURSE_DEFAULT);
  const s=AS.courses[id];
  if(!s.sectionLastEpisodes)s.sectionLastEpisodes={};
  if(!s.quizBest)s.quizBest={};
  if(!s.quizHistory)s.quizHistory={};
  // Preserve an earlier best score as one legacy history item. After three
  // newer attempts, it drops out and the course score follows the newest 3 only.
  if(s.quizHistoryVersion!==1){
    for(const [ep,raw] of Object.entries(s.quizBest||{})){
      const score=Math.max(0,Math.min(QUIZ_COUNT,+raw||0));
      if(score>0&&!Array.isArray(s.quizHistory[ep])){
        s.quizHistory[ep]=[{id:`legacy-${ep}`,score,at:null,legacy:true,review:null}];
      }
    }
    s.quizHistoryVersion=1;
    save();
  }
  return s;
}
function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmt(t){t=Math.max(0,Math.floor(+t||0));let h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function msg(x){toast.textContent=x;toast.classList.add('show');clearTimeout(msg.t);msg.t=setTimeout(()=>toast.classList.remove('show'),1300)}

let currentCourseId=(COURSE_META[AS.lastCourse]?.status==='ready'?AS.lastCourse:'b1'), D=null, entryIndex={}, epMap={}, currentEp=null;
let lastActive=-1, segmentStop=null, manualEnglish=new Set(), manualRecall=new Set();

const UI_TEXT={
  en:{home:"Home",current:"CURRENT COURSE",courses:"COURSES",quizPoints:"Quiz Points",uiLanguage:"UI Language",brand:"German Vocabulary Audiobook",brandSub:"Audio + synchronized transcript",homeEyebrow:"VOCABULARY AUDIOBOOK COLLECTION",homeTitle:"Learn German vocabulary by listening, reading and recalling.",homeSubtitle:"One player for multiple vocabulary courses. Your progress and bookmarked words stay separate for each course.",coursesHeading:"Courses",courseProgress:"Course progress",words:"words",episodes:"episodes",completed:"completed",quizPointsLower:"quiz points",continueLearning:"Continue learning",goToEpisodes:"Go to episodes",personalReview:"PERSONAL REVIEW",difficultWords:"Bookmarked Words",difficultSubtitle:"Words you bookmarked with ★ while listening.",resetProgress:"Reset progress",allCourses:"All courses",noCourseData:"No course data",progress:"progress",openCourse:"Open course",comingSoon:"Coming soon",progressLoads:"Progress loads with course",structurePrepared:"Course structure prepared",passedWord:"passed",continueWord:"Continue",startWord:"Start",savedAutomatically:"Your listening position is saved automatically.",lastPosition:"Last position: {label} at {time}.",notStarted:"Not started",inProgress:"In progress",finished:"Finished",episodeLabel:"Episode",b1core:"B1 Core",b1adv:"B1+ Advanced",themeDark:"☾ Dark",themeLight:"☀ Light",afterStop:"Stop after episode",afterNext:"Play next episode",afterRepeat:"Repeat same episode",quiz:"Quiz",best:"Best",quizTitle:"Episode Quiz",question:"Question {n} of {t}",pass:"Pass: {p}/{t}",quizPrompt:"Choose the correct English meaning. The sound tells you whether your choice was right or wrong.",correct:"✓ Correct",correctAnswer:"Correct answer:",back:"Back",next:"Next",finish:"Finish",passed:"Passed",reviewRecommended:"Review recommended",greatTarget:"Great — you reached the 12/15 target.",listenAgainThen:"Listen to this episode again, then retake the quiz.",reviewMistakes:"Review your mistakes ({n})",yourAnswer:"Your answer:",correctShort:"Correct:",allCorrect:"All 15 answers were correct.",listenAgain:"Listen Again",retakeQuiz:"Retake Quiz",close:"Close",designedBy:"Designed & developed by Nazmul Somrat",top:"↑ Top",difficultWordBtn:"☆ Bookmark word"},
  bn:{home:"হোম",current:"বর্তমান কোর্স",courses:"কোর্সসমূহ",quizPoints:"কুইজ পয়েন্ট",uiLanguage:"ভাষা",brand:"জার্মান ভোকাবুলারি অডিওবুক",brandSub:"অডিও + সিঙ্ক্রোনাইজড ট্রান্সক্রিপ্ট",homeEyebrow:"ভোকাবুলারি অডিওবুক সংগ্রহ",homeTitle:"শুনে, পড়ে এবং মনে রেখে জার্মান শব্দভাণ্ডার শিখুন।",homeSubtitle:"একই প্লেয়ারে একাধিক শব্দভাণ্ডার কোর্স। প্রতিটি কোর্সের প্রগ্রেস ও বুকমার্ক করা শব্দ আলাদাভাবে সংরক্ষিত থাকে।",coursesHeading:"কোর্সসমূহ",courseProgress:"কোর্স প্রগ্রেস",words:"শব্দ",episodes:"এপিসোড",completed:"সম্পন্ন",quizPointsLower:"কুইজ পয়েন্ট",continueLearning:"শেখা চালিয়ে যান",goToEpisodes:"এপিসোডে যান",personalReview:"ব্যক্তিগত রিভিউ",difficultWords:"বুকমার্ক করা শব্দ",difficultSubtitle:"শোনার সময় ★ দিয়ে বুকমার্ক করা শব্দ।",resetProgress:"প্রগ্রেস রিসেট",allCourses:"সব কোর্স",noCourseData:"কোর্স ডেটা নেই",progress:"প্রগ্রেস",openCourse:"কোর্স খুলুন",comingSoon:"শীঘ্রই আসছে",progressLoads:"কোর্স খুললে প্রগ্রেস দেখা যাবে",structurePrepared:"কোর্সের কাঠামো প্রস্তুত",passedWord:"পাস",continueWord:"চালিয়ে যান",startWord:"শুরু",savedAutomatically:"আপনার শোনার অবস্থান স্বয়ংক্রিয়ভাবে সেভ হয়।",lastPosition:"সর্বশেষ অবস্থান: {label} এ {time}।",notStarted:"শুরু হয়নি",inProgress:"চলছে",finished:"শেষ",episodeLabel:"এপিসোড",b1core:"B1 কোর",b1adv:"B1+ অ্যাডভান্সড",themeDark:"☾ ডার্ক",themeLight:"☀ লাইট",afterStop:"এপিসোড শেষে থামুন",afterNext:"এপিসোড শেষে পরের এপিসোড চালান",afterRepeat:"এপিসোড শেষে একই এপিসোড পুনরায় চালান",quiz:"কুইজ",best:"সেরা",quizTitle:"এপিসোড কুইজ",question:"প্রশ্ন {n} / {t}",pass:"পাস: {p}/{t}",quizPrompt:"সঠিক ইংরেজি অর্থটি বেছে নিন। সাউন্ড বলে দেবে আপনার উত্তর সঠিক না ভুল।",correct:"✓ সঠিক",correctAnswer:"সঠিক উত্তর:",back:"পেছনে",next:"পরবর্তী",finish:"শেষ করুন",passed:"পাস",reviewRecommended:"পুনরায় রিভিউ করুন",greatTarget:"দারুণ — আপনি 12/15 লক্ষ্য পূরণ করেছেন।",listenAgainThen:"এই এপিসোডটি আবার শুনুন, তারপর কুইজটি আবার দিন।",reviewMistakes:"আপনার ভুলগুলো দেখুন ({n})",yourAnswer:"আপনার উত্তর:",correctShort:"সঠিক:",allCorrect:"সব 15টি উত্তরই সঠিক হয়েছে।",listenAgain:"আবার শুনুন",retakeQuiz:"আবার কুইজ দিন",close:"বন্ধ",designedBy:"ডিজাইন ও ডেভেলপ করেছেন Nazmul Somrat",top:"↑ টপ",difficultWordBtn:"☆ শব্দ বুকমার্ক করুন"},
  de:{home:"Start",current:"AKTUELLER KURS",courses:"KURSE",quizPoints:"Quizpunkte",uiLanguage:"Sprache",brand:"Deutsches Vokabel-Hörbuch",brandSub:"Audio + synchronisiertes Transkript",homeEyebrow:"VOKABEL-HÖRBUCH-SAMMLUNG",homeTitle:"Lerne deutsche Vokabeln durch Hören, Lesen und Wiederholen.",homeSubtitle:"Ein Player für mehrere Vokabelkurse. Dein Fortschritt und deine gespeicherten Wörter werden für jeden Kurs getrennt gespeichert.",coursesHeading:"Kurse",courseProgress:"Kursfortschritt",words:"Wörter",episodes:"Episoden",completed:"abgeschlossen",quizPointsLower:"Quizpunkte",continueLearning:"Weiterlernen",goToEpisodes:"Zu den Episoden",personalReview:"PERSÖNLICHE WIEDERHOLUNG",difficultWords:"Gespeicherte Wörter",difficultSubtitle:"Wörter, die du beim Hören mit ★ gespeichert hast.",resetProgress:"Fortschritt zurücksetzen",allCourses:"Alle Kurse",noCourseData:"Keine Kursdaten",progress:"Fortschritt",openCourse:"Kurs öffnen",comingSoon:"Demnächst",progressLoads:"Fortschritt wird mit dem Kurs geladen",structurePrepared:"Kursstruktur vorbereitet",passedWord:"bestanden",continueWord:"Weiter",startWord:"Start",savedAutomatically:"Deine Hörposition wird automatisch gespeichert.",lastPosition:"Letzte Position: {label} bei {time}.",notStarted:"Nicht begonnen",inProgress:"In Bearbeitung",finished:"Fertig",episodeLabel:"Episode",b1core:"B1 Grundkurs",b1adv:"B1+ Aufbau",themeDark:"☾ Dunkel",themeLight:"☀ Hell",afterStop:"Nach der Episode stoppen",afterNext:"Nächste Episode abspielen",afterRepeat:"Dieselbe Episode wiederholen",quiz:"Quiz",best:"Bestwert",quizTitle:"Episoden-Quiz",question:"Frage {n} von {t}",pass:"Bestehen: {p}/{t}",quizPrompt:"Wähle die richtige englische Bedeutung. Der Ton zeigt dir, ob deine Antwort richtig oder falsch war.",correct:"✓ Richtig",correctAnswer:"Richtige Antwort:",back:"Zurück",next:"Weiter",finish:"Beenden",passed:"Bestanden",reviewRecommended:"Wiederholung empfohlen",greatTarget:"Super — du hast das Ziel 12/15 erreicht.",listenAgainThen:"Höre diese Episode noch einmal und mache danach das Quiz erneut.",reviewMistakes:"Überprüfe deine Fehler ({n})",yourAnswer:"Deine Antwort:",correctShort:"Richtig:",allCorrect:"Alle 15 Antworten waren richtig.",listenAgain:"Noch einmal hören",retakeQuiz:"Quiz wiederholen",close:"Schließen",designedBy:"Entwickelt von Nazmul Somrat",top:"↑ Nach oben",difficultWordBtn:"☆ Wort speichern"}
};
const UI_MORE={
  en:{all:'All',grid:'Grid',list:'List',searchPlaceholder:'Search German or English…',bookmarkedWords:'Bookmarked Words',myBookmarks:'My bookmarked words ({n})',clearBookmarks:'Clear bookmarks',noBookmarks:'No bookmarked words yet.',bookmarkHelp:'Tap ☆ while studying to save words for review.',review:'Review',open:'Open',clearConfirm:'Clear all bookmarked words?',bookmarkRemoved:'Bookmark removed',bookmarkSaved:'Word bookmarked',searchResults:'Search results ({n}{plus})',forQuery:'for “{q}”',noMatching:'No matching words.',word:'word',sectionEmpty:'No episodes in this section match the selected filter.',episodesEmpty:'No episodes match this filter.',learningBlock:'Learning block {n}',germanWordTwice:'German word · spoken twice',englishMeaning:'English meaning',grammarForms:'Grammar / plural / verb forms',germanExample:'German example {n} · spoken twice',englishTranslation:'English translation {n}',recallAfter:'◆ Recall after Block {n}',deEnRecall:'German → English · 4-second recall',enDeRecall:'English → German · 4-second recall',answer:'Answer',jumpedTo:'Jumped to {time}',reviewFinished:'Bookmark review finished.',reviewComplete:'Review complete',noNextEpisode:'No next episode in this section',audioCourse:'AUDIO COURSE',transcriptHint:'Tap a transcript line to seek. Tap ☆ to bookmark a word.',gatewayMissing:'Secure audio gateway is not configured yet.',bookmarkReviewStop:'Bookmark review: this entry will stop automatically.',resetConfirm:'Reset listening progress for all {n} episodes? Bookmarks will be kept.',progressReset:'Progress reset',study:'Study',germanOnly:'German-only',lyrics:'Lyrics',revealEnglish:'Reveal English with audio',autoFollow:'Auto-follow',current:'Current',playing:'Playing',easy:'easy',medium:'medium',hard:'hard',noun:'noun',verb:'verb',other:'other',adjective:'adjective',adverb:'adverb',pronoun:'pronoun',preposition:'preposition',conjunction:'conjunction',article:'article'},
  bn:{all:'সব',grid:'গ্রিড',list:'তালিকা',searchPlaceholder:'জার্মান বা ইংরেজি খুঁজুন…',bookmarkedWords:'বুকমার্ক করা শব্দ',myBookmarks:'আমার বুকমার্ক করা শব্দ ({n})',clearBookmarks:'সব বুকমার্ক মুছুন',noBookmarks:'এখনও কোনো শব্দ বুকমার্ক করা হয়নি।',bookmarkHelp:'রিভিউর জন্য শব্দ সংরক্ষণ করতে পড়ার সময় ☆ চাপুন।',review:'রিভিউ',open:'খুলুন',clearConfirm:'সব বুকমার্ক করা শব্দ মুছে ফেলবেন?',bookmarkRemoved:'বুকমার্ক মুছে ফেলা হয়েছে',bookmarkSaved:'শব্দ বুকমার্ক করা হয়েছে',searchResults:'সার্চ ফলাফল ({n}{plus})',forQuery:'“{q}” এর জন্য',noMatching:'কোনো মিল পাওয়া যায়নি।',word:'শব্দ',sectionEmpty:'নির্বাচিত ফিল্টারে এই সেকশনে কোনো এপিসোড নেই।',episodesEmpty:'এই ফিল্টারে কোনো এপিসোড নেই।',learningBlock:'লার্নিং ব্লক {n}',germanWordTwice:'জার্মান শব্দ · দুইবার বলা হয়েছে',englishMeaning:'ইংরেজি অর্থ',grammarForms:'ব্যাকরণ / বহুবচন / ক্রিয়ার রূপ',germanExample:'জার্মান উদাহরণ {n} · দুইবার বলা হয়েছে',englishTranslation:'ইংরেজি অনুবাদ {n}',recallAfter:'◆ ব্লক {n} শেষে রিকল',deEnRecall:'জার্মান → ইংরেজি · ৪ সেকেন্ড রিকল',enDeRecall:'ইংরেজি → জার্মান · ৪ সেকেন্ড রিকল',answer:'উত্তর',jumpedTo:'{time} এ যাওয়া হয়েছে',reviewFinished:'বুকমার্ক রিভিউ শেষ হয়েছে।',reviewComplete:'রিভিউ সম্পন্ন',noNextEpisode:'এই সেকশনে পরের এপিসোড নেই',audioCourse:'অডিও কোর্স',transcriptHint:'কোনো ট্রান্সক্রিপ্ট লাইনে চাপলে সেখানে যাবে। শব্দ বুকমার্ক করতে ☆ চাপুন।',gatewayMissing:'নিরাপদ অডিও গেটওয়ে এখনো কনফিগার করা হয়নি।',bookmarkReviewStop:'বুকমার্ক রিভিউ: এই এন্ট্রি শেষে অডিও স্বয়ংক্রিয়ভাবে থামবে।',resetConfirm:'সব {n}টি এপিসোডের শোনার প্রগ্রেস রিসেট করবেন? বুকমার্কগুলো রাখা হবে।',progressReset:'প্রগ্রেস রিসেট হয়েছে',study:'স্টাডি',germanOnly:'শুধু জার্মান',lyrics:'লিরিক্স',revealEnglish:'অডিওর সাথে ইংরেজি দেখান',autoFollow:'অটো-ফলো',current:'বর্তমান',playing:'চলছে',easy:'সহজ',medium:'মাঝারি',hard:'কঠিন',noun:'বিশেষ্য',verb:'ক্রিয়া',other:'অন্যান্য',adjective:'বিশেষণ',adverb:'ক্রিয়া বিশেষণ',pronoun:'সর্বনাম',preposition:'পদান্বয়ী অব্যয়',conjunction:'সংযোজক',article:'আর্টিকেল'},
  de:{all:'Alle',grid:'Raster',list:'Liste',searchPlaceholder:'Deutsch oder Englisch suchen…',bookmarkedWords:'Gespeicherte Wörter',myBookmarks:'Meine gespeicherten Wörter ({n})',clearBookmarks:'Lesezeichen löschen',noBookmarks:'Noch keine Wörter gespeichert.',bookmarkHelp:'Tippe beim Lernen auf ☆, um Wörter für die Wiederholung zu speichern.',review:'Wiederholen',open:'Öffnen',clearConfirm:'Alle gespeicherten Wörter löschen?',bookmarkRemoved:'Lesezeichen entfernt',bookmarkSaved:'Wort gespeichert',searchResults:'Suchergebnisse ({n}{plus})',forQuery:'für „{q}“',noMatching:'Keine passenden Wörter gefunden.',word:'Wort',sectionEmpty:'In diesem Abschnitt passen keine Episoden zum gewählten Filter.',episodesEmpty:'Keine Episoden passen zu diesem Filter.',learningBlock:'Lernblock {n}',germanWordTwice:'Deutsches Wort · zweimal gesprochen',englishMeaning:'Englische Bedeutung',grammarForms:'Grammatik / Plural / Verbformen',germanExample:'Deutsches Beispiel {n} · zweimal gesprochen',englishTranslation:'Englische Übersetzung {n}',recallAfter:'◆ Abruf nach Block {n}',deEnRecall:'Deutsch → Englisch · 4 Sekunden Abruf',enDeRecall:'Englisch → Deutsch · 4 Sekunden Abruf',answer:'Antwort',jumpedTo:'Zu {time} gesprungen',reviewFinished:'Wiederholung der gespeicherten Wörter beendet.',reviewComplete:'Wiederholung abgeschlossen',noNextEpisode:'Keine nächste Episode in diesem Abschnitt',audioCourse:'AUDIOKURS',transcriptHint:'Tippe auf eine Transkriptzeile, um dorthin zu springen. Tippe auf ☆, um ein Wort zu speichern.',gatewayMissing:'Das sichere Audio-Gateway ist noch nicht konfiguriert.',bookmarkReviewStop:'Wiederholung gespeicherter Wörter: Dieser Eintrag stoppt automatisch.',resetConfirm:'Hörfortschritt für alle {n} Episoden zurücksetzen? Gespeicherte Wörter bleiben erhalten.',progressReset:'Fortschritt zurückgesetzt',study:'Lernen',germanOnly:'Nur Deutsch',lyrics:'Lyrics',revealEnglish:'Englisch mit Audio anzeigen',autoFollow:'Auto-Folge',current:'Aktuell',playing:'Läuft',easy:'leicht',medium:'mittel',hard:'schwer',noun:'Substantiv',verb:'Verb',other:'Sonstiges',adjective:'Adjektiv',adverb:'Adverb',pronoun:'Pronomen',preposition:'Präposition',conjunction:'Konjunktion',article:'Artikel'}
};
const QUIZ_HISTORY_TEXT={
  en:{title:'Quiz History',subtitle:'Your last 3 quiz attempts for each episode. Course quiz points use the best score among those 3 attempts.',allEpisodes:'All episodes',attemptedOnly:'Attempted only',allSections:'All sections',core:'B1 Core',advanced:'B1+ Advanced',best:'Best',latest:'Latest',attempts:'Attempts',notAttempted:'Not attempted',attempt:'Attempt',previousBest:'Earlier score',detailsUnavailable:'Detailed review was not stored for this earlier quiz score.',quizResult:'Quiz result',backToHistory:'Back to Quiz History',noEpisodes:'No episodes match this filter.',newest:'Newest',savedLocally:'Quiz history is stored on this device.',listenPractice:'Tap a time to open that word in the transcript and start the audio there.'},
  bn:{title:'কুইজ হিস্ট্রি',subtitle:'প্রতি এপিসোডের সর্বশেষ ৩টি কুইজ চেষ্টা। কোর্স কুইজ পয়েন্ট এই ৩টির মধ্যে সর্বোচ্চ স্কোর থেকে গণনা হয়।',allEpisodes:'সব এপিসোড',attemptedOnly:'শুধু চেষ্টা করা',allSections:'সব সেকশন',core:'B1 কোর',advanced:'B1+ অ্যাডভান্সড',best:'সেরা',latest:'সর্বশেষ',attempts:'চেষ্টা',notAttempted:'এখনও কুইজ দেওয়া হয়নি',attempt:'চেষ্টা',previousBest:'আগের স্কোর',detailsUnavailable:'এই পুরোনো কুইজ স্কোরের বিস্তারিত রিভিউ আগে সংরক্ষিত হয়নি।',quizResult:'কুইজ রেজাল্ট',backToHistory:'কুইজ হিস্ট্রিতে ফিরুন',noEpisodes:'এই ফিল্টারে কোনো এপিসোড নেই।',newest:'সর্বশেষ',savedLocally:'কুইজ হিস্ট্রি এই ডিভাইসে সংরক্ষিত থাকে।',listenPractice:'সময়ে চাপলে সেই শব্দের ট্রান্সক্রিপ্টে গিয়ে অডিও চালু হবে।'},
  de:{title:'Quiz-Verlauf',subtitle:'Die letzten 3 Quizversuche pro Episode. Die Quizpunkte des Kurses verwenden den besten Wert aus genau diesen 3 Versuchen.',allEpisodes:'Alle Episoden',attemptedOnly:'Nur versucht',allSections:'Alle Abschnitte',core:'B1 Grundkurs',advanced:'B1+ Aufbau',best:'Bestwert',latest:'Letzter',attempts:'Versuche',notAttempted:'Noch nicht versucht',attempt:'Versuch',previousBest:'Früherer Wert',detailsUnavailable:'Für diesen älteren Quizwert wurde noch keine Detailansicht gespeichert.',quizResult:'Quiz-Ergebnis',backToHistory:'Zurück zum Quiz-Verlauf',noEpisodes:'Keine Episoden entsprechen diesem Filter.',newest:'Neueste',savedLocally:'Der Quiz-Verlauf wird auf diesem Gerät gespeichert.',listenPractice:'Tippe auf eine Zeit, um das Wort im Transkript zu öffnen und das Audio dort zu starten.'}
};
function qh(key,vars={}){let x=QUIZ_HISTORY_TEXT[lang()]?.[key]??QUIZ_HISTORY_TEXT.en[key]??key;return String(x).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'')}
function ux(key,vars={}){let s=UI_MORE[lang()]?.[key]??UI_MORE.en[key]??key;return String(s).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'')}
function difficultyLabel(v){return ux(String(v||'').toLowerCase())||v}
function typeLabel(v){return ux(String(v||'').toLowerCase())||v}

const COURSE_TEXT={
  en:{a1:{title:"A1 Vocabulary",description:"Practical beginner German for everyday life with synchronized audio, transcript and active recall."},a2:{title:"A2 Vocabulary",description:"High-frequency elementary German vocabulary with synchronized audio, transcript and active recall."},b1:{title:"B1 Vocabulary Audiobook",description:"Goethe-style B1 core and advanced vocabulary with synchronized audio, transcript and active recall."},technical:{title:"Technical Vocabulary Audiobook",description:"Engineering, software, AI, data science, manufacturing and workplace technical German."}},
  bn:{a1:{title:"A1 শব্দভাণ্ডার",description:"দৈনন্দিন জীবনের জন্য ব্যবহারিক প্রাথমিক জার্মান শব্দভাণ্ডার, সিঙ্ক্রোনাইজড অডিও, ট্রান্সক্রিপ্ট এবং অ্যাক্টিভ রিকলসহ।"},a2:{title:"A2 শব্দভাণ্ডার",description:"উচ্চ-প্রচলিত প্রাথমিক জার্মান শব্দভাণ্ডার, সিঙ্ক্রোনাইজড অডিও, ট্রান্সক্রিপ্ট এবং অ্যাক্টিভ রিকলসহ।"},b1:{title:"B1 শব্দভাণ্ডার অডিওবুক",description:"Goethe-ধাঁচের B1 core এবং advanced শব্দভাণ্ডার, সিঙ্ক্রোনাইজড অডিও, ট্রান্সক্রিপ্ট এবং অ্যাক্টিভ রিকলসহ।"},technical:{title:"কারিগরি শব্দভাণ্ডার অডিওবুক",description:"ইঞ্জিনিয়ারিং, সফটওয়্যার, AI, data science, manufacturing এবং workplace technical German."}},
  de:{a1:{title:"A1 Wortschatz",description:"Praktischer Anfängerwortschatz für den Alltag mit synchronisiertem Audio, Transkript und aktivem Abruf."},a2:{title:"A2 Wortschatz",description:"Häufiger Grundwortschatz auf A2-Niveau mit synchronisiertem Audio, Transkript und aktivem Abruf."},b1:{title:"B1 Vokabel-Hörbuch",description:"Goethe-orientierter B1-Kern- und Aufbauwortschatz mit synchronisiertem Audio, Transkript und aktivem Abruf."},technical:{title:"Technisches Vokabel-Hörbuch",description:"Technisches Deutsch für Engineering, Software, KI, Data Science, Fertigung und Arbeitsplatz."}}
};
function lang(){return ["en","bn","de"].includes(AS.uiLanguage)?AS.uiLanguage:"en"}
function tt(key,vars={}){let s=(UI_TEXT[lang()]&&UI_TEXT[lang()][key])||UI_TEXT.en[key]||key;return String(s).replace(/\{(\w+)\}/g,(_,k)=>vars[k]??"")}
function courseTitle(id){return COURSE_TEXT[lang()]?.[id]?.title||COURSE_META[id]?.title||""}
function courseDescription(id){return COURSE_TEXT[lang()]?.[id]?.description||COURSE_META[id]?.description||""}
function courseLabel(id){if(id==="b1")return lang()==="bn"?"B1 শব্দভাণ্ডার":(lang()==="de"?"B1 Wortschatz":"B1 Vocabulary"); if(id==="technical")return lang()==="bn"?"কারিগরি শব্দভাণ্ডার":(lang()==="de"?"Technischer Wortschatz":"Technical Vocabulary"); if(id==="a1")return lang()==="bn"?"A1 শব্দভাণ্ডার":(lang()==="de"?"A1 Wortschatz":"A1 Vocabulary"); if(id==="a2")return lang()==="bn"?"A2 শব্দভাণ্ডার":(lang()==="de"?"A2 Wortschatz":"A2 Vocabulary"); return COURSE_META[id]?.title||id}
function endModeText(mode){return mode==="repeat"?tt("afterRepeat"):mode==="next"?tt("afterNext"):tt("afterStop")}
function setText(sel,val){const el=$(sel);if(el)el.textContent=val}
function setHTML(sel,val){const el=$(sel);if(el)el.innerHTML=val}
function updateLanguageButtons(){$$("[data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang()))}
function updateStaticLanguage(){document.documentElement.lang=lang()==="bn"?"bn":lang()==="de"?"de":"en";setText("#brandTitle",tt("brand"));setText("#brandSubtitle",tt("brandSub"));setHTML("#navHomeBtn",'<span>⌂</span> '+tt("home"));setText("#sideLabelCurrentCourse",tt("current"));setText("#sideLabelCourses",tt("courses"));setText("#sideQuizLabel",tt("quizPoints"));setText("#uiLanguageLabel",tt("uiLanguage"));setText("#footerCredit",tt("designedBy"));setText("#homeEyebrow",tt("homeEyebrow"));setText("#homeTitle",tt("homeTitle"));setText("#homeSubtitle",tt("homeSubtitle"));setText("#homeCoursesHeading",tt("coursesHeading"));setText("#courseProgressLabel",tt("courseProgress"));setText("#courseWordsLabel",tt("words"));setText("#courseEpisodesLabel",tt("episodes"));setText("#courseCompletedLabel",tt("completed"));setText("#courseQuizPointsLabel",tt("quizPointsLower"));setText("#episodeEyebrow",tt("episodes").toUpperCase());setText("#quickCardTitle",tt("continueLearning"));setText("#quickLibrary",tt("goToEpisodes"));setText("#difficultEyebrow",tt("personalReview"));setText("#difficultTitle",tt("difficultWords"));setText("#difficultSubtitle",tt("difficultSubtitle"));setText("#backToTop",tt("top"));setText("#resetProgress",tt("resetProgress"));setText("#openLibraryBtn",tt("episodes"));setText("#lyricsStar",tt("difficultWordBtn"));if($("#searchInput"))$("#searchInput").placeholder=(lang()==="bn"?"জার্মান বা ইংরেজি খুঁজুন…":lang()==="de"?"Deutsch oder Englisch suchen…":"Search German or English…");const themeBtn=$("#themeBtn");if(themeBtn)themeBtn.textContent=AS.theme==="dark"?tt("themeLight"):tt("themeDark");
  $$('#libraryFilters .chip').forEach(b=>{const k=b.dataset.libraryFilter;b.textContent=k==='all'?ux('all'):k==='not-started'?tt('notStarted'):k==='in-progress'?tt('inProgress'):tt('finished')});
  if($('#gridViewBtn'))$('#gridViewBtn').textContent='▦ '+ux('grid'); if($('#listViewBtn'))$('#listViewBtn').textContent='☰ '+ux('list');
  if($('#bookmarksBtn'))$('#bookmarksBtn').innerHTML=`★ ${ux('bookmarkedWords')} <span id="bookmarkCount">${courseState()?.bookmarks?.length||0}</span>`;
  const study=$('.mode[data-mode="study"]');if(study)study.textContent=ux('study'); const german=$('.mode[data-mode="german"]');if(german)german.textContent=ux('germanOnly'); const lyr=$('.mode[data-mode="lyrics"]');if(lyr)lyr.textContent=ux('lyrics');
  const reveal=$('#revealEnglishText');if(reveal)reveal.textContent=ux('revealEnglish'); const follow=$('#autoFollowText');if(follow)follow.textContent=ux('autoFollow');
  if($('#episodeLibrary'))$('#episodeLibrary').textContent=tt('episodes'); if($('#quizBtn'))updateQuizButton(); if($('#backCurrent'))$('#backCurrent').textContent=lang()==='bn'?'↩ বর্তমান শব্দে ফিরুন':lang()==='de'?'↩ Zum aktuellen Wort':'↩ Back to current word';
  updateLanguageButtons();}
function setUILanguage(next){
  AS.uiLanguage=["en","bn","de"].includes(next)?next:"en";
  save();
  updateStaticLanguage();
  updateSettingsUI();
  if(D)updateCourseNavigation();
  route();
}

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
    s.src=meta.dataScript+(meta.dataScript.includes('?')?'&':'?')+'v=20260915-playback1';
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
  if(meta.status!=='ready'){msg(`${courseTitle(id)} is prepared for a future course.`);return false}
  try{
    D=await loadCourseData(id);currentCourseId=id;AS.lastCourse=id;save();
    entryIndex=D.entry_index||{};epMap=Object.fromEntries(D.episodes.map(e=>[e.episode,e]));
    if(id==='b1'){
      const last=epMap[+courseState().lastEpisode||0];
      activeEpisodeSection=currentEp&&currentEp.section?currentEp.section:(last?.section||activeEpisodeSection||'core');
    }else activeEpisodeSection=null;
    populateSelect(activeEpisodeSection);updateCourseNavigation();updateHeaderProgress();updateEndBehaviorControl();updateStaticLanguage();return true;
  }catch(err){console.error(err);msg('Course data could not be loaded.');return false}
}

function applyPreferences(){
  document.documentElement.dataset.theme=AS.theme||'light';
  document.documentElement.dataset.textSize=AS.textSize||'normal';
  const themeBtn=$('#themeBtn');
  if(themeBtn)themeBtn.textContent=AS.theme==='dark'?tt('themeLight'):tt('themeDark');
  $$('.top-mini').forEach(b=>b.classList.remove('active'));
  const map={small:'#textSmaller',normal:'#textNormal',large:'#textLarger'};
  if(map[AS.textSize]&&$(map[AS.textSize]))$(map[AS.textSize]).classList.add('active');
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=AS.theme==='dark'?'#070c14':'#101827';
  const quizSound=$('#quizSoundToggle');
  if(quizSound)quizSound.checked=AS.quizSound!==false;
}
function showView(id){
  views.forEach(v=>$(v).classList.toggle('hidden',v!==id));
  $('#backCurrent').classList.add('hidden');
  setActiveNav(id);
  closeSidebar();
  updatePersistentPlayerVisibility();
}
function setActiveNav(view){
  $$('.side-link,.side-quiz-points').forEach(x=>x.classList.remove('active'));
  let nav=view==='#appHomeView'?'home':view==='#difficultView'?'difficult':view==='#quizHistoryView'?'quiz-history':view==='#courseHomeView'?'course':view==='#episodeView'?'course':'';
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
function adjacentEpisode(delta){
  if(!currentEp)return null;
  const list=episodesForSection(currentEp.section||activeEpisodeSection);
  const idx=list.findIndex(ep=>ep.episode===currentEp.episode);
  return idx>=0?(list[idx+delta]||null):null;
}
function moveEpisodeWithinSection(delta,seek=null){
  const target=adjacentEpisode(delta);
  if(target){openEpisode(target.episode,seek,true);return true}
  return false;
}
function updateEndBehaviorControl(){
  const mode=['repeat','next'].includes(AS.endBehavior)?AS.endBehavior:'stop';
  const btn=$('#endBehaviorControl');
  if(btn){
    btn.dataset.mode=mode;
    btn.classList.toggle('active',mode!=='stop');
    btn.setAttribute('aria-pressed',mode==='stop'?'false':'true');
    btn.title=mode==='stop'?endModeText('stop'):endModeText(mode);
    btn.setAttribute('aria-label',btn.title);
  }
}
function setEndBehavior(mode){
  if(!['stop','next','repeat'].includes(mode))mode='stop';
  AS.endBehavior=mode;
  AS.endBehaviorUiVersion=4;
  save();updateEndBehaviorControl();msg(endModeText(mode));
}
function cycleEndBehavior(){
  const current=['repeat','next'].includes(AS.endBehavior)?AS.endBehavior:'stop';
  const next=current==='stop'?'repeat':current==='repeat'?'next':'stop';
  setEndBehavior(next);
}
function settingsCopy(){
  if(lang()==='bn')return {title:'সেটিংস',kicker:'পছন্দসমূহ',language:'ভাষা',languageHint:'ইন্টারফেসের ভাষা',appearance:'থিম',appearanceHint:'লাইট / ডার্ক মোড',font:'ফন্ট সাইজ',fontHint:'ইন্টারফেসের লেখার আকার',quizSound:'কুইজ সাউন্ড',quizSoundHint:'সঠিক, ভুল ও পাসের সাউন্ড',install:'অ্যাপ ইনস্টল করুন',installHint:'Android, iPhone / iPad ও Windows',android:'Android',iphone:'iPhone / iPad',windows:'Windows',androidSteps:'Chrome খুলুন → ⋮ মেনু → Install app / Add to Home screen → Install',iphoneSteps:'Safari খুলুন → Share → Add to Home Screen → Open as Web App → Add',windowsSteps:'Chrome বা Edge খুলুন → address bar-এর Install আইকন / menu → Install',installNote:'ইনস্টল করলে অডিওবুকটি আলাদা অ্যাপের মতো Home Screen বা Desktop থেকে খুলবে।',feedback:'ফিডব্যাক',feedbackHint:'বাগ, পরামর্শ বা যেকোনো মন্তব্য পাঠান',feedbackIntro:'আপনি যা বলতে চান নিচে লিখুন।',feedbackPlaceholder:'এখানে আপনার ফিডব্যাক লিখুন...',feedbackSend:'ফিডব্যাক পাঠান',feedbackSending:'পাঠানো হচ্ছে…',feedbackSent:'✓ ধন্যবাদ! আপনার ফিডব্যাক পাঠানো হয়েছে।',feedbackEmpty:'প্রথমে আপনার ফিডব্যাক লিখুন।',feedbackDirect:'কোনো Google Forms পেজ খুলবে না।',app:'অ্যাপ',appHint:'ভার্সন ও আপডেট',version:`ভার্সন ${APP_VERSION}`,updated:`আপডেট: ১৫ সেপ্টেম্বর ২০২৬`,check:'আপডেট দেখুন',checking:'আপডেট দেখা হচ্ছে…',upToDate:'আপনি সর্বশেষ ভার্সন ব্যবহার করছেন।',available:'নতুন আপডেট পাওয়া গেছে।',updateTitle:'আপডেট পাওয়া গেছে',updateText:'নতুন ভার্সন প্রস্তুত। আপনার প্রগ্রেস, বুকমার্ক ও কুইজ স্কোর সংরক্ষিত থাকবে।',updateNow:'এখন আপডেট করুন',later:'পরে',settings:'সেটিংস',close:'সেটিংস বন্ধ করুন',browserAuto:'ওয়েব ভার্সন রিফ্রেশ করলে স্বয়ংক্রিয়ভাবে আপডেট হয়।'};
  if(lang()==='de')return {title:'Einstellungen',kicker:'PRÄFERENZEN',language:'Sprache',languageHint:'Sprache der Benutzeroberfläche',appearance:'Darstellung',appearanceHint:'Hell / Dunkel',font:'Schriftgröße',fontHint:'Textgröße der Oberfläche',quizSound:'Quiz-Töne',quizSoundHint:'Töne für richtig, falsch und bestanden',install:'App installieren',installHint:'Android, iPhone / iPad und Windows',android:'Android',iphone:'iPhone / iPad',windows:'Windows',androidSteps:'In Chrome öffnen → ⋮ Menü → App installieren / Zum Startbildschirm hinzufügen → Installieren',iphoneSteps:'In Safari öffnen → Teilen → Zum Home-Bildschirm → Als Web-App öffnen → Hinzufügen',windowsSteps:'In Chrome oder Edge öffnen → Installationssymbol in der Adressleiste / Menü → Installieren',installNote:'Nach der Installation lässt sich das Hörbuch wie eine eigene App vom Home-Bildschirm oder Desktop starten.',feedback:'Feedback',feedbackHint:'Fehler, Vorschläge oder andere Rückmeldungen senden',feedbackIntro:'Schreibe unten alles, was du uns mitteilen möchtest.',feedbackPlaceholder:'Feedback hier eingeben...',feedbackSend:'Feedback senden',feedbackSending:'Wird gesendet…',feedbackSent:'✓ Danke! Dein Feedback wurde gesendet.',feedbackEmpty:'Bitte schreibe zuerst dein Feedback.',feedbackDirect:'Es wird keine Google-Forms-Seite geöffnet.',app:'App',appHint:'Version und Updates',version:`Version ${APP_VERSION}`,updated:'Aktualisiert: 15. September 2026',check:'Nach Updates suchen',checking:'Suche nach Updates…',upToDate:'Du verwendest die aktuelle Version.',available:'Ein neues Update ist verfügbar.',updateTitle:'Update verfügbar',updateText:'Eine neue Version ist bereit. Fortschritt, Lesezeichen und Quiz-Ergebnisse bleiben erhalten.',updateNow:'Jetzt aktualisieren',later:'Später',settings:'Einstellungen',close:'Einstellungen schließen',browserAuto:'Die Webversion wird beim Aktualisieren automatisch aktualisiert.'};
  return {title:'Settings',kicker:'PREFERENCES',language:'Language',languageHint:'Interface language',appearance:'Appearance',appearanceHint:'Light / dark mode',font:'Font size',fontHint:'Interface text size',quizSound:'Quiz sounds',quizSoundHint:'Correct, wrong and celebration sounds',install:'Install app',installHint:'Android, iPhone / iPad and Windows',android:'Android',iphone:'iPhone / iPad',windows:'Windows',androidSteps:'Open in Chrome → ⋮ menu → Install app / Add to Home screen → Install',iphoneSteps:'Open in Safari → Share → Add to Home Screen → Open as Web App → Add',windowsSteps:'Open in Chrome or Edge → Install icon in the address bar / menu → Install',installNote:'After installation, the audiobook opens like a separate app from your Home Screen or desktop.',feedback:'Feedback',feedbackHint:'Send a bug report, suggestion or any comment',feedbackIntro:'Write anything you want to tell us.',feedbackPlaceholder:'Write your feedback here...',feedbackSend:'Send feedback',feedbackSending:'Sending…',feedbackSent:'✓ Thank you! Your feedback has been sent.',feedbackEmpty:'Please write your feedback first.',feedbackDirect:'No Google Forms page will open.',app:'App',appHint:'Version and updates',version:`Version ${APP_VERSION}`,updated:`Updated ${APP_UPDATED}`,check:'Check for updates',checking:'Checking for updates…',upToDate:'You are using the latest version.',available:'A new update is available.',updateTitle:'Update available',updateText:'A newer version is ready. Your progress, bookmarks and quiz scores will be kept.',updateNow:'Update now',later:'Later',settings:'Settings',close:'Close settings',browserAuto:'The web version updates automatically when you refresh.'};
}
function updateSettingsUI(){
  const s=settingsCopy();
  setText('#settingsTitle',s.title);setText('#settingsKicker',s.kicker);setText('#settingsLanguageLabel',s.language);setText('#settingsLanguageHint',s.languageHint);setText('#settingsAppearanceLabel',s.appearance);setText('#settingsAppearanceHint',s.appearanceHint);setText('#settingsFontLabel',s.font);setText('#settingsFontHint',s.fontHint);setText('#settingsQuizSoundLabel',s.quizSound);setText('#settingsQuizSoundHint',s.quizSoundHint);
  setText('#settingsInstallLabel',s.install);setText('#settingsInstallHint',s.installHint);setText('#installAndroidLabel',s.android);setText('#installIphoneLabel',s.iphone);setText('#installWindowsLabel',s.windows);setText('#installAndroidSteps',s.androidSteps);setText('#installIphoneSteps',s.iphoneSteps);setText('#installWindowsSteps',s.windowsSteps);setText('#installNote',s.installNote);
  setText('#settingsFeedbackLabel',s.feedback);setText('#settingsFeedbackHint',s.feedbackHint);setText('#feedbackIntro',s.feedbackIntro);setText('#feedbackDirect',s.feedbackDirect);const feedbackText=$('#feedbackText');if(feedbackText)feedbackText.placeholder=s.feedbackPlaceholder;const feedbackBtn=$('#feedbackSubmitBtn');if(feedbackBtn&&!feedbackBtn.disabled)feedbackBtn.textContent=s.feedbackSend;
  setText('#settingsAppLabel',s.app);setText('#settingsAppHint',s.appHint);setText('#appVersionText',s.version);setText('#appUpdatedText',s.updated);setText('#checkUpdateBtn',s.check);
  const checkBtn=$('#checkUpdateBtn');if(checkBtn)checkBtn.classList.toggle('hidden',!isInstalledApp());
  const updateStatus=$('#updateCheckStatus');if(updateStatus&&!isInstalledApp())updateStatus.textContent=s.browserAuto;
  setText('#updateNoticeTitle',s.updateTitle);setText('#updateNoticeText',s.updateText);setText('#updateNowBtn',s.updateNow);setText('#updateLaterBtn',s.later);
  const settingsBtn=$('#settingsBtn');if(settingsBtn){settingsBtn.title=s.settings;settingsBtn.setAttribute('aria-label',s.settings)}
  const close=$('#settingsClose');if(close)close.setAttribute('aria-label',s.close);
  applyPreferences();updateLanguageButtons();
}

let feedbackSubmissionPending=false;
let feedbackSubmissionTimer=null;
function finishFeedbackSubmission(){
  if(!feedbackSubmissionPending)return;
  feedbackSubmissionPending=false;
  clearTimeout(feedbackSubmissionTimer);
  const form=$('#feedbackForm'),btn=$('#feedbackSubmitBtn'),status=$('#feedbackStatus'),s=settingsCopy();
  if(form)form.reset();
  if(btn){btn.disabled=false;btn.textContent=s.feedbackSend}
  if(status){status.className='feedback-status success';status.textContent=s.feedbackSent}
}
function setupFeedbackForm(){
  const form=$('#feedbackForm'),text=$('#feedbackText'),btn=$('#feedbackSubmitBtn'),status=$('#feedbackStatus'),frame=$('#feedbackSubmitFrame');
  if(!form||!text||!btn||!status||!frame)return;
  form.addEventListener('submit',e=>{
    const value=text.value.trim(),s=settingsCopy();
    if(!value){e.preventDefault();status.className='feedback-status error';status.textContent=s.feedbackEmpty;text.focus();return}
    text.value=value;feedbackSubmissionPending=true;btn.disabled=true;btn.textContent=s.feedbackSending;status.className='feedback-status sending';status.textContent=s.feedbackSending;
    clearTimeout(feedbackSubmissionTimer);feedbackSubmissionTimer=setTimeout(finishFeedbackSubmission,1800);
  });
  frame.addEventListener('load',()=>{if(feedbackSubmissionPending)setTimeout(finishFeedbackSubmission,180)});
  text.addEventListener('input',()=>{if(status.classList.contains('error')){status.className='feedback-status';status.textContent=''}});
}

function setUpdateStatus(message){const el=$('#updateCheckStatus');if(el)el.textContent=message||''}
function showUpdateNotice(){
  if(!isInstalledApp())return;
  if(sessionStorage.getItem('gvaUpdateLater')==='1')return;
  updateSettingsUI();
  const n=$('#updateNotice');if(n)n.classList.remove('hidden');
  setUpdateStatus(settingsCopy().available);
}
function hideUpdateNotice(defer=false){
  const n=$('#updateNotice');if(n)n.classList.add('hidden');
  if(defer)sessionStorage.setItem('gvaUpdateLater','1');
}
function saveProgressBeforeUpdate(){
  if(currentEp&&Number.isFinite(audio.currentTime)){
    const S=courseState();S.positions[currentEp.episode]=audio.currentTime;S.maxPositions[currentEp.episode]=Math.max(+S.maxPositions[currentEp.episode]||0,audio.currentTime);save();
  }else save();
}
async function applyWaitingUpdate(){
  const reg=swRegistration||await navigator.serviceWorker?.getRegistration?.();
  if(!reg?.waiting){await checkForAppUpdate();return}
  saveProgressBeforeUpdate();
  if(!audio.paused)audio.pause();
  swReloading=true;
  reg.waiting.postMessage({type:'SKIP_WAITING'});
}
async function checkForAppUpdate(){
  const s=settingsCopy();
  if(!isInstalledApp()){
    try{const reg=swRegistration||await navigator.serviceWorker?.getRegistration?.();await reg?.update?.()}catch{}
    setUpdateStatus(s.browserAuto);
    return false;
  }
  setUpdateStatus(s.checking);
  if(!('serviceWorker'in navigator)){setUpdateStatus(s.upToDate);return false}
  try{
    const reg=swRegistration||await navigator.serviceWorker.getRegistration();
    if(!reg){setUpdateStatus(s.upToDate);return false}
    swRegistration=reg;
    sessionStorage.removeItem('gvaUpdateLater');
    await reg.update();
    await new Promise(r=>setTimeout(r,900));
    if(reg.waiting){showUpdateNotice();setUpdateStatus(s.available);return true}
    setUpdateStatus(s.upToDate);return false;
  }catch(err){console.warn('Update check failed',err);setUpdateStatus(s.upToDate);return false}
}
function watchServiceWorkerRegistration(reg){
  swRegistration=reg;
  if(reg.waiting&&navigator.serviceWorker.controller&&isInstalledApp())showUpdateNotice();
  reg.addEventListener('updatefound',()=>{
    const worker=reg.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed'&&navigator.serviceWorker.controller&&isInstalledApp()){sessionStorage.removeItem('gvaUpdateLater');showUpdateNotice()}
    });
  });
  clearInterval(updateCheckTimer);
  if(isInstalledApp())updateCheckTimer=setInterval(()=>reg.update().catch(()=>{}),30*60*1000);
}
function registerAppServiceWorker(){
  if(!('serviceWorker'in navigator)||location.protocol==='file:')return;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!swReloading){swReloading=true}
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg=>{
    watchServiceWorkerRegistration(reg);
    if(isInstalledApp())setTimeout(()=>reg.update().catch(()=>{}),2500);
  }).catch(err=>console.warn('Service worker registration failed',err));
  document.addEventListener('visibilitychange',()=>{if(isInstalledApp()&&document.visibilityState==='visible')swRegistration?.update().catch(()=>{})});
}
function openSettings(){updateSettingsUI();$('#settingsOverlay').classList.remove('hidden');document.body.classList.add('settings-open')}
function closeSettings(){$('#settingsOverlay').classList.add('hidden');document.body.classList.remove('settings-open')}

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
function statusLabel(ep){ let k=statusKey(ep); return k==='finished'?[`✓ ${tt('finished')}`,'done']:k==='in-progress'?[`◐ ${tt('inProgress')}`,'progressing']:[`○ ${tt('notStarted')}`,'']; }

function epDisplay(ep){return ep?.display_episode||ep?.episode||1}
function sectionMeta(id){return D?.sections?.find(s=>s.id===id)||null}
function episodeDisplayLabel(ep){ const n=String(epDisplay(ep)).padStart(2,'0'), episodeWord=tt('episodeLabel'); if(currentCourseId==='a1')return `${courseLabel('a1')} · ${episodeWord} ${n}`; if(currentCourseId==='a2')return `${courseLabel('a2')} · ${episodeWord} ${n}`; if(currentCourseId==='technical')return `${courseLabel('technical')} · ${episodeWord} ${n}`; if(currentCourseId==='b1'&&ep.section==='advanced')return `${tt('b1adv')} · ${episodeWord} ${n}`; if(currentCourseId==='b1'&&ep.section==='core')return `${tt('b1core')} · ${episodeWord} ${n}`; return `${episodeWord} ${n}`; }
function episodeBrowserTitle(){ if(currentCourseId==='a1')return courseLabel('a1'); if(currentCourseId==='a2')return courseLabel('a2'); if(currentCourseId==='technical')return courseLabel('technical'); if(currentCourseId==='b1')return `${tt('b1core')} & ${tt('b1adv')}`; return courseTitle(currentCourseId)||tt('episodes'); }
function sectionDisplayTitle(sec){ if(currentCourseId==='a1')return courseLabel('a1'); if(currentCourseId==='a2')return courseLabel('a2'); if(currentCourseId==='technical')return courseLabel('technical'); if(currentCourseId==='b1'&&sec.id==='core')return tt('b1core'); if(currentCourseId==='b1'&&sec.id==='advanced')return tt('b1adv'); return sec.title; }
function sectionDisplayKicker(sec){
  if(currentCourseId==='technical')return 'TECH';
  if(currentCourseId==='b1')return sec.id==='advanced'?'B1+':'B1';
  return COURSE_META[currentCourseId]?.short||'';
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
  const meta=COURSE_META[id];
  if(!data)return {done:0,total:meta?.totalWords||0};
  const st=cs(id);
  return {done:progressWords(data,st),total:data.total_words||meta?.totalWords||0};
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
    label.textContent=tt('allCourses');
    wordsEl.textContent=p.total?`${p.done} / ${p.total}`:tt('noCourseData');
    return;
  }
  const words=progressWords(), total=D.total_words||0, pct=total?Math.round(100*words/total):0, meta=COURSE_META[currentCourseId];
  ring.style.setProperty('--pct',pct); pctEl.textContent=`${pct}%`; label.textContent=`${meta.short} ${tt('progress')}`; wordsEl.textContent=`${words} / ${total}`;
}

function quizAttempts(st,episodeId){
  const arr=st?.quizHistory?.[String(episodeId)];
  return Array.isArray(arr)?arr.slice(0,3):[];
}
function quizBestFromAttempts(st,episodeId){
  const arr=quizAttempts(st,episodeId);
  return arr.length?Math.max(...arr.map(a=>Math.max(0,Math.min(QUIZ_COUNT,+a.score||0)))):0;
}
function syncQuizBestFromHistory(st,episodeId){
  st.quizBest=st.quizBest||{};
  const id=String(episodeId),best=quizBestFromAttempts(st,id);
  if(best>0)st.quizBest[id]=best;else delete st.quizBest[id];
  return best;
}
function quizSummaryFor(courseId=currentCourseId,data=(courseId===currentCourseId?D:loaded[courseId])){
  const st=cs(courseId);
  const episodeIds=data?.episodes?.map(ep=>String(ep.episode))||Object.keys(st.quizHistory||{});
  let points=0,passed=0;
  for(const id of episodeIds){
    const score=quizBestFromAttempts(st,id);
    points+=score;
    if(score>=QUIZ_PASS)passed++;
  }
  const totalEpisodes=data?.episodes?.length||COURSE_META[courseId]?.episodes||0;
  return {points,max:totalEpisodes*QUIZ_COUNT,passed,totalEpisodes};
}
function updateCourseQuizPoints(){
  if(!currentCourseId)return;
  const q=quizSummaryFor(currentCourseId,D);
  if($('#sideQuizPoints'))$('#sideQuizPoints').textContent=`${q.points} / ${q.max}`;
  if($('#courseQuizPoints'))$('#courseQuizPoints').textContent=`${q.points} / ${q.max}`;
}
let quizHistoryFilter='all',quizHistorySection='all';
function attemptDate(at){
  if(!at)return'';
  try{return new Intl.DateTimeFormat(lang()==='de'?'de-DE':lang()==='bn'?'bn-BD':'en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(at))}catch{return''}
}
function openStoredQuizResult(episodeId,attempt){
  const ep=epMap[+episodeId];if(!ep||!attempt)return;
  quizState={finished:true,history:true,episode:+episodeId,score:+attempt.score||0,review:Array.isArray(attempt.review)?attempt.review:[],legacy:!!attempt.legacy,attempt};
  $('#quizOverlay').classList.remove('hidden');document.body.classList.add('quiz-open');renderQuizResult();
}
function renderQuizHistory(){
  if(!D)return;
  const st=courseState(),host=$('#quizHistoryList');if(!host)return;
  setText('#quizHistoryEyebrow',`${COURSE_META[currentCourseId]?.short||''} ${qh('title').toUpperCase()}`);
  setText('#quizHistoryTitle',qh('title'));setText('#quizHistorySubtitle',qh('subtitle'));setText('#quizHistoryLocalNote',qh('savedLocally'));
  const allBtn=$('#quizHistoryAll'),attemptedBtn=$('#quizHistoryAttempted');if(allBtn)allBtn.textContent=qh('allEpisodes');if(attemptedBtn)attemptedBtn.textContent=qh('attemptedOnly');
  if(allBtn)allBtn.classList.toggle('active',quizHistoryFilter==='all');if(attemptedBtn)attemptedBtn.classList.toggle('active',quizHistoryFilter==='attempted');
  const sections=$('#quizHistorySections');
  if(sections){
    sections.classList.toggle('hidden',currentCourseId!=='b1');
    if(currentCourseId==='b1')sections.innerHTML=`<button class="chip ${quizHistorySection==='all'?'active':''}" data-qh-section="all">${esc(qh('allSections'))}</button><button class="chip ${quizHistorySection==='core'?'active':''}" data-qh-section="core">${esc(qh('core'))}</button><button class="chip ${quizHistorySection==='advanced'?'active':''}" data-qh-section="advanced">${esc(qh('advanced'))}</button>`;
  }
  let eps=D.episodes.filter(ep=>(quizHistorySection==='all'||currentCourseId!=='b1'||ep.section===quizHistorySection));
  if(quizHistoryFilter==='attempted')eps=eps.filter(ep=>quizAttempts(st,ep.episode).length);
  host.innerHTML=eps.length?eps.map(ep=>{
    const attempts=quizAttempts(st,ep.episode),best=attempts.length?Math.max(...attempts.map(a=>+a.score||0)):null,latest=attempts[0]?.score;
    const attemptHtml=attempts.length?attempts.map((a,i)=>`<button type="button" class="quiz-history-attempt" data-qh-ep="${ep.episode}" data-qh-attempt="${i}"><span>${a.legacy?esc(qh('previousBest')):(i===0?esc(qh('newest')):`${esc(qh('attempt'))} ${i+1}`)}</span><strong>${Math.max(0,Math.min(QUIZ_COUNT,+a.score||0))}/${QUIZ_COUNT}</strong>${a.at?`<small>${esc(attemptDate(a.at))}</small>`:''}</button>`).join(''):`<div class="quiz-history-empty">${esc(qh('notAttempted'))}</div>`;
    return `<article class="quiz-history-episode"><div class="quiz-history-episode-head"><div><strong>${esc(episodeDisplayLabel(ep))}</strong><small>${fmt(ep.duration)} · ${ep.word_count} ${tt('words')}</small></div><div class="quiz-history-summary"><span>${esc(qh('best'))}<b>${best==null?'—':`${best}/${QUIZ_COUNT}`}</b></span><span>${esc(qh('latest'))}<b>${latest==null?'—':`${latest}/${QUIZ_COUNT}`}</b></span><span>${esc(qh('attempts'))}<b>${attempts.length}/3</b></span></div></div><div class="quiz-history-attempts">${attemptHtml}</div></article>`;
  }).join(''):`<div class="quiz-history-no-results">${esc(qh('noEpisodes'))}</div>`;
  $$('[data-qh-section]').forEach(b=>b.onclick=()=>{quizHistorySection=b.dataset.qhSection;renderQuizHistory()});
  $$('.quiz-history-attempt').forEach(b=>b.onclick=()=>{const arr=quizAttempts(st,b.dataset.qhEp);openStoredQuizResult(+b.dataset.qhEp,arr[+b.dataset.qhAttempt])});
  updateCourseQuizPoints();
}
async function openQuizHistory(courseId=currentCourseId){
  if(!(await activateCourse(courseId)))return;
  showView('#quizHistoryView');location.hash=`quiz-history-${currentCourseId}`;renderQuizHistory();updateHeaderProgress();
}

function updateCourseNavigation(){
  const meta=COURSE_META[currentCourseId];
  $('#navCourse').innerHTML=`<span>▶</span> ${esc(courseLabel(currentCourseId))}`;
  $('#navDifficult').title=`${meta.short} ${tt('difficultWords')}`;
  $('#navDifficult').innerHTML=`<span>★</span> ${esc(tt('difficultWords'))} <em id="sideBookmarkCount">${courseState().bookmarks.length}</em>`;
  const core=$('#navCore'); if(core)core.innerHTML=`<span>1</span> ${tt('b1core')}`;
  const adv=$('#navAdvanced'); if(adv)adv.innerHTML=`<span>+</span> ${tt('b1adv')}`;
  $$('.course-side').forEach(b=>{ b.classList.toggle('active-course',b.dataset.course===currentCourseId); const dot=b.querySelector('.course-dot')?.outerHTML||''; b.innerHTML=dot+`<span>${esc(courseLabel(b.dataset.course))}</span>`; });
  updateCourseQuizPoints(); if($('#navCore'))$('#navCore').classList.toggle('hidden',currentCourseId!=='b1'); if($('#navAdvanced'))$('#navAdvanced').classList.toggle('hidden',currentCourseId!=='b1'); updateStaticLanguage();
}

function renderAppHome(){
  showView('#appHomeView');location.hash='home';
  $('#courseGrid').innerHTML=COURSE_LIST.map(c=>{ let progressHtml='',action=''; if(c.status==='ready'&&loaded[c.id]){ const st=cs(c.id),data=loaded[c.id],words=progressWords(data,st),p=Math.round(100*words/data.total_words),q=quizSummaryFor(c.id,data); progressHtml=`<div class="course-card-meta"><span>${words} / ${data.total_words} ${tt('words')}</span><span>${p}%</span></div><div class="thinbar"><i style="width:${p}%"></i></div><div class="course-quiz-meta">${tt('quiz')} ${q.points} / ${q.max} · ${q.passed}/${q.totalEpisodes} ${tt('passedWord')}</div>`; action=`<span class="coming-tag">${tt('openCourse')}</span>`; }else if(c.status==='ready'){ const q=quizSummaryFor(c.id,null); progressHtml=`<div class="course-card-meta"><span>${tt('progressLoads')}</span><span></span></div><div class="thinbar"><i style="width:0"></i></div><div class="course-quiz-meta">${tt('quiz')} ${q.points} / ${q.max} · ${q.passed}/${q.totalEpisodes} ${tt('passedWord')}</div>`; action=`<span class="coming-tag">${tt('openCourse')}</span>`; }else{ progressHtml=`<div class="course-card-meta"><span>${tt('structurePrepared')}</span><span></span></div>`; action=`<span class="coming-tag">${tt('comingSoon')}</span>`; } return `<article class="course-card ${c.status==='ready'?'ready':''} ${c.id==='technical'?'tech':''}" data-course="${c.id}"><div class="course-card-head"><div class="course-card-badge">${esc(c.short)}</div>${action}</div><h3>${esc(courseTitle(c.id))}</h3><p>${esc(courseDescription(c.id))}</p><div class="course-card-footer">${progressHtml}</div></article>` }).join('');
  $$('.course-card[data-course]').forEach(card=>card.onclick=()=>openCourse(card.dataset.course));
  updateHeaderProgress();updateStaticLanguage();
}
async function openCourse(id='b1',sectionToOpen=null){
  if(!(await activateCourse(id)))return;
  const meta=COURSE_META[id],S=courseState(),words=progressWords(),p=Math.round(100*words/D.total_words);
  $('#courseEyebrow').textContent=`${meta.short} ${ux('audioCourse')}`; $('#courseTitle').textContent=courseTitle(id); $('#courseDescription').textContent=courseDescription(id); $('#courseWords').textContent=D.total_words.toLocaleString(); $('#courseEpisodes').textContent=D.episodes.length; $('#courseProgressText').textContent=`${p}%`; $('#courseProgressInline').textContent=`${words} / ${D.total_words} ${tt('words')} · ${p}%`; $('#courseProgressFill').style.width=`${p}%`; updateCourseQuizPoints();
  const browserTitle=$('#episodeBrowserTitle'); if(browserTitle)browserTitle.textContent=episodeBrowserTitle(); $('#bookmarkCount').textContent=S.bookmarks.length; $('#sideBookmarkCount').textContent=S.bookmarks.length;
  let le=+S.lastEpisode||1,pos=+S.positions[le]||0,lastEp=epMap[le]||D.episodes[0],lastLabel=episodeDisplayLabel(lastEp); $('#continueBtn').textContent=pos>5?`${tt('continueWord')} ${lastLabel} · ${fmt(pos)}`:`${tt('startWord')} ${lastLabel}`; $('#continueSummary').textContent=pos>5?tt('lastPosition',{label:lastLabel,time:fmt(pos)}):tt('savedAutomatically');
  libraryOpenSections=new Set(sectionToOpen?[sectionToOpen]:[]); if(id==='b1'&&sectionToOpen)setActiveEpisodeSection(sectionToOpen); else if(id==='b1')setActiveEpisodeSection(currentEp?.section||activeEpisodeSection||'core'); else setActiveEpisodeSection(null);
  renderEpisodeGrid(); $('#searchInput').value='';$('#searchPanel').classList.add('hidden');$('#bookmarksPanel').classList.add('hidden');$('#bookmarksBtn').classList.remove('active'); showView('#courseHomeView');location.hash=`course-${id}`;updateHeaderProgress();refreshBookmarkCounts();renderCourseBookmarkPanel();updatePersistentPlayerVisibility();updateStaticLanguage();
}

function episodeCardHtml(ep){ let p=pct(ep),st=statusLabel(ep),cw=completedWords(ep); const isCurrent=!!(currentEp&&playerHasStarted&&currentEp.episode===ep.episode); const currentState=isCurrent?(audio.paused?[`● ${ux('current')}`,'current-now']:[`▶ ${ux('playing')}`,'playing-now']):st; return `<article class="episode-card ${ep.section==='advanced'?'advanced':''} ${isCurrent?'current-episode':''}" data-ep="${ep.episode}"><div class="ephead"><span class="epnum">${tt('episodeLabel')} ${String(epDisplay(ep)).padStart(2,'0')}</span><span class="status ${currentState[1]}">${currentState[0]}</span></div><div class="epmeta">${fmt(ep.duration)} · ${cw} / ${ep.word_count} ${tt('words')}</div><div class="epbar"><i style="width:${p}%"></i></div><div class="epwords">${esc(ep.first_word)} → ${esc(ep.last_word)}</div></article>` }

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
function renderEpisodeGrid(){ if(!D||!$('#episodeGrid'))return; const filtered=D.episodes.filter(ep=>libraryFilter==='all'||statusKey(ep)===libraryFilter); let html=''; if(D.sections?.length){ for(const sec of D.sections){ const eps=filtered.filter(ep=>ep.section===sec.id); const p=sectionProgress(sec.id),isOpen=libraryOpenSections.has(sec.id); html+=`<section class="library-section ${sec.id==='advanced'?'advanced':''} ${isOpen?'is-open':''}" id="library-section-${sec.id}"><button type="button" class="library-section-head" data-section-toggle="${sec.id}" aria-expanded="${isOpen?'true':'false'}"><div><span class="section-kicker">${esc(sectionDisplayKicker(sec))}</span><h2>${esc(sectionDisplayTitle(sec))}</h2><p>${sec.episodes} ${tt('episodes')} · ${sec.total_words.toLocaleString()} ${tt('words')}</p></div><div class="library-section-head-right"><strong>${p.pct}%</strong><span class="section-chevron" aria-hidden="true">⌄</span></div></button><div class="library-section-body ${isOpen?'':'hidden'}"><div class="episode-grid-inner">${eps.length?eps.map(episodeCardHtml).join(''):`<div class="empty-state">${ux('sectionEmpty')}</div>`}</div></div></section>`; } } else html=filtered.map(episodeCardHtml).join(''); $('#episodeGrid').innerHTML=html||`<div class="empty-state">${ux('episodesEmpty')}</div>`; applyLibraryLayout(); $$('[data-section-toggle]').forEach(x=>x.onclick=()=>toggleLibrarySection(x.dataset.sectionToggle)); $$('.episode-card').forEach(x=>x.onclick=()=>openEpisode(+x.dataset.ep,null,true)); }
function bookmarksHtml(){
  const S=courseState();
  if(!S.bookmarks.length)return `<b>${ux('noBookmarks')}</b><p>${ux('bookmarkHelp')}</p>`;
  return `<div class="section-head"><h2>${ux('myBookmarks',{n:S.bookmarks.length})}</h2><button class="text-btn danger clear-bookmarks">${ux('clearBookmarks')}</button></div>`+
    S.bookmarks.map(id=>{
      let x=entryIndex[id];if(!x)return'';
      let full=epMap[x.episode]?.entries.find(e=>e.entry_id===id);
      return `<div class="bookmark-row"><div><b>${esc(x.german)}</b> — ${esc(x.english)}
        <small>${esc(episodeDisplayLabel(epMap[x.episode]))}${full?` · ${esc(difficultyLabel(full.difficulty))} · ${esc(typeLabel(full.type))}`:''}</small></div>
        <div class="row-actions"><button class="mini review" data-id="${id}">▶ ${ux('review')}</button><button class="mini openword" data-id="${id}">${ux('open')}</button><button class="mini removebm" data-id="${id}">✕</button></div></div>`
    }).join('');
}
function bindBookmarkPanel(container,fromCourse=false){
  container.querySelectorAll('.review').forEach(b=>b.onclick=()=>reviewBookmark(b.dataset.id));
  container.querySelectorAll('.openword').forEach(b=>b.onclick=()=>{let x=entryIndex[b.dataset.id];openEpisode(x.episode,x.start,false,null,x.entry_id)});
  container.querySelectorAll('.removebm').forEach(b=>b.onclick=()=>toggleBookmark(b.dataset.id,true));
  const c=container.querySelector('.clear-bookmarks');
  if(c)c.onclick=()=>{if(confirm(ux('clearConfirm'))){courseState().bookmarks=[];save();refreshBookmarkCounts();renderDifficultPanel();if(fromCourse)renderCourseBookmarkPanel(true)}}
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
  msg(i>=0?ux('bookmarkRemoved'):ux('bookmarkSaved'))
}
function reviewBookmark(id){let x=entryIndex[id];openEpisode(x.episode,x.start,true,x.end,x.entry_id)}

function search(){
  if(!D)return;
  const q=$('#searchInput').value.trim().toLowerCase(),p=$('#searchPanel');
  if(!q){p.classList.add('hidden');return}
  let out=[];outer:for(const ep of D.episodes){for(const e of ep.entries){
    if(e.german.toLowerCase().includes(q)||e.english.toLowerCase().includes(q)){out.push(e);if(out.length>=80)break outer}
  }}
  p.innerHTML=`<div class="search-summary"><b>${ux('searchResults',{n:out.length,plus:out.length===80?'+':''})}</b><span>${ux('forQuery',{q:esc(q)})}</span></div>`+
    (out.length?out.map(e=>`<div class="result-row clickable" data-id="${e.entry_id}"><div><b>${esc(e.german)}</b> — ${esc(e.english)}
    <small>${esc(episodeDisplayLabel(epMap[e.episode]))} · ${ux('word')} ${e.position}</small></div><button class="mini searchopen" data-id="${e.entry_id}">${ux('open')}</button></div>`).join(''):`<p>${ux('noMatching')}</p>`);
  p.classList.remove('hidden');$('#bookmarksPanel').classList.add('hidden');$('#bookmarksBtn').classList.remove('active');
  $$('.result-row[data-id]').forEach(r=>r.onclick=ev=>{if(!ev.target.closest('button'))openSearchResult(r.dataset.id)});
  $$('.searchopen').forEach(b=>b.onclick=()=>openSearchResult(b.dataset.id));
}
function openSearchResult(id){let x=entryIndex[id];openEpisode(x.episode,x.start,false,null,id)}

function currentEntry(){
  if(!currentEp)return null;let t=audio.currentTime||0,a=currentEp.entries,lo=0,hi=a.length-1,ans=0;
  while(lo<=hi){let m=(lo+hi)>>1;if(a[m].start<=t){ans=m;lo=m+1}else hi=m-1}return a[ans]
}
function updateWordProgress(){if(!currentEp)return;let e=currentEntry();$('#wordProgress').textContent=e?`${e.position} / ${currentEp.word_count} ${tt('words')}`:`0 / ${currentEp.word_count} ${tt('words')}`}
function updateStars(){
  if(!currentEp)return;const S=courseState();
  $$('.bookmark-card').forEach(b=>{let on=S.bookmarks.includes(b.dataset.id);b.classList.toggle('marked',on);b.textContent=on?'★':'☆'});
  let e=currentEntry(),marked=e&&S.bookmarks.includes(e.entry_id);
  $('#currentBookmark').textContent=marked?'★':'☆';$('#currentBookmark').classList.toggle('marked',!!marked);
  $('#lyricsStar').textContent=marked?`★ ${ux('bookmarkedWords')}`:tt('difficultWordBtn');$('#lyricsStar').classList.toggle('marked',!!marked)
}
function line(ev,cls,label,text,en=false){
  if(!ev)return'';return `<div class="line ${cls}${en?' english':''}" data-event="${ev.id}" data-start="${ev.start}">
    <span class="smalllabel">${esc(label)}</span><span class="actual-text">${esc(text)}</span></div>`
}
function renderTranscript(){
  const S=courseState(),normal=$('#normalView'),lyrics=$('#lyricsView');
  let byBlock={},evByEntry={};currentEp.entries.forEach(e=>(byBlock[e.block]??=[]).push(e));currentEp.events.forEach(e=>(evByEntry[e.entry_id]??=[]).push(e));let h='';
  for(const rb of currentEp.recall_blocks){
    h+=`<div class="block-title">${ux('learningBlock',{n:rb.block})}</div>`;
    for(const e of byBlock[rb.block]){
      let evs=evByEntry[e.entry_id]||[],deex=evs.filter(x=>x.kind==='de_example'),enex=evs.filter(x=>x.kind==='en_example');
      h+=`<section class="vocab-card" id="entry-${e.entry_id}"><div class="card-meta"><span class="badge">#${e.position}</span><span class="badge ${e.difficulty}">${esc(difficultyLabel(e.difficulty))}</span><span class="badge">${esc(typeLabel(e.type))}</span>
      <button class="bookmark-card ${S.bookmarks.includes(e.entry_id)?'marked':''}" data-id="${e.entry_id}">${S.bookmarks.includes(e.entry_id)?'★':'☆'}</button></div>
      ${line(evs.find(x=>x.kind==='de_word'),'de-word',ux('germanWordTwice'),e.german)}
      ${line(evs.find(x=>x.kind==='en_meaning'),'en-meaning',ux('englishMeaning'),e.english,true)}
      ${e.grammar?line(evs.find(x=>x.kind==='grammar'),'grammar',ux('grammarForms'),e.grammar):''}<div class="example-wrap">`;
      e.examples.forEach((ex,i)=>{h+=line(deex[i],'de-example',ux('germanExample',{n:i+1}),ex.de)+line(enex[i],'en-example',ux('englishTranslation',{n:i+1}),ex.en,true)});
      h+='</div></section>'
    }
    h+=`<section class="recall-card"><h3>${ux('recallAfter',{n:rb.block})}</h3>`;
    (rb.de_en||[]).forEach(id=>{let evs=evByEntry[id]||[],p=evs.find(x=>x.kind==='recall_de_prompt'),a=evs.find(x=>x.kind==='recall_en_answer'),x=entryIndex[id];
      h+=`<div class="recall-item">${line(p,'de-example',ux('deEnRecall'),x.german)}<div class="line en-example english recall-answer auto-hidden" data-event="${a.id}" data-start="${a.start}" data-answer="${a.start}"><span class="smalllabel">${ux('answer')}</span><span class="actual-text">${esc(x.english)}</span></div></div>`});
    (rb.en_de||[]).forEach(id=>{let evs=evByEntry[id]||[],p=evs.find(x=>x.kind==='recall_en_prompt'),a=evs.find(x=>x.kind==='recall_de_answer'),x=entryIndex[id];
      h+=`<div class="recall-item">${line(p,'en-example',ux('enDeRecall'),x.english,true)}<div class="line de-example recall-answer auto-hidden" data-event="${a.id}" data-start="${a.start}" data-answer="${a.start}"><span class="smalllabel">${ux('answer')}</span><span class="actual-text">${esc(x.german)}</span></div></div>`});
    h+='</section>'
  }
  normal.innerHTML=h;
  $$('.bookmark-card').forEach(b=>b.onclick=()=>toggleBookmark(b.dataset.id));
  $$('.line[data-start]').forEach(el=>el.onclick=e=>{
    if(el.classList.contains('recall-answer')&&el.classList.contains('auto-hidden')){manualRecall.add(el.dataset.event);el.classList.add('revealed');e.stopPropagation();return}
    if(el.classList.contains('english')&&el.classList.contains('hidden-en')){manualEnglish.add(el.dataset.event);el.classList.add('user-revealed');applyEnglishVisibility(audio.currentTime||0);e.stopPropagation();return}
    audio.currentTime=+el.dataset.start;msg(ux('jumpedTo',{time:fmt(audio.currentTime)}))
  });
  applyMode()
}
function label(ev){return({de_word:'German word',en_meaning:ux('englishMeaning'),grammar:ux('grammarForms'),de_example:'German example · spoken twice',en_example:'English translation',recall_de_prompt:'Recall · German → English · think 4 seconds',recall_en_answer:'Recall answer',recall_en_prompt:'Recall · English → German · think 4 seconds',recall_de_answer:'Recall answer'})[ev.kind]||''}
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
  if(segmentStop&&t>=segmentStop){setPlaybackIntent(false);audio.pause();segmentStop=null;$('#playerNote').textContent=ux('reviewFinished');msg(ux('reviewComplete'))}
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


let playbackRequested=false;
let resumeWhenReady=false;
let recoveryTimer=null;
let recoveryAttempts=0;
let mediaPositionTick=0;

function clearPlaybackRecovery(){
  if(recoveryTimer){clearTimeout(recoveryTimer);recoveryTimer=null;}
}
function playbackNote(text){
  const el=$('#playerNote');if(el&&text)el.textContent=text;
}
function setPlaybackIntent(value){
  playbackRequested=!!value;
  if(!playbackRequested){resumeWhenReady=false;clearPlaybackRecovery();recoveryAttempts=0;}
}
function safePlay(reason='play',allowRecovery=true){
  if(!currentEp)return Promise.resolve(false);
  playbackRequested=true;
  let result;
  try{result=audio.play()}catch(err){result=Promise.reject(err)}
  if(!result||typeof result.then!=='function')return Promise.resolve(true);
  return result.then(()=>{
    resumeWhenReady=false;clearPlaybackRecovery();recoveryAttempts=0;
    return true;
  }).catch(err=>{
    console.warn('[GVA playback]',reason,err?.name||err,err?.message||'');
    resumeWhenReady=true;
    if(err?.name==='NotAllowedError'){
      playbackNote(lang()==='bn'?'Android/Chrome প্লেব্যাক থামিয়েছে। আবার Play চাপুন।':lang()==='de'?'Android/Chrome hat die Wiedergabe angehalten. Bitte Play erneut drücken.':'Android/Chrome paused playback. Tap Play to resume.');
      return false;
    }
    if(allowRecovery)schedulePlaybackRecovery(reason,1800);
    return false;
  });
}
function pauseByUser(){
  setPlaybackIntent(false);
  audio.pause();
}
function schedulePlaybackRecovery(reason='network',delay=6000){
  if(!playbackRequested||!currentEp||audio.ended||recoveryTimer)return;
  recoveryTimer=setTimeout(()=>{
    recoveryTimer=null;
    if(!playbackRequested||!currentEp||audio.ended)return;
    recoverAudioStream(reason);
  },delay);
}
function recoverAudioStream(reason='network'){
  if(!playbackRequested||!currentEp)return;
  if(recoveryAttempts>=3){
    playbackNote(lang()==='bn'?'অডিও সংযোগ থেমে গেছে। Play চাপলে আবার চেষ্টা হবে।':lang()==='de'?'Die Audioverbindung wurde unterbrochen. Mit Play erneut versuchen.':'Audio connection was interrupted. Tap Play to retry.');
    return;
  }
  recoveryAttempts++;
  const pos=Math.max(0,audio.currentTime||+courseState().positions[currentEp.episode]||0);
  const src=audio.currentSrc||audio.getAttribute('src');
  if(!src)return;
  console.warn('[GVA playback] reconnecting',reason,'attempt',recoveryAttempts,'at',pos);
  pendingSeek=pos;
  resumeWhenReady=true;
  try{audio.pause();audio.src=src;audio.load();}catch(err){console.warn('[GVA playback] reconnect failed',err)}
  updateMediaSessionMetadata();
}
function updateMediaSessionPosition(force=false){
  if(!('mediaSession' in navigator)||!currentEp||!navigator.mediaSession.setPositionState)return;
  const now=Date.now();if(!force&&now-mediaPositionTick<3000)return;mediaPositionTick=now;
  const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:+currentEp.duration||0;
  const position=Math.min(Math.max(0,audio.currentTime||0),Math.max(0,duration-.001));
  if(!(duration>0))return;
  try{navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate||1,position})}catch{}
}

function updateMediaSessionMetadata(){
  if(!('mediaSession' in navigator)||!currentEp)return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({
      title:episodeDisplayLabel(currentEp),
      artist:tt('brand'),
      album:courseTitle(currentCourseId)||tt('brand'),
      artwork:[
        {src:'logo-pwa-192-v4.png',sizes:'192x192',type:'image/png'}
      ]
    });
  }catch{}
}
function setupMediaSession(){
  if(!('mediaSession' in navigator))return;
  const set=(action,handler)=>{try{navigator.mediaSession.setActionHandler(action,handler)}catch{}};
  set('play',()=>{setPlaybackIntent(true);safePlay('media-session-play')});
  set('pause',()=>pauseByUser());
  set('nexttrack',()=>{
    setPlaybackIntent(true);
    if(!moveEpisodeWithinSection(1,0))msg(ux('noNextEpisode'));
  });
  set('previoustrack',()=>{
    setPlaybackIntent(true);
    if(!moveEpisodeWithinSection(-1,0)){
      audio.currentTime=0;sync(true);updateMediaSessionPosition(true);
    }
  });
  set('seekbackward',d=>{
    const amount=d?.seekOffset||10;
    audio.currentTime=Math.max(0,(audio.currentTime||0)-amount);
    sync(true);updateMediaSessionPosition(true);
  });
  set('seekforward',d=>{
    const amount=d?.seekOffset||10;
    audio.currentTime=Math.min(currentEp?.duration||audio.duration||0,(audio.currentTime||0)+amount);
    sync(true);updateMediaSessionPosition(true);
  });
}
function handleEpisodeEnded(){
  if(!currentEp)return;
  const S=courseState();
  S.completed[currentEp.episode]=true;
  S.positions[currentEp.episode]=currentEp.duration;
  S.maxPositions[currentEp.episode]=currentEp.duration;
  save();updateHeaderProgress();updatePersistentPlayerVisibility();
  const mode=['repeat','next'].includes(AS.endBehavior)?AS.endBehavior:'stop';
  if(mode==='repeat'){
    setPlaybackIntent(true);
    audio.currentTime=0;
    updateMediaSessionMetadata();updateMediaSessionPosition(true);
    safePlay('episode-repeat');
    msg(endModeText('repeat'));
    return;
  }
  if(mode==='next'){
    setPlaybackIntent(true);
    const target=adjacentEpisode(1);
    if(target){msg(endModeText('next'));openEpisode(target.episode,0,true);return;}
    setPlaybackIntent(false);
    msg(lang()==='bn'?'এপিসোড শেষ ✓ · সেকশনের শেষ':lang()==='de'?'Episode beendet ✓ · Abschnittsende':'Episode completed ✓ · End of section');
    return;
  }
  setPlaybackIntent(false);
  msg(lang()==='bn'?'এপিসোড শেষ ✓ · প্লেব্যাক বন্ধ':lang()==='de'?'Episode beendet ✓ · Wiedergabe gestoppt':'Episode completed ✓ · Playback stopped');
}


function shuffleCopy(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function quizIsAvailable(){
  return !!(currentEp&&D&&quizEligibleEntries().length>=QUIZ_COUNT);
}
function updateQuizButton(){ const btn=$('#quizBtn'); if(!btn)return; const available=quizIsAvailable(); btn.classList.toggle('hidden',!available); if(!available)return; const best=quizBestFromAttempts(courseState(),currentEp.episode); btn.textContent=best>0?`${tt('quiz')} · ${tt('best')} ${best}/${QUIZ_COUNT}`:tt('quiz'); }
function normalizedQuizGerman(s){
  return String(s||'').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
}
function normalizedQuizEnglish(s){
  return String(s||'').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
}

function quizGrammarLabel(entry){
  const g=String(entry?.grammar||'').trim();
  if(!g)return'';
  // For verbs the grammar field often starts with the infinitive again.
  // Show only the additional forms so the question reads:
  // gehen (geht, ging, ist gegangen)
  if(entry?.type==='verb'){
    const parts=g.split(',').map(x=>x.trim()).filter(Boolean);
    const base=normalizedQuizGerman(entry.german);
    if(parts.length>1&&normalizedQuizGerman(parts[0])===base)return parts.slice(1).join(', ');
  }
  return g;
}

function quizEligibleEntries(){
  if(!currentEp||!D)return[];
  const meanings=new Map();
  for(const ep of D.episodes){
    for(const e of ep.entries||[]){
      const g=normalizedQuizGerman(e.german);
      const en=normalizedQuizEnglish(e.english);
      if(!g||!en)continue;
      if(!meanings.has(g))meanings.set(g,new Set());
      meanings.get(g).add(en);
    }
  }
  return (currentEp.entries||[]).filter(e=>{
    const g=normalizedQuizGerman(e.german),en=normalizedQuizEnglish(e.english);
    return g&&en&&meanings.get(g)?.size===1;
  });
}
function quizDistractors(correct,pool){
  const correctMeaning=normalizedQuizEnglish(correct.english);
  const unique=(items,used=new Set())=>{
    const out=[];
    for(const e of items){
      const m=normalizedQuizEnglish(e.english);
      if(!m||m===correctMeaning||used.has(m))continue;
      used.add(m);out.push(e);
    }
    return out;
  };
  const used=new Set();
  const sameType=shuffleCopy(unique(
    pool.filter(e=>e.entry_id!==correct.entry_id&&e.type===correct.type),used
  ));
  const picked=sameType.slice(0,3);
  if(picked.length<3){
    const others=shuffleCopy(unique(
      pool.filter(e=>e.entry_id!==correct.entry_id&&e.type!==correct.type),used
    ));
    picked.push(...others.slice(0,3-picked.length));
  }
  return picked;
}

let quizAudioContext=null;
function getQuizAudioContext(){
  try{
    if(!quizAudioContext)quizAudioContext=new (window.AudioContext||window.webkitAudioContext)();
    if(quizAudioContext.state==='suspended')quizAudioContext.resume();
    return quizAudioContext;
  }catch{return null}
}
function quizTone(freq,start,duration,gain=.09,type='sine'){
  if(AS.quizSound===false)return;
  const ctx=getQuizAudioContext();
  if(!ctx)return;
  const osc=ctx.createOscillator();
  const g=ctx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,ctx.currentTime+start);
  g.gain.setValueAtTime(.0001,ctx.currentTime+start);
  g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+start+.015);
  g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+start+duration);
  osc.connect(g);g.connect(ctx.destination);
  osc.start(ctx.currentTime+start);
  osc.stop(ctx.currentTime+start+duration+.03);
}
function playQuizCorrectSound(){
  quizTone(660,0,.12,.075);
  quizTone(880,.11,.16,.085);
}
function playQuizWrongSound(){
  quizTone(250,0,.15,.07,'triangle');
  quizTone(180,.12,.20,.075,'triangle');
}
function playQuizFeedback(correct){
  if(AS.quizSound===false)return;
  if(correct)playQuizCorrectSound();else playQuizWrongSound();
}
function playQuizPassSound(){
  quizTone(523.25,0,.14,.07);
  quizTone(659.25,.11,.14,.075);
  quizTone(783.99,.22,.15,.08);
  quizTone(1046.5,.35,.28,.09);
}

function buildQuiz(){
  const pool=quizEligibleEntries();
  if(pool.length<QUIZ_COUNT)return null;
  const picked=shuffleCopy(pool).slice(0,QUIZ_COUNT);
  const questions=[];
  for(const correct of picked){
    let distractors=quizDistractors(correct,pool);
    if(distractors.length<3)return null;
    const options=shuffleCopy([
      {entry_id:correct.entry_id,label:correct.english,correct:true},
      ...distractors.map(e=>({entry_id:e.entry_id,label:e.english,correct:false}))
    ]);
    questions.push({
      entry_id:correct.entry_id,
      start:+correct.start||0,
      german:correct.german,
      grammar:quizGrammarLabel(correct),
      correct:correct.english,
      options
    });
  }
  return questions;
}
function openQuiz(){ if(!quizIsAvailable())return; setPlaybackIntent(false); audio.pause(); const questions=buildQuiz(); if(!questions){msg('This episode does not have enough unique quiz words yet.');return} quizState={questions,index:0,answers:Array(QUIZ_COUNT).fill(null),finished:false}; $('#quizOverlay').classList.remove('hidden'); $('#quizBtn').classList.add('active'); document.body.classList.add('quiz-open'); renderQuiz(); }
function closeQuiz(){
  $('#quizOverlay').classList.add('hidden');
  $('#quizBtn').classList.remove('active');
  document.body.classList.remove('quiz-open');
}
function renderQuiz(){ if(!quizState)return; const body=$('#quizBody'); if(quizState.finished){renderQuizResult();return} const q=quizState.questions[quizState.index], selected=quizState.answers[quizState.index], pct=Math.round((quizState.index/QUIZ_COUNT)*100); body.innerHTML=`<div class="quiz-kicker">${esc(episodeDisplayLabel(currentEp))}</div><h2 id="quizTitle">${tt('quizTitle')}</h2><div class="quiz-meta"><span>${tt('question',{n:quizState.index+1,t:QUIZ_COUNT})}</span><span>${tt('pass',{p:QUIZ_PASS,t:QUIZ_COUNT})}</span></div><div class="quiz-progress"><span style="width:${pct}%"></span></div><div class="quiz-word">${esc(q.german)}${q.grammar?` <span class="quiz-grammar">(${esc(q.grammar)})</span>`:''}</div><p class="quiz-prompt">${tt('quizPrompt')}</p><div class="quiz-options">${q.options.map((o,i)=>`<button type="button" class="quiz-option ${selected===i?'selected':''} ${selected!=null?'locked':''}" data-qoption="${i}" ${selected!=null?'disabled':''}><span class="quiz-letter">${String.fromCharCode(65+i)}</span><span>${esc(o.label)}</span></button>`).join('')}</div>${selected!=null?(q.options[selected]?.correct?`<div class="quiz-instant-feedback correct">${tt('correct')}</div>`:`<div class="quiz-instant-feedback wrong"><span>${tt('correctAnswer')}</span> <strong>${esc(q.correct)}</strong></div>`):`<div class="quiz-instant-feedback placeholder" aria-hidden="true">&nbsp;</div>`}<div class="quiz-actions"><button id="quizPrev" class="quiz-secondary" type="button" ${quizState.index===0?'disabled':''}>${tt('back')}</button><button id="quizNext" class="quiz-primary" type="button" ${selected==null?'disabled':''}>${quizState.index===QUIZ_COUNT-1?tt('finish'):tt('next')}</button></div>`; $$('[data-qoption]').forEach(btn=>btn.onclick=()=>{if(quizState.answers[quizState.index]!=null)return; const i=+btn.dataset.qoption,opt=q.options[i]; quizState.answers[quizState.index]=i; playQuizFeedback(!!opt.correct); renderQuiz();}); $('#quizPrev').onclick=()=>{if(quizState.index>0){quizState.index--;renderQuiz()}}; $('#quizNext').onclick=()=>{if(quizState.answers[quizState.index]==null)return; if(quizState.index<QUIZ_COUNT-1){quizState.index++;renderQuiz();}else{finishQuiz();}}; }
function collectQuizReview(){
  if(!quizState?.questions)return [];
  const wrong=[];
  quizState.questions.forEach((q,i)=>{
    const answer=q.options[quizState.answers[i]];
    if(!answer?.correct)wrong.push({entry_id:q.entry_id,german:q.german,yours:answer?.label||'—',correct:q.correct,start:+q.start||+entryIndex[q.entry_id]?.start||0});
  });
  return wrong;
}
function saveQuizAttempt(score,review){
  const S=courseState(),id=String(currentEp.episode);
  S.quizHistory=S.quizHistory||{};
  const next={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,score:+score||0,at:Date.now(),legacy:false,review:clone(review||[])};
  const current=Array.isArray(S.quizHistory[id])?S.quizHistory[id]:[];
  S.quizHistory[id]=[next,...current].slice(0,3);
  syncQuizBestFromHistory(S,id);
  save();
}
function finishQuiz(){
  if(!quizState)return;
  let score=0;
  quizState.questions.forEach((q,i)=>{const a=q.options[quizState.answers[i]];if(a?.correct)score++});
  quizState.score=score;quizState.finished=true;quizState.episode=currentEp.episode;quizState.review=collectQuizReview();
  saveQuizAttempt(score,quizState.review);
  updateQuizButton();updateCourseQuizPoints();
  renderQuizResult();
  if(score>=QUIZ_PASS)setTimeout(playQuizPassSound,120);
}
async function practiceQuizAnswer(episodeId,entryId,start){
  closeQuiz();
  const x=entryIndex[entryId],seek=Number.isFinite(+start)?+start:(+x?.start||0);
  await openEpisode(+episodeId,seek,true,null,entryId||null);
}
function renderQuizResult(){
  const body=$('#quizBody'),score=+quizState?.score||0,passed=score>=QUIZ_PASS;
  const episodeId=+quizState?.episode||currentEp?.episode||1,ep=epMap[episodeId]||currentEp;
  const wrong=Array.isArray(quizState?.review)?quizState.review:collectQuizReview();
  const legacy=!!quizState?.legacy;
  body.innerHTML=`<div class="quiz-kicker">${esc(ep?episodeDisplayLabel(ep):'')}</div><h2 id="quizTitle">${esc(quizState?.history?qh('quizResult'):(passed?tt('passed'):tt('reviewRecommended')))}</h2><div class="quiz-score ${passed?'pass':'review'}"><strong>${score}/${QUIZ_COUNT}</strong><span>${legacy?qh('detailsUnavailable'):(passed?tt('greatTarget'):tt('listenAgainThen'))}</span></div>${!legacy&&wrong.length?`<section class="quiz-review"><h3>${tt('reviewMistakes',{n:wrong.length})}</h3><p class="quiz-practice-hint">${esc(qh('listenPractice'))}</p>${wrong.map(x=>`<div class="quiz-review-row"><strong>${esc(x.german)}</strong><span>${tt('yourAnswer')} ${esc(x.yours)}</span><span class="quiz-correct">${tt('correctShort')} ${esc(x.correct)} <button type="button" class="quiz-time-link" data-qtime-entry="${esc(x.entry_id||'')}" data-qtime-start="${+x.start||0}" data-qtime-episode="${episodeId}">▶ ${fmt(+x.start||0)}</button></span></div>`).join('')}</section>`:(!legacy?`<div class="quiz-perfect">${tt('allCorrect')}</div>`:'')}<div class="quiz-result-actions">${quizState?.history?`<button id="quizBackHistory" class="quiz-secondary" type="button">${esc(qh('backToHistory'))}</button>`:''}<button id="quizListenAgain" class="quiz-secondary" type="button">${tt('listenAgain')}</button><button id="quizRetake" class="quiz-primary" type="button">${tt('retakeQuiz')}</button><button id="quizDone" class="quiz-secondary" type="button">${tt('close')}</button></div>`;
  $$('.quiz-time-link').forEach(b=>b.onclick=()=>practiceQuizAnswer(+b.dataset.qtimeEpisode,b.dataset.qtimeEntry,+b.dataset.qtimeStart));
  if($('#quizBackHistory'))$('#quizBackHistory').onclick=()=>{closeQuiz();openQuizHistory(currentCourseId)};
  $('#quizRetake').onclick=async()=>{if(quizState?.history){closeQuiz();await openEpisode(episodeId,null,false);openQuiz();return}const q=buildQuiz();if(q){quizState={questions:q,index:0,answers:Array(QUIZ_COUNT).fill(null),finished:false};renderQuiz()}};
  $('#quizListenAgain').onclick=async()=>{closeQuiz();if(currentEp?.episode===episodeId){audio.currentTime=0;sync(true);setPlaybackIntent(true);safePlay('quiz-listen-again');}else await openEpisode(episodeId,0,true)};
  $('#quizDone').onclick=closeQuiz;
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
  updateEndBehaviorControl();
  updateQuizButton();
  updateMediaSessionMetadata();
  $('#episodeIntro').innerHTML=`<h1>${esc(episodeDisplayLabel(currentEp))}</h1><p>${fmt(currentEp.duration)} · ${currentEp.word_count} ${tt('words')} · ${esc(currentEp.first_word)} → ${esc(currentEp.last_word)}</p><p>${ux('transcriptHint')}</p>`;
  renderTranscript();
  if(!meta.audioBase){
    $('#playerNote').textContent=ux('gatewayMissing');
    msg(ux('gatewayMissing'));
    return;
  }
  let src=`${meta.audioBase}${currentEp.audio}`;
  pendingSeek=seek!=null?+seek:(+S.positions[n]||0);
  if(autoplay){setPlaybackIntent(true);resumeWhenReady=true;}
  else if(stop!=null)setPlaybackIntent(false);
  $('#playerNote').textContent=stop!=null?ux('bookmarkReviewStop'):tt('savedAutomatically');
  if(audio.getAttribute('src')!==src){
    audio.src=src;
    audio.load();
    // Start play() during the user's click/change event. Browsers can reject a
    // delayed play() from loadedmetadata as autoplay, even though the episode
    // change itself came from a user gesture. The pending seek is applied in
    // onloadedmetadata before normal playback can begin.
    if(autoplay)safePlay('episode-source-change')
  }else{
    audio.currentTime=pendingSeek||0;pendingSeek=null;sync(true);
    if(pendingFocusId)setTimeout(scrollFocusEntry,80);
    if(autoplay)safePlay('episode-existing-source')
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
    o.textContent=`${episodeDisplayLabel(e)} · ${fmt(e.duration)} · ${e.word_count} ${tt('words')}`;
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
if($('#navQuizHistory'))$('#navQuizHistory').onclick=()=>openQuizHistory(currentCourseId);
if($('#navCore'))$('#navCore').onclick=()=>openCourse('b1','core');
if($('#navAdvanced'))$('#navAdvanced').onclick=()=>openCourse('b1','advanced');
$$('.course-side').forEach(b=>b.onclick=()=>openCourse(b.dataset.course));

$('#continueBtn').onclick=()=>{const S=courseState(),ep=+S.lastEpisode||1;openEpisode(ep,+S.positions[ep]||0)};
$('#openLibraryBtn').onclick=$('#quickLibrary').onclick=()=>scrollToEpisodeBrowser();
$('#bookmarksBtn').onclick=()=>renderCourseBookmarkPanel(true);
if($('#courseQuizPointsCard')){
  $('#courseQuizPointsCard').onclick=()=>openQuizHistory(currentCourseId);
  $('#courseQuizPointsCard').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openQuizHistory(currentCourseId)}};
}
if($('#quizHistoryAll'))$('#quizHistoryAll').onclick=()=>{quizHistoryFilter='all';renderQuizHistory()};
if($('#quizHistoryAttempted'))$('#quizHistoryAttempted').onclick=()=>{quizHistoryFilter='attempted';renderQuizHistory()};
$('#searchInput').oninput=search;
$('#resetProgress').onclick=()=>{if(confirm(ux('resetConfirm',{n:D.episodes.length}))){const S=courseState();S.positions={};S.maxPositions={};S.completed={};S.lastEpisode=1;save();renderEpisodeGrid();updateHeaderProgress();openCourse(currentCourseId);msg(ux('progressReset'))}};
$$('[data-library-filter]').forEach(b=>b.onclick=()=>{libraryFilter=b.dataset.libraryFilter;$$('[data-library-filter]').forEach(x=>x.classList.toggle('active',x===b));renderEpisodeGrid()});
if($('#gridViewBtn'))$('#gridViewBtn').onclick=()=>setLibraryLayout('grid');
if($('#listViewBtn'))$('#listViewBtn').onclick=()=>setLibraryLayout('list');

// Episode changes made from the player controls should continue immediately.
$('#episodeSelect').onchange=e=>openEpisode(+e.target.value,null,true);
$('#prevEpisode').onclick=()=>moveEpisodeWithinSection(-1);
$('#nextEpisode').onclick=()=>moveEpisodeWithinSection(1);
$('#episodeLibrary').onclick=()=>openCourse(currentCourseId,currentEp?.section||null);
$('#quizBtn').onclick=openQuiz;
$('#quizClose').onclick=closeQuiz;
$('#quizOverlay').onclick=e=>{if(e.target===$('#quizOverlay'))closeQuiz()};
$('#back10').onclick=()=>audio.currentTime=Math.max(0,audio.currentTime-10);
$('#fwd10').onclick=()=>audio.currentTime=Math.min(currentEp.duration,audio.currentTime+10);
$('#playBtn').onclick=()=>audio.paused?(setPlaybackIntent(true),safePlay('player-button')):pauseByUser();
$('#progress').oninput=e=>{audio.currentTime=+e.target.value;sync(true)};
$('#followToggle').onchange=()=>sync(true);
$$('.mode[data-mode]').forEach(b=>b.onclick=()=>{courseState().mode=b.dataset.mode;save();applyMode()});
$('#revealEnglishToggle').onchange=e=>{courseState().revealEnglishOnAudio=e.target.checked;save();applyEnglishVisibility(audio.currentTime||0);msg(e.target.checked?(lang()==='bn'?'ইংরেজি তার অডিওর সাথে দেখাবে':lang()==='de'?'Englisch erscheint mit dem Audio':'English will appear with its audio'):(lang()==='bn'?'স্টাডি মোডে ইংরেজি সবসময় দেখা যাবে':lang()==='de'?'Englisch ist im Lernmodus immer sichtbar':'English always visible in Study mode'))};
const speeds={'.8×':.8,'.9×':.9,'1×':1,'1.1×':1.1,'1.25×':1.25,'1.5×':1.5,'1.75×':1.75,'2×':2};
$('#speedSelect').onchange=e=>{courseState().speed=speeds[e.target.value]||1;audio.playbackRate=courseState().speed;save();updateMediaSessionPosition(true)};
$('#currentBookmark').onclick=$('#lyricsStar').onclick=()=>{let e=currentEntry();if(e)toggleBookmark(e.entry_id)};
if($('#endBehaviorControl'))$('#endBehaviorControl').onclick=cycleEndBehavior;
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

$('#themeBtn').onclick=()=>{AS.theme=AS.theme==='dark'?'light':'dark';save();applyPreferences();updateStaticLanguage()};
$('#textSmaller').onclick=()=>{AS.textSize='small';save();applyPreferences()};
$('#textNormal').onclick=()=>{AS.textSize='normal';save();applyPreferences()};
$('#textLarger').onclick=()=>{AS.textSize='large';save();applyPreferences()};

window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(checkBackCurrent,120)},{passive:true});
window.addEventListener('resize',checkBackCurrent);
window.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#quizOverlay').classList.contains('hidden'))closeQuiz();else if(!$('#settingsOverlay').classList.contains('hidden'))closeSettings()});

audio.onloadedmetadata=()=>{
  if(!currentEp)return;const S=courseState();$('#progress').max=currentEp.duration;audio.playbackRate=+S.speed||1;
  let key=Object.entries(speeds).find(([k,v])=>v===+S.speed)?.[0]||'1×';$('#speedSelect').value=key;
  if(pendingSeek!=null){audio.currentTime=Math.min(pendingSeek,audio.duration-.1);pendingSeek=null}sync(true);updateMediaSessionPosition(true);if(resumeWhenReady&&playbackRequested&&audio.paused)safePlay('metadata-ready',false);if(pendingFocusId)setTimeout(scrollFocusEntry,150)
};
audio.ontimeupdate=()=>{sync();updateMediaSessionPosition()};
audio.onplay=()=>{
  playbackRequested=true;resumeWhenReady=false;clearPlaybackRecovery();recoveryAttempts=0;
  $('#playBtn').textContent='❚❚';playerHasStarted=true;updatePersistentPlayerVisibility();
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState='playing'}catch{}
  if(currentEp)setSectionNav(currentEp.section||null);
  if(!$('#courseHomeView').classList.contains('hidden'))renderEpisodeGrid();
};
audio.onpause=()=>{
  $('#playBtn').textContent='▶';
  if('mediaSession' in navigator)try{navigator.mediaSession.playbackState='paused'}catch{}
  if(currentEp){courseState().positions[currentEp.episode]=audio.currentTime;save()}
  updatePersistentPlayerVisibility();
  if(!$('#courseHomeView').classList.contains('hidden'))renderEpisodeGrid();
};
audio.onended=handleEpisodeEnded;
audio.onwaiting=()=>{if(playbackRequested)schedulePlaybackRecovery('waiting',12000)};
audio.onstalled=()=>{if(playbackRequested)schedulePlaybackRecovery('stalled',5000)};
audio.oncanplay=()=>{clearPlaybackRecovery();if(resumeWhenReady&&playbackRequested&&audio.paused)safePlay('canplay-ready',false)};
audio.onplaying=()=>{clearPlaybackRecovery();recoveryAttempts=0;resumeWhenReady=false;updateMediaSessionPosition(true)};
audio.onerror=()=>{
  playbackNote(lang()==='bn'?'অডিও স্ট্রিমে সমস্যা হয়েছে — পুনরায় সংযোগের চেষ্টা চলছে…':lang()==='de'?'Problem mit dem Audiostream — Verbindung wird wiederhergestellt…':'Audio stream interrupted — trying to reconnect…');
  if(playbackRequested)schedulePlaybackRecovery('media-error',1200);
};
window.addEventListener('online',()=>{if(playbackRequested&&currentEp){resumeWhenReady=true;safePlay('network-online')}});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&currentEp){
    updateMediaSessionMetadata();updateMediaSessionPosition(true);
    if(playbackRequested&&audio.paused&&!audio.ended)safePlay('foreground-return',false);
  }
});
window.addEventListener('pageshow',()=>{if(currentEp){updateMediaSessionMetadata();updateMediaSessionPosition(true)}});

setupMediaSession();
registerAppServiceWorker();

async function route(){
  const h=(location.hash||'#home').slice(1);
  if(h==='home'){renderAppHome();return}
  let m;
  if((m=h.match(/^course-(.+)$/))){await openCourse(m[1]);return}
  if((m=h.match(/^library-(.+)$/))){await openCourse(m[1]);return}
  if((m=h.match(/^difficult-(.+)$/))){if(await activateCourse(m[1]))await openDifficult();return}
  if((m=h.match(/^quiz-history-(.+)$/))){await openQuizHistory(m[1]);return}
  if((m=h.match(/^episode-([^-]+)-(\d+)$/))){if(await activateCourse(m[1]))await openEpisode(+m[2]);return}
  renderAppHome()
}

applyPreferences();
updateStaticLanguage();
updateSettingsUI();
$$('[data-lang]').forEach(b=>b.onclick=()=>setUILanguage(b.dataset.lang));
$('#settingsBtn').onclick=openSettings;
$('#settingsClose').onclick=closeSettings;
$('#settingsOverlay').onclick=e=>{if(e.target===$('#settingsOverlay'))closeSettings()};
$('#quizSoundToggle').onchange=e=>{AS.quizSound=e.target.checked;save();updateSettingsUI()};
if($('#checkUpdateBtn'))$('#checkUpdateBtn').onclick=checkForAppUpdate;
if($('#updateNowBtn'))$('#updateNowBtn').onclick=applyWaitingUpdate;
if($('#updateLaterBtn'))$('#updateLaterBtn').onclick=()=>hideUpdateNotice(true);
setupFeedbackForm();
async function preloadReadyCoursesForHome(){
  const ready=COURSE_LIST.filter(c=>c.status==='ready').map(c=>c.id);
  const preferred=COURSE_META[AS.lastCourse]?.status==='ready'?AS.lastCourse:null;
  const order=[preferred,...ready].filter((id,i,a)=>id&&a.indexOf(id)===i);
  for(const id of order){
    try{
      const data=await loadCourseData(id);
      if(!D&&id===preferred){
        D=data;currentCourseId=id;entryIndex=D.entry_index||{};epMap=Object.fromEntries(D.episodes.map(e=>[e.episode,e]));
        updateCourseNavigation();updateStaticLanguage();
      }
      if(!$('#appHomeView').classList.contains('hidden'))renderAppHome();
    }catch(err){console.warn(`Could not preload ${id} progress`,err)}
  }
}
async function bootstrapApp(){
  await route();
  preloadReadyCoursesForHome();
}
bootstrapApp();
})();