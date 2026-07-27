@@MODAL_CONTROLLER_JS@@
@@PWA_CONTROLLER_JS@@
@@LITURGICAL_CALENDAR_JS@@
@@CALENDAR_NAVIGATION_JS@@
@@AUTH_CONTROLLER_JS@@
@@PLAN_SESSION_CONTROLLER_JS@@
@@PLANNER_STATE_JS@@
@@SONG_FORM_JS@@
@@PRINT_CONTROLLER_JS@@
@@MUSIC_PARTS_JS@@
@@SONG_PRESENTATION_JS@@
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
const READINGS = @@READINGS@@;
const MUSIC_PARTS=MassMusicParts.parts;
const lectionary=LectionaryCatalog.create({
  liturgicalCalendar:LiturgicalCalendar,
  sundayLectionary:SUNDAY_LECTIONARY,
  celebrations:CELEBRATIONS,
  commons:COMMONS,
  readings:READINGS,
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
  publicAttribution:attributionLine,
  editorAttribution:SongPresentation.editorPlanAttribution,
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
const songPickerView=SongPickerView.create({escapeHtml:esc});
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
const songForm=SongForm.create({
  title:songTitle,
  youtubeUrl:songYoutube,
  authors:songAuthors,
  copyrightOwner:songCopyrightOwner,
  copyrightYear:songCopyrightYear,
  source:songSource,
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
let signedIn = false;

const plannerState=PlannerState.create({
  initialSunday:calendarNavigation.upcomingSunday(new Date().toISOString().slice(0,10)),
  readingSlots:READING_SLOTS,
  scheduledCelebration:sunday=>lectionary.scheduledCelebration(sunday),
  formatLong:fmtLong,
  cycleName,
});
function current(){ return plannerState.current(); }
function baseCelebration(){ return plannerState.baseCelebration(); }
function vals(){ return plannerState.values(); }
function textFor(citation){ return READINGS[citation] || ""; }
function choiceFor(key){ return musicPlanView.choiceFor(plannerState.songs(),key); }
function renderMusicPlan(){
  const view=musicPlanView.render({parts:MUSIC_PARTS,songs:plannerState.songs(),isEditor});
  editorHelp.hidden=view.editorHelpHidden;
  musicIntro.textContent=view.intro;
  musicList.innerHTML=view.html;
  musicList.dataset.mode=view.mode;
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
  logger:console,
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
    renderMusicPlan();
    refresh();
  },
  onPlan:(plan)=>{
    plannerState.applyPlan(plan);
    renderMusicPlan();
    refresh();
  },
  onAuth:(auth)=>{
    isEditor=!!auth.isEditor;
    signedIn=!!auth.user;
    authButton.textContent=signedIn ? "Sign out" : "Sign in";
    if(!isEditor){
      readingWorkflow.closeAll();
      songWorkflow.closeAll();
    }
    renderMusicPlan();
    readingWorkflow.renderEditor();
  },
  onStatus:setSyncStatus,
  logger:console,
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
    editorDialog:songEditorDialog,
    editorForm:songEditorForm,
    editorEyebrow:songEditorEyebrow,
    editorTitle:songEditorTitle,
    editorContext:songEditorContext,
    editorClose:songEditorClose,
    editorCancel:songEditorCancel,
    sharedWarning:songSharedWarning,
    editorError:songEditorError,
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
  logger:console,
});
songWorkflow.start();
AuthController.create({
  button:authButton,
  dialog:loginDialog,
  form:loginForm,
  cancelButton:loginCancel,
  emailInput:loginEmail,
  passwordInput:loginPassword,
  submitButton:loginSubmit,
  errorElement:loginError,
  getStore:()=>planStore,
  isSignedIn:()=>signedIn,
  openDialog:openModal,
  scheduleFocus:callback=>setTimeout(callback,0),
  onUnavailable:()=>setSyncStatus("Editor sign-in unavailable","error"),
  onActionFailure:()=>setSyncStatus("Sign-in failed","error"),
}).start();

// pick nearest Sunday to a chosen date
function goToDate(iso){
  const selection=calendarNavigation.selectionFor(iso);
  if(!selection){
    warn.style.display="block";
    warn.textContent="Choose a valid date.";
    return;
  }
  warn.style.display="none";
  plannerState.setSunday(selection.sunday);
  refresh();
  subscribeToCurrentPlan();
}

const printController=PrintController.create({
  window,
  root:printSheet,
  render:mode=>{
    const value=vals();
    return PrintController.renderSheet({
      mode,
      celebration:value.day,
      meta:value.meta,
      musicParts:MUSIC_PARTS,
      readings:[
        {key:"first",label:"First Reading",citation:value.first,text:textFor(value.first)},
        {key:"psalm",label:"Responsorial Psalm",citation:value.psalm,text:textFor(value.psalm)},
        {key:"second",label:"Second Reading",citation:value.second,text:textFor(value.second)},
        {key:"gospel",label:"Gospel",citation:value.gospel,text:textFor(value.gospel)},
      ],
      choiceFor,
      attributionLine,
      copyrightComplete,
    });
  },
});
printController.start();

// wire up
function upcomingSunday(){
  return calendarNavigation.upcomingSunday(new Date().toISOString().slice(0,10));
}
prev.addEventListener("click", ()=>{
  plannerState.setSunday(calendarNavigation.previousSunday(current()));
  refresh();
  subscribeToCurrentPlan();
});
next.addEventListener("click", ()=>{
  plannerState.setSunday(calendarNavigation.nextSunday(current()));
  refresh();
  subscribeToCurrentPlan();
});
document.getElementById("today").addEventListener("click", ()=>{
  plannerState.setSunday(upcomingSunday());
  refresh();
  subscribeToCurrentPlan();
});
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
printMusic.addEventListener("click", ()=>printController.print("music"));
printMusicReadings.addEventListener("click", ()=>printController.print("music-readings"));

refresh();
renderMusicPlan();

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
