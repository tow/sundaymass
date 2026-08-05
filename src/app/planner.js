@@APP_LOGGER_JS@@
@@ASSET_URL_JS@@
@@READING_TEXT_STORE_JS@@
@@MODAL_CONTROLLER_JS@@
@@PWA_CONTROLLER_JS@@
@@LITURGICAL_CALENDAR_JS@@
@@CALENDAR_NAVIGATION_JS@@
@@DATE_URL_STATE_JS@@
@@AUTH_CONTROLLER_JS@@
@@PLAN_SESSION_CONTROLLER_JS@@
@@PLANNER_STATE_JS@@
@@SONG_FORM_JS@@
@@LYRICS_PRESENTATION_JS@@
@@LYRICS_BOOKLET_JS@@
@@LYRICS_EXPORT_CONTROLLER_JS@@
@@LYRICS_PPTX_CONTROLLER_JS@@
@@LYRICS_SLIDES_CONTROLLER_JS@@
@@LYRICS_BOOKLET_CONTROLLER_JS@@
@@WEEKLY_LYRICS_JS@@
@@WEEKLY_LYRICS_CONTROLLER_JS@@
@@MUSIC_PARTS_JS@@
@@SONG_PRESENTATION_JS@@
@@SONG_REQUESTS_JS@@
@@SONG_REQUEST_CONTROLLER_JS@@
@@SONG_REQUEST_REVIEW_CONTROLLER_JS@@
@@PRACTICE_QUEUE_JS@@
@@PRACTICE_QUEUE_CONTROLLER_JS@@
@@MUSIC_PLAN_VIEW_JS@@
@@READING_PLAN_VIEW_JS@@
@@READING_EDITOR_VIEW_JS@@
@@SONG_PICKER_VIEW_JS@@
@@SONG_PICKER_CONTROLLER_JS@@
@@SONG_MUTATION_CONTROLLER_JS@@
@@SONG_WORKFLOW_JS@@
@@CELEBRATION_PICKER_VIEW_JS@@
@@CELEBRATION_CONTROLLER_JS@@
@@READING_OVERRIDE_CONTROLLER_JS@@
@@READING_DIALOG_CONTROLLER_JS@@
@@READING_WORKFLOW_JS@@
@@SONG_CATALOG_JS@@
@@PLAN_MUSIC_DATA_JS@@
@@LECTIONARY_CATALOG_JS@@
@@READING_SELECTION_JS@@
const SUNDAY_LECTIONARY = @@SUNDAY_LECTIONARY@@;
const CELEBRATIONS = @@CELEBRATIONS@@;
const COMMONS = @@COMMONS@@;
const READING_ASSETS = @@READING_ASSETS@@;
window.MASS_PLANNER_ASSET_VERSIONS = Object.freeze(@@ASSET_VERSIONS@@);
window.MASS_PLANNER_BUILD = "@@BUILD_VERSION@@";
const appLogger=AppLogger;
const readingTextStore=ReadingTextStore.create({assets:READING_ASSETS});
const READINGS=readingTextStore.values();
const MUSIC_PARTS=MassMusicParts.parts;
const lectionary=LectionaryCatalog.create({
  liturgicalCalendar:LiturgicalCalendar,
  sundayLectionary:SUNDAY_LECTIONARY,
  celebrations:CELEBRATIONS,
  commons:COMMONS,
  readings:READING_ASSETS,
});
const READING_SLOTS=lectionary.readingSlots;
const ROLE_CITATIONS=lectionary.roleCitations;
const CITATION_ROLES=lectionary.citationRoles;
const normalizedCitation=lectionary.normalizedCitation;
const citationAlternatives=lectionary.citationAlternatives;
const parseReadingCitation=lectionary.parseReadingCitation;
const suggestionPartFor=MassMusicParts.suggestionPartFor;
const copyrightComplete=SongPresentation.copyrightComplete;
const attributionLine=SongPresentation.publicPlanAttribution;
const musicPlanView=MusicPlanView.create({
  escapeHtml:esc,
  safeYoutubeUrl:SongPresentation.safeYoutubeUrl,
  copyrightComplete,
  publicAttribution:SongPresentation.planAuthor,
  editorAttribution:SongPresentation.planAuthor,
});
const readingPlanView=ReadingPlanView.create({
  escapeHtml:esc,
  formatLong:fmtLong,
  cycleName,
});
const readingEditorView=ReadingEditorView.create({
  escapeHtml:esc,
  formatLong:fmtLong,
  cycleName,
});
const songPickerView=SongPickerView.create({
  escapeHtml:esc,
  safeYoutubeUrl:SongPresentation.safeYoutubeUrl,
});
const celebrationPickerView=CelebrationPickerView.create({
  escapeHtml:esc,
  formatLong:fmtLong,
  cycleName,
  dayDistance:lectionary.dayDistance,
});
const readingSelection=ReadingSelection.create({
  readingSlots:READING_SLOTS,
  roleCitations:ROLE_CITATIONS,
  citationRoles:CITATION_ROLES,
  readings:READINGS,
  normalizedCitation,
  citationAlternatives,
  parseReadingCitation,
});
const modalController=ModalController.create({window,document});
const openModal=modalController.open;
modalController.start();
const calendarNavigation=CalendarNavigation.create(LiturgicalCalendar);
const initialUrlDate=DateUrlState.read(location);
const initialUrlSelection=initialUrlDate
  ? calendarNavigation.selectionFor(initialUrlDate)
  : null;
const songForm=SongForm.create({
  title:songTitle,
  youtubeUrl:songYoutube,
  authors:songAuthors,
  copyrightOwner:songCopyrightOwner,
  copyrightYear:songCopyrightYear,
  source:songSource,
  responsorialBook:songResponsorialBook,
  responsorialNumber:songResponsorialNumber,
  responsorialCitations:songResponsorialCitations,
  responsorialFields:songResponsorialFields,
  lyrics:songLyrics,
  inRepertoire:songInRepertoire,
  suggestionParts:songSuggestionParts,
});
function cycleName(c){ return "Year " + c; }
function fmtLong(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); }
function fmtPicker(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
let planStore = null;
let isEditor = false;
let canSuggest = false;
let canReadLyrics = false;
let signedIn = false;
let weeklyLyricsParts = new Set();
let readingLoadGeneration = 0;
const failedReadingTexts = new Set();

const plannerState=PlannerState.create({
  initialSunday:initialUrlSelection?.sunday
    || calendarNavigation.upcomingSunday(new Date().toISOString().slice(0,10)),
  readingSlots:READING_SLOTS,
  scheduledCelebration:sunday=>lectionary.scheduledCelebration(sunday),
  formatLong:fmtLong,
  cycleName,
});
const practiceQueueController=PracticeQueueController.create({
  elements:{
    launch:practiceAll,
    availability:practiceAllAvailability,
    dialog:practiceDialog,
    close:practiceDialogClose,
    summary:practiceDialogSummary,
    player:practicePlayer,
    list:practiceQueueList,
  },
  parts:MUSIC_PARTS,
  getSongs:plannerState.songs,
  queueBuilder:PracticeQueue,
  openModal,
});
practiceQueueController.start();
function current(){ return plannerState.current(); }
function baseCelebration(){ return plannerState.baseCelebration(); }
function vals(){ return plannerState.values(); }
function selectedReadingCitations(){
  const values=vals();
  return READING_SLOTS.map(slot=>values[slot.key]).filter(Boolean);
}
function textFor(citation){
  if(!citation)return "";
  if(readingTextStore.has(citation))return readingTextStore.get(citation);
  return failedReadingTexts.has(citation)
    ? "(Reading text is unavailable. Check the citation while online.)"
    : "(Loading reading text…)";
}
async function loadDisplayedReadings(){
  const generation=++readingLoadGeneration;
  const sunday=current().d;
  const citations=selectedReadingCitations();
  const missing=citations.filter(citation=>!readingTextStore.has(citation));
  if(!missing.length)return;
  missing.forEach(citation=>failedReadingTexts.delete(citation));
  const results=await Promise.allSettled(missing.map(citation=>readingTextStore.load(citation)));
  if(generation!==readingLoadGeneration||current().d!==sunday)return;
  const failures=results
    .map((result,index)=>({result,citation:missing[index]}))
    .filter(({result})=>result.status==="rejected");
  failures.forEach(({citation})=>failedReadingTexts.add(citation));
  if(failures.length){
    appLogger.error(
      `Could not load ${failures.length} selected reading text${failures.length===1?"":"s"}`,
      failures[0].result.reason,
    );
  }
  renderReadingPlan();
}
async function prepareReadingLibrary(){
  await readingTextStore.loadAll();
}
function renderMusicPlan(){
  const view=musicPlanView.render({
    parts:MUSIC_PARTS,
    songs:plannerState.songs(),
    isEditor,
    canSuggest,
    customizedParts:weeklyLyricsParts,
  });
  lyricsTools.hidden=!canReadLyrics;
  editorLiveHint.hidden=!isEditor;
  musicIntro.textContent=view.intro;
  musicList.innerHTML=view.html;
  musicList.dataset.mode=view.mode;
  practiceQueueController.render();
  lyricsPptxController.render();
  lyricsSlidesController.render();
  lyricsBookletController.render();
}
function computedCitation(slot){ return plannerState.computedCitation(slot); }
function displayedCitation(slot){ return plannerState.displayedCitation(slot); }
const readingWorkflow=ReadingWorkflow.create({
  elements:{
    launch:liturgicalEditLaunch,
    launchButton:openLiturgicalEditor,
    liturgicalDialog,
    liturgicalClose:liturgicalDialogClose,
    celebrationCurrent,
    restoreCelebration,
    editorList:readingEditorList,
    editorFooter:readingEditorFooter,
    saveStatus:readingSaveStatus,
    chooseCelebration,
    celebrationDialog,
    celebrationContext:celebrationDialogContext,
    celebrationSearch,
    celebrationResultsHeading,
    celebrationResults,
    celebrationPreview,
    celebrationUse,
    celebrationClose:celebrationDialogClose,
    celebrationCancel,
    celebrationForm,
    restoreAll:restoreAllReadings,
    readingDialog,
    readingTitle:readingDialogTitle,
    readingContext:readingDialogContext,
    readingSuggested,
    citationOptions:readingCitationOptions,
    searchHelp:readingSearchHelp,
    citationInput:readingCitationInput,
    confirm:ordoConfirm,
    validation:readingValidation,
    textPreview:readingTextPreview,
    confirmWrap:ordoConfirmWrap,
    readingUse,
    readingClose:readingDialogClose,
    readingCancel,
    readingForm,
  },
  readingSlots:READING_SLOTS,
  roleCitations:ROLE_CITATIONS,
  normalizedCitation,
  selectionPolicy:readingSelection,
  pickerView:celebrationPickerView,
  editorView:readingEditorView,
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  getDate:()=>current().d,
  getCurrentSunday:current,
  getBaseCelebration:baseCelebration,
  getCelebrationOverride:plannerState.celebrationOverride,
  getReadingOverrides:plannerState.readingOverrides,
  getComputedCitation:computedCitation,
  getDisplayedCitation:displayedCitation,
  getCandidates:()=>lectionary.availableCelebrations(current()),
  onCelebrationSaved:payload=>{
    plannerState.useCelebration(payload);
    refresh();
  },
  onCelebrationRestored:()=>{
    plannerState.restoreCelebration();
    refresh();
  },
  onReadingOverrideChanged:(slot,value)=>{
    plannerState.setReadingOverride(slot,value);
    refresh();
  },
  onAllReadingsRestored:()=>{
    plannerState.clearReadingOverrides();
    refresh();
  },
  openModal,
  formatLong:fmtLong,
  escapeHtml:esc,
  confirmAction:message=>confirm(message),
  prepare:prepareReadingLibrary,
  logger:appLogger,
});
readingWorkflow.start();
function renderReadingPlan(){
  const view=readingPlanView.render({
    sunday:current(),
    celebration:baseCelebration(),
    celebrationOverride:plannerState.celebrationOverride(),
    readingOverrides:plannerState.readingOverrides(),
    readingSlots:READING_SLOTS,
    values:vals(),
    textFor,
  });
  readingsIntro.textContent=view.readingsIntro;
  resolved.innerHTML=view.resolvedHtml;
  readingSummary.innerHTML=view.summaryHtml;
  readingTexts.innerHTML=view.fullReadingsHtml;
}
function syncDateControl(){
  date.value=current().d;
  dateDisplay.textContent=fmtPicker(current().d);
}
function refresh(){
  syncDateControl(); renderReadingPlan(); readingWorkflow.renderEditor();
  loadDisplayedReadings();
  today.hidden=current().d===upcomingSunday().d;
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day has proper readings that are not in the dataset. Please confirm them against the parish Ordo."; }
  else{ warn.style.display="none"; }
}

function setSyncStatus(text,state){
  syncStatus.textContent=text;
  syncStatus.dataset.state=state || "";
}
const planSessionController=PlanSessionController.create({
  getDate:()=>current().d,
  isOnline:()=>navigator.onLine,
  onReset:()=>{
    plannerState.reset();
    weeklyLyricsParts=new Set();
    renderMusicPlan();
    refresh();
  },
  onPlan:(plan)=>{
    plannerState.applyPlan(plan);
    renderMusicPlan();
    refresh();
    weeklyLyricsController.refreshSummary();
  },
  onAuth:(auth)=>{
    isEditor=!!auth.isEditor;
    canSuggest=!!auth.isChoirMember;
    canReadLyrics=!!auth.canReadLyrics;
    signedIn=!!auth.user;
    authButton.textContent=signedIn ? "Sign out" : "Sign in";
    if(!isEditor){
      readingWorkflow.closeAll();
      songWorkflow.closeAll();
      weeklyLyricsController.close();
      weeklyLyricsParts=new Set();
    }
    if(!canSuggest) songRequestController.close();
    renderMusicPlan();
    readingWorkflow.renderEditor();
    weeklyLyricsController.refreshSummary();
    songRequestReviewController.refresh();
  },
  onStatus:setSyncStatus,
  logger:appLogger,
});
function subscribeToCurrentPlan(){ planSessionController.subscribe(); }
function connectPlanStore(store){
  planStore=store;
  planSessionController.connect(store);
}
window.massPlanApp={connect:connectPlanStore};

const songWorkflow=SongWorkflow.create({
  elements:{
    musicList,
    dialog:songPickerDialog,
    eyebrow:songPickerEyebrow,
    title:songPickerTitle,
    close:songPickerClose,
    modes:songPickerModes,
    suggestedPanel:songSuggestedPanel,
    searchPanel:songSearchPanel,
    currentActions:songCurrentActions,
    currentName:songCurrentName,
    currentAuthor:songCurrentAuthor,
    editCurrent:editCurrentSong,
    removeCurrent:removeCurrentSong,
    previous:previousSong,
    previousName:previousSongName,
    previousAuthor:previousSongAuthor,
    usePrevious:usePreviousSong,
    suggestionResults:songSuggestionResults,
    suggestionStatus:songSuggestionStatus,
    search:songSearch,
    resultsHeading:songResultsHeading,
    results:songResults,
    empty:songPickerEmpty,
    use:useSong,
    actions:songPickerActions,
    editorDialog:songEditorDialog,
    editorForm:songEditorForm,
    editorEyebrow:songEditorEyebrow,
    editorTitle:songEditorTitle,
    editorContext:songEditorContext,
    editorClose:songEditorClose,
    editorCancel:songEditorCancel,
    sharedWarning:songSharedWarning,
    editorError:songEditorError,
    lyricsSummary:songLyricsSummary,
    songTitle,
    save:saveSong,
  },
  parts:MUSIC_PARTS,
  suggestionPartFor,
  pickerView:songPickerView,
  songForm,
  songCatalog:SongCatalog,
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  isOnline:()=>navigator.onLine,
  getDate:()=>current().d,
  getPreviousDate:()=>calendarNavigation.previousSunday(current()).d,
  getReadingCitations:()=>READING_SLOTS.map(slot=>displayedCitation(slot)).filter(Boolean),
  getPsalmCitation:()=>displayedCitation(READING_SLOTS.find(slot=>slot.key==="psalm")),
  getSongs:plannerState.songs,
  openModal,
  onStatus:setSyncStatus,
  onAssigned:(part,song)=>{
    plannerState.assignSong(part,song);
    renderMusicPlan();
  },
  onCleared:part=>{
    plannerState.clearSong(part);
    renderMusicPlan();
  },
  onUpdated:song=>{
    plannerState.updateSong(song);
    renderMusicPlan();
  },
  confirm:message=>confirm(message),
  logger:appLogger,
});
songWorkflow.start();
const weeklyLyricsController=WeeklyLyricsController.create({
  elements:{
    musicList,
    dialog:weeklyLyricsDialog,
    form:weeklyLyricsForm,
    eyebrow:weeklyLyricsEyebrow,
    title:weeklyLyricsTitle,
    context:weeklyLyricsContext,
    close:weeklyLyricsClose,
    cancel:weeklyLyricsCancel,
    save:weeklyLyricsSave,
    reset:weeklyLyricsReset,
    error:weeklyLyricsError,
    customNotice:weeklyLyricsCustomNotice,
    previous:weeklyLyricsPrevious,
    previousButton:weeklyLyricsPreviousButton,
    previousMeta:weeklyLyricsPreviousMeta,
    textEditor:weeklyLyricsTextEditor,
    textarea:weeklyLyricsTextarea,
    psalmEditor:weeklyPsalmEditor,
    psalmSections:weeklyPsalmSections,
    psalmFallback:weeklyPsalmFallback,
  },
  parts:MUSIC_PARTS,
  weeklyLyrics:WeeklyLyrics,
  getStore:()=>planStore,
  getSongs:plannerState.songs,
  getDate:()=>current().d,
  isEditor:()=>isEditor,
  isOnline:()=>navigator.onLine,
  openModal,
  onStatus:setSyncStatus,
  onSummaryChanged:parts=>{
    weeklyLyricsParts=new Set(parts);
    renderMusicPlan();
  },
  formatDate:fmtPicker,
  logger:appLogger,
});
weeklyLyricsController.start();
const songRequestController=SongRequestController.create({
  elements:{
    musicList,
    dialog:songRequestDialog,
    form:songRequestForm,
    context:songRequestContext,
    close:songRequestClose,
    cancel:songRequestCancel,
    search:songRequestSearch,
    results:songRequestResults,
    title:songRequestTitle,
    youtube:songRequestYoutube,
    note:songRequestNote,
    error:songRequestError,
    submit:songRequestSubmit,
  },
  parts:MUSIC_PARTS,
  songRequests:SongRequests,
  getStore:()=>planStore,
  canSuggest:()=>canSuggest,
  isOnline:()=>navigator.onLine,
  getDate:()=>current().d,
  formatDate:fmtLong,
  openModal,
  onStatus:setSyncStatus,
  onCreated:()=>songRequestReviewController.refresh(),
  logger:appLogger,
});
songRequestController.start();
const songRequestReviewController=SongRequestReviewController.create({
  elements:{
    launch:songRequestsLaunch,
    dialog:songRequestsDialog,
    close:songRequestsClose,
    list:songRequestsList,
    empty:songRequestsEmpty,
    error:songRequestsError,
  },
  parts:MUSIC_PARTS,
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  isOnline:()=>navigator.onLine,
  openModal,
  onStatus:setSyncStatus,
  formatDate:fmtPicker,
  youtubeWatchUrl:SongPresentation.youtubeWatchUrl,
  logger:appLogger,
});
songRequestReviewController.start();
AuthController.create({
  button:authButton,
  dialog:loginDialog,
  form:loginForm,
  cancelButton:loginCancel,
  titleElement:loginTitle,
  descriptionElement:loginDescription,
  emailField:loginEmailField,
  emailInput:loginEmail,
  passwordInput:loginPassword,
  modeButton:loginMode,
  submitButton:loginSubmit,
  errorElement:loginError,
  getStore:()=>planStore,
  isSignedIn:()=>signedIn,
  openDialog:openModal,
  scheduleFocus:callback=>setTimeout(callback,0),
  onUnavailable:()=>setSyncStatus("Sign-in unavailable","error"),
  onActionFailure:()=>setSyncStatus("Sign-in failed","error"),
  logger:appLogger,
}).start();

// pick nearest Sunday to a chosen date
function selectSunday(sunday,{updateUrl=true,replaceUrl=false}={}){
  weeklyLyricsController.close();
  plannerState.setSunday(sunday);
  weeklyLyricsParts=new Set();
  if(updateUrl) DateUrlState.write(window,sunday.d,{replace:replaceUrl});
  refresh();
  subscribeToCurrentPlan();
}

function goToDate(iso,{updateUrl=true,replaceUrl=false}={}){
  const selection=calendarNavigation.selectionFor(iso);
  if(!selection){
    warn.style.display="block";
    warn.textContent="Choose a valid date.";
    return;
  }
  warn.style.display="none";
  selectSunday(selection.sunday,{updateUrl,replaceUrl});
}

const lyricsPptxController=LyricsPptxController.create({
  button:downloadLyricsPptx,
  status:lyricsPptxStatus,
  document,
  parts:MUSIC_PARTS,
  presentation:LyricsPresentation,
  exportController:LyricsExportController,
  getStore:()=>planStore,
  getSongs:plannerState.songs,
  getDate:()=>current().d,
  getValues:vals,
  canReadLyrics:()=>canReadLyrics,
  isOnline:()=>navigator.onLine,
  logger:appLogger,
});
lyricsPptxController.start();
const lyricsSlidesController=LyricsSlidesController.create({
  button:downloadLyricsSlidesPdf,
  status:lyricsPptxStatus,
  document,
  parts:MUSIC_PARTS,
  presentation:LyricsPresentation,
  exportController:LyricsExportController,
  getStore:()=>planStore,
  getSongs:plannerState.songs,
  getDate:()=>current().d,
  getValues:vals,
  canReadLyrics:()=>canReadLyrics,
  isOnline:()=>navigator.onLine,
  logger:appLogger,
});
lyricsSlidesController.start();
const lyricsBookletController=LyricsBookletController.create({
  button:printLyricsBooklet,
  status:lyricsPptxStatus,
  document,
  parts:MUSIC_PARTS,
  presentation:LyricsPresentation,
  booklet:LyricsBooklet,
  exportController:LyricsExportController,
  getStore:()=>planStore,
  getSongs:plannerState.songs,
  getDate:()=>current().d,
  getValues:vals,
  canReadLyrics:()=>canReadLyrics,
  isOnline:()=>navigator.onLine,
  logger:appLogger,
});
lyricsBookletController.start();

// wire up
function upcomingSunday(){
  return calendarNavigation.upcomingSunday(new Date().toISOString().slice(0,10));
}
prev.addEventListener("click", ()=>{
  selectSunday(calendarNavigation.previousSunday(current()));
});
next.addEventListener("click", ()=>{
  selectSunday(calendarNavigation.nextSunday(current()));
});
document.getElementById("today").addEventListener("click", ()=>{
  selectSunday(upcomingSunday());
});
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
window.addEventListener("popstate",()=>{
  const urlDate=DateUrlState.read(location);
  goToDate(urlDate || upcomingSunday().d,{updateUrl:false});
});
refresh();
renderMusicPlan();
if(initialUrlDate && initialUrlDate!==current().d){
  DateUrlState.write(window,current().d,{replace:true});
}

// iPhone/iPad uses Safari's Share → Add to Home Screen flow.
PwaController.createInstallController({
  window,
  navigator,
  button:installApp,
  showIosInstructions(){
    alert("In Safari, tap the Share button, then choose “Add to Home Screen”.");
  },
}).start();
PwaController.registerServiceWorker({
  window,
  navigator,
  location,
});
