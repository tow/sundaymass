@@MODAL_CONTROLLER_JS@@
@@PWA_CONTROLLER_JS@@
@@CALENDAR_NAVIGATION_JS@@
@@AUTH_CONTROLLER_JS@@
@@PLAN_SESSION_CONTROLLER_JS@@
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
@@CELEBRATION_PICKER_VIEW_JS@@
@@CELEBRATION_CONTROLLER_JS@@
@@READING_OVERRIDE_CONTROLLER_JS@@
@@READING_DIALOG_CONTROLLER_JS@@
@@SONG_CATALOG_JS@@
@@PLAN_MUSIC_DATA_JS@@
@@LECTIONARY_CATALOG_JS@@
@@READING_SELECTION_JS@@
const CALENDAR = @@CALENDAR@@;
const SUNDAY_LECTIONARY = @@SUNDAY_LECTIONARY@@;
const CELEBRATIONS = @@CELEBRATIONS@@;
const COMMONS = @@COMMONS@@;
const READINGS = @@READINGS@@;
const MUSIC_PARTS=MassMusicParts.parts;
const lectionary=LectionaryCatalog.create({
  calendar:CALENDAR,
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
const calendarNavigation=CalendarNavigation.create(CALENDAR);
const songForm=SongForm.create({
  title:songTitle,
  youtubeUrl:songYoutube,
  authors:songAuthors,
  copyrightOwner:songCopyrightOwner,
  copyrightYear:songCopyrightYear,
  source:songSource,
  lyrics:songLyrics,
  suggestionParts:songSuggestionParts,
});
function cycleName(c){ return "Year " + c; }
function fmtLong(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}); }
function fmtPicker(iso){ const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); }
function esc(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
let curIdx = 0;  // index into CALENDAR
let musicSongs = {};
let readingOverrides = {};
let celebrationOverride = null;
let planStore = null;
let isEditor = false;
let signedIn = false;
let editingSong = null;
let songPickerState = {
  open:false,
  partKey:null,
  selectedSong:null,
  searchResults:[],
  searchStatus:"idle",
  suggestions:[],
  suggestionStatus:"idle",
};
let celebrationPickerState = {
  open:false,
  query:"",
  selectedCelebration:null,
  results:{heading:"",candidates:[],html:""},
  preview:{hidden:true,useDisabled:true,html:""},
  saving:false,
};
let readingDialogState = {
  open:false,
  slotKey:null,
  slotLabel:"",
  suggestions:[],
  citationOptions:[],
  input:"",
  selectedSuggestion:"",
  confirmed:false,
  pendingSelection:null,
  validation:{
    message:"",
    state:"",
    previewText:"",
    previewHidden:true,
    confirmHidden:true,
    buttonLabel:"Use reading",
    useDisabled:true,
  },
};

function current(){ return CALENDAR[curIdx]; }
function baseCelebration(){
  const sunday=current();
  return celebrationOverride || lectionary.scheduledCelebration(sunday);
}
function vals(){
  const s = current();
  const celebration=baseCelebration();
  const citationFor=slot=>readingOverrides[slot.key]?.citation || celebration.readings?.[slot.key] || "";
  const baseMeta=celebrationOverride
    ? (celebration.rank || "Celebration")+" · normally "+fmtLong(celebration.sourceDate)
    : s.s+" · "+cycleName(s.c);
  return {
    day: celebration.name,
    meta: fmtLong(s.d) + "  ·  " + baseMeta,
    first: citationFor(READING_SLOTS[0]), psalm: citationFor(READING_SLOTS[1]),
    second: citationFor(READING_SLOTS[2]), gospel: citationFor(READING_SLOTS[3]),
    date: s.d,
  };
}
function textFor(citation){ return READINGS[citation] || ""; }
function choiceFor(key){ return musicPlanView.choiceFor(musicSongs,key); }
function renderMusicPlan(){
  const view=musicPlanView.render({parts:MUSIC_PARTS,songs:musicSongs,isEditor});
  editorHelp.hidden=view.editorHelpHidden;
  musicIntro.textContent=view.intro;
  musicList.innerHTML=view.html;
  musicList.dataset.mode=view.mode;
}
function computedCitation(slot){ return baseCelebration().readings?.[slot.key] || ""; }
function displayedCitation(slot){ return readingOverrides[slot.key]?.citation || computedCitation(slot); }
function setReadingStatus(text,state){
  readingSaveStatus.textContent=text || "";
  readingSaveStatus.dataset.state=state || "";
}
function renderReadingEditor(){
  const view=readingEditorView.render({
    isEditor,
    celebration:baseCelebration(),
    celebrationOverride,
    sunday:current(),
    readingOverrides,
    readingSlots:READING_SLOTS,
    citations:Object.fromEntries(READING_SLOTS.map(slot=>[
      slot.key,
      displayedCitation(slot),
    ])),
  });
  liturgicalEditLaunch.hidden=view.launchHidden;
  if(!view.editorVisible) return;
  celebrationCurrent.classList.toggle("changed",view.celebrationChanged);
  celebrationCurrent.innerHTML=view.celebrationHtml;
  restoreCelebration.hidden=view.restoreCelebrationHidden;
  readingEditorList.innerHTML=view.readingsHtml;
  readingEditorFooter.hidden=view.footerHidden;
}
const celebrationController=CelebrationController.create({
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  getDate:()=>current().d,
  getCurrentSunday:current,
  getCandidates:()=>lectionary.availableCelebrations(current()),
  pickerView:celebrationPickerView,
  confirmRestore:message=>confirm(message),
  onChange:state=>{
    celebrationPickerState=state;
    renderCelebrationResults();
    renderCelebrationPreview();
    if(!state.open && celebrationDialog.open) celebrationDialog.close();
  },
  onStatus:setReadingStatus,
  onSaved:payload=>{
    celebrationOverride=payload;
    readingOverrides={};
    refresh();
  },
  onRestored:()=>{
    celebrationOverride=null;
    readingOverrides={};
    refresh();
  },
  logger:console,
});
const readingOverrideController=ReadingOverrideController.create({
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  getDate:()=>current().d,
  confirmAll:message=>confirm(message),
  onStatus:setReadingStatus,
  onOverrideChanged:(slot,value)=>{
    if(value) readingOverrides[slot]=value;
    else delete readingOverrides[slot];
    refresh();
  },
  onAllRestored:()=>{
    readingOverrides={};
    refresh();
  },
  logger:console,
});
const readingDialogController=ReadingDialogController.create({
  readingSlots:READING_SLOTS,
  roleCitations:ROLE_CITATIONS,
  selectionPolicy:readingSelection,
  normalizedCitation,
  isEditor:()=>isEditor,
  getComputedCitation:computedCitation,
  getExistingCitation:slot=>readingOverrides[slot.key]?.citation || "",
  onChange:state=>{
    readingDialogState=state;
    renderReadingDialog();
    if(!state.open && readingDialog.open) readingDialog.close();
  },
});
function renderCelebrationPreview(){
  const view=celebrationPickerState.preview;
  celebrationPreview.innerHTML=view.html;
  celebrationPreview.hidden=view.hidden;
  celebrationUse.disabled=view.useDisabled || celebrationPickerState.saving;
  celebrationUse.textContent=celebrationPickerState.saving
    ? "Saving…"
    : "Use this celebration";
}
function renderCelebrationResults(){
  const view=celebrationPickerState.results;
  celebrationResultsHeading.textContent=view.heading;
  celebrationResults.innerHTML=view.html;
}
function openCelebrationDialog(){
  if(!celebrationController.open()) return;
  celebrationSearch.value="";
  celebrationDialogContext.textContent="For the Mass on "+fmtLong(current().d);
  openModal(celebrationDialog);
  setTimeout(()=>celebrationSearch.focus(),0);
}
function renderReadingDialog(){
  readingDialogTitle.textContent=readingDialogState.slotLabel;
  readingSuggested.innerHTML=readingDialogState.suggestions.map(option=>
    '<label class="suggested-reading"><input type="radio" name="suggestedReading" value="'+esc(option.citation)+'" data-default="'+(option.isDefault?'true':'false')+'">'
    +'<span><strong>'+esc(option.label)+'</strong><small>'+esc(option.note)+'</small></span></label>'
  ).join("");
  readingCitationOptions.innerHTML=readingDialogState.citationOptions
    .map(citation=>'<option value="'+esc(citation)+'"></option>')
    .join("");
  readingSearchHelp.textContent=readingDialogState.slotLabel
    ? "Only "+readingDialogState.slotLabel.toLowerCase()+" passages contained in this app’s lectionary data can be selected."
    : "";
  readingCitationInput.value=readingDialogState.input;
  readingSuggested.querySelectorAll('input[name="suggestedReading"]').forEach(input=>{
    input.checked=normalizedCitation(input.value)===normalizedCitation(readingDialogState.selectedSuggestion);
  });
  ordoConfirm.checked=readingDialogState.confirmed;
  readingValidation.textContent=readingDialogState.validation.message;
  readingValidation.className="reading-validation"
    +(readingDialogState.validation.state?" "+readingDialogState.validation.state:"");
  readingTextPreview.innerHTML='<strong>Full text preview</strong>'
    +esc(readingDialogState.validation.previewText);
  readingTextPreview.hidden=readingDialogState.validation.previewHidden;
  ordoConfirmWrap.hidden=readingDialogState.validation.confirmHidden;
  readingUse.textContent=readingDialogState.validation.buttonLabel;
  readingUse.disabled=readingDialogState.validation.useDisabled;
}
function openReadingDialog(key){
  if(!readingDialogController.open(key)) return;
  readingDialogContext.textContent=baseCelebration().name+" · "+fmtLong(current().d);
  openModal(readingDialog);
  setTimeout(()=>readingCitationInput.focus(),0);
}
async function restoreReadingOverride(slotKey){
  await readingOverrideController.restore(slotKey);
}
function renderReadingPlan(){
  const view=readingPlanView.render({
    sunday:current(),
    celebration:baseCelebration(),
    celebrationOverride,
    readingOverrides,
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
  syncDateControl(); renderReadingPlan(); renderReadingEditor();
  prev.disabled=curIdx===0; next.disabled=curIdx===CALENDAR.length-1;
  today.hidden=curIdx===nextSundayIdx();
  const v = vals();
  if(!v.gospel && !v.first){ warn.style.display="block"; warn.textContent="This day has proper readings that are not in the dataset. Please confirm them against the parish Ordo."; }
  else if(warn.textContent.indexOf("outside the computed")<0){ warn.style.display="none"; }
}

function setSyncStatus(text,state){
  syncStatus.textContent=text;
  syncStatus.dataset.state=state || "";
}
const planSessionController=PlanSessionController.create({
  getDate:()=>current().d,
  isOnline:()=>navigator.onLine,
  onReset:()=>{
    musicSongs={};
    readingOverrides={};
    celebrationOverride=null;
    renderMusicPlan();
    refresh();
  },
  onPlan:(plan)=>{
    musicSongs=plan?.songs || {};
    readingOverrides=plan?.readingOverrides || {};
    celebrationOverride=plan?.celebrationOverride || null;
    renderMusicPlan();
    refresh();
  },
  onAuth:(auth)=>{
    isEditor=!!auth.isEditor;
    signedIn=!!auth.user;
    authButton.textContent=signedIn ? "Sign out" : "Sign in";
    if(!isEditor){
      if(liturgicalDialog.open) liturgicalDialog.close();
      if(celebrationDialog.open) celebrationDialog.close();
      if(readingDialog.open) readingDialog.close();
      if(songPickerDialog.open) songPickerDialog.close();
      if(songEditorDialog.open) songEditorDialog.close();
    }
    renderMusicPlan();
    renderReadingEditor();
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

function songPart(key){ return MUSIC_PARTS.find(part=>part.key===key); }
function currentReadingCitations(){
  return READING_SLOTS.map(slot=>displayedCitation(slot)).filter(Boolean);
}
const songPickerController=SongPickerController.create({
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  getReadingCitations:currentReadingCitations,
  suggestionPartFor,
  onChange:state=>{
    songPickerState=state;
    renderSongResults();
    renderSongSuggestions();
  },
  logger:console,
});
const songMutationController=SongMutationController.create({
  getStore:()=>planStore,
  isEditor:()=>isEditor,
  isOnline:()=>navigator.onLine,
  getDate:()=>current().d,
  onStatus:setSyncStatus,
  onAssigned:(part,song)=>{
    musicSongs[part]=song;
    renderMusicPlan();
  },
  onCleared:part=>{
    delete musicSongs[part];
    renderMusicPlan();
  },
  onUpdated:song=>{
    Object.keys(musicSongs).forEach(part=>{
      if(musicSongs[part]?.id===song.id) musicSongs[part]=song;
    });
    renderMusicPlan();
  },
  logger:console,
});
function renderSongResults(){
  const view=songPickerView.renderSearchResults({
    songs:songPickerState.searchResults,
    selectedSong:songPickerState.selectedSong,
  });
  songResults.innerHTML=view.html;
  songResults.hidden=!view.hasResults;
  songResultsHeading.hidden=!view.hasResults;
  songPickerEmpty.hidden=view.hasResults;
  songPickerEmpty.textContent=songPickerState.searchStatus==="error"
    ? "Could not load songs. Please try again."
    : "No matching songs.";
  useSong.disabled=view.useDisabled;
}
function renderSongSuggestions(){
  const view=songPickerView.renderSuggestions({
    songs:songPickerState.suggestions,
    selectedSong:songPickerState.selectedSong,
  });
  songSuggestionResults.innerHTML=view.html;
  songSuggestionStatus.hidden=view.hasSuggestions;
  songSuggestionStatus.textContent={
    loading:"Finding related songs…",
    empty:"Suggestions are not indexed for these readings yet.",
    error:"Suggestions are not available yet.",
  }[songPickerState.suggestionStatus] || "";
}
function setSongPickerMode(mode){
  if(mode==="create"){ openSongEditor(null); return; }
  songSuggestedPanel.hidden=mode!=="suggested";
  songSearchPanel.hidden=mode!=="search";
  songPickerModes.querySelectorAll("[data-song-picker-mode]").forEach(button=>{
    const selected=button.dataset.songPickerMode===mode;
    button.classList.toggle("selected",selected);
    button.setAttribute("aria-pressed",String(selected));
  });
  songPickerDialog.querySelector(".reading-dialog-body").scrollTop=0;
  if(mode==="search"){
    songPickerController.search(songSearch.value);
    if(window.matchMedia("(min-width:701px)").matches){
      setTimeout(()=>songSearch.focus({preventScroll:true}),0);
    }
  }
}
async function openSongPicker(partKey){
  if(!isEditor || !planStore) return;
  const part=songPart(partKey);
  const currentSong=musicSongs[partKey];
  const currentSelection=songPickerView.currentSelection(currentSong);
  songPickerTitle.textContent="Choose "+(part?.label || "song");
  songCurrentActions.hidden=currentSelection.hidden;
  songCurrentName.textContent=currentSelection.name;
  songCurrentAuthor.textContent=currentSelection.author;
  songSearch.value="";
  songPickerEmpty.textContent="No matching songs.";
  setSongPickerMode("suggested");
  openModal(songPickerDialog);
  await songPickerController.open(partKey);
}
function closeSongPicker(){
  songPickerController.close();
  songPickerDialog.close();
}
function songDraftFromForm(){
  return songForm.read();
}
function fillSongForm(song){
  songForm.write(song,{
    fallbackTitle:songSearch.value.trim(),
    defaultSuggestionParts:[suggestionPartFor(songPickerState.partKey)],
  });
}
function openSongEditor(song){
  if(!isEditor || !songPickerState.partKey) return;
  editingSong=song || null;
  fillSongForm(editingSong);
  songEditorEyebrow.textContent=editingSong ? "Shared song" : "New song";
  songEditorTitle.textContent=editingSong ? "Edit song" : "Add a new song";
  songEditorContext.textContent=editingSong
    ? "Update the shared song record."
    : "Only the title is required. Another song may use the same title.";
  songSharedWarning.hidden=!editingSong;
  saveSong.textContent=editingSong ? "Save song" : "Create and use song";
  songEditorError.textContent="";
  if(songPickerDialog.open){
    songPickerDialog.close();
    songPickerController.close();
  }
  openModal(songEditorDialog);
  setTimeout(()=>songTitle.focus(),0);
}
function closeSongEditor(){
  songEditorDialog.close();
  editingSong=null;
}
musicList.addEventListener("click",async event=>{
  const button=event.target.closest("button[data-song-action]");
  if(!button || !isEditor) return;
  const part=button.dataset.part;
  if(button.dataset.songAction==="choose"){
    openSongPicker(part);
  }
});
let songSearchTimer=null;
songSearch.addEventListener("input",()=>{
  clearTimeout(songSearchTimer);
  songSearchTimer=setTimeout(()=>songPickerController.search(songSearch.value),180);
});
songPickerModes.addEventListener("click",event=>{
  const button=event.target.closest("[data-song-picker-mode]");
  if(button) setSongPickerMode(button.dataset.songPickerMode);
});
songResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-song-index]");
  if(!button) return;
  songPickerController.selectSearchResult(button.dataset.songIndex);
});
songSuggestionResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-song-suggestion-index]");
  if(!button)return;
  songPickerController.selectSuggestion(button.dataset.songSuggestionIndex);
});
editCurrentSong.addEventListener("click",async ()=>{
  const currentSong=musicSongs[songPickerState.partKey];
  if(!currentSong || !isEditor) return;
  try{
    const song=await songMutationController.load(currentSong.id);
    openSongEditor(song);
  }catch(error){}
});
removeCurrentSong.addEventListener("click",async ()=>{
  const part=songPickerState.partKey;
  const currentSong=musicSongs[part];
  if(!currentSong || !isEditor) return;
  if(!confirm("Remove “"+currentSong.title+"” from "+(songPart(part)?.label || "this part")+"? The shared song will remain available.")) return;
  try{
    await songMutationController.clear(part);
    closeSongPicker();
  }catch(error){}
});
useSong.addEventListener("click",async ()=>{
  const selectedSong=songPickerState.selectedSong;
  if(!selectedSong || !songPickerState.partKey) return;
  const part=songPickerState.partKey;
  try{
    await songMutationController.assign(part,selectedSong);
    closeSongPicker();
  }catch(error){}
});
songEditorForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const validation=SongCatalog.validateDraft(songDraftFromForm());
  if(!validation.valid){
    songEditorError.textContent=validation.error;
    songTitle.focus();
    return;
  }
  saveSong.disabled=true;
  const previousLabel=saveSong.textContent;
  saveSong.textContent="Saving…";
  try{
    await songMutationController.save({
      existingSong:editingSong,
      part:songPickerState.partKey,
      draft:validation.value,
    });
    closeSongEditor();
  }catch(error){
    songEditorError.textContent=error.message || "Could not save the song.";
  }finally{
    saveSong.disabled=false;
    saveSong.textContent=previousLabel;
  }
});
songPickerClose.addEventListener("click",closeSongPicker);
songPickerDialog.addEventListener("click",event=>{ if(event.target===songPickerDialog) closeSongPicker(); });
songEditorClose.addEventListener("click",closeSongEditor);
songEditorCancel.addEventListener("click",closeSongEditor);
songEditorDialog.addEventListener("click",event=>{ if(event.target===songEditorDialog) closeSongEditor(); });
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
openLiturgicalEditor.addEventListener("click",()=>{
  if(!isEditor) return;
  renderReadingEditor();
  openModal(liturgicalDialog);
});
function closeLiturgicalDialog(){ liturgicalDialog.close(); }
liturgicalDialogClose.addEventListener("click",closeLiturgicalDialog);
liturgicalDialog.addEventListener("click",event=>{ if(event.target===liturgicalDialog) closeLiturgicalDialog(); });
chooseCelebration.addEventListener("click",openCelebrationDialog);
celebrationSearch.addEventListener("input",()=>{
  celebrationController.search(celebrationSearch.value);
});
celebrationResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-celebration-index]");
  if(!button) return;
  celebrationController.select(button.dataset.celebrationIndex);
  celebrationPreview.scrollIntoView({block:"nearest"});
});
celebrationPreview.addEventListener("change",event=>{
  const select=event.target.closest("select[data-celebration-reading]");
  if(!select) return;
  celebrationController.setReading(select.dataset.celebrationReading,select.value);
});
function closeCelebrationDialog(){
  celebrationController.close();
}
celebrationDialogClose.addEventListener("click",closeCelebrationDialog);
celebrationCancel.addEventListener("click",closeCelebrationDialog);
celebrationDialog.addEventListener("click",event=>{ if(event.target===celebrationDialog) closeCelebrationDialog(); });
celebrationForm.addEventListener("submit",async event=>{
  event.preventDefault();
  await celebrationController.save();
});
restoreCelebration.addEventListener("click",async ()=>{
  await celebrationController.restore();
});
readingEditorList.addEventListener("click",event=>{
  const button=event.target.closest("button[data-reading-action]");
  if(!button || !isEditor) return;
  if(button.dataset.readingAction==="change") openReadingDialog(button.dataset.readingSlot);
  if(button.dataset.readingAction==="restore") restoreReadingOverride(button.dataset.readingSlot);
});
restoreAllReadings.addEventListener("click",async ()=>{
  await readingOverrideController.restoreAll();
});
readingSuggested.addEventListener("change",event=>{
  const input=event.target.closest('input[name="suggestedReading"]');
  if(!input) return;
  readingDialogController.chooseSuggestion(input.value);
});
readingCitationInput.addEventListener("input",()=>{
  readingDialogController.setInput(readingCitationInput.value);
});
ordoConfirm.addEventListener("change",()=>{
  readingDialogController.setConfirmed(ordoConfirm.checked);
});
function closeReadingDialog(){
  readingDialogController.close();
}
readingDialogClose.addEventListener("click",closeReadingDialog);
readingCancel.addEventListener("click",closeReadingDialog);
readingDialog.addEventListener("click",event=>{ if(event.target===readingDialog) closeReadingDialog(); });
readingForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const selection=readingDialogState.pendingSelection;
  if(!selection || !isEditor || !planStore || readingUse.disabled) return;
  readingUse.disabled=true;
  readingUse.textContent="Saving…";
  const saved=await readingOverrideController.save(selection,readingDialogState.confirmed);
  if(saved){
    closeReadingDialog();
  }else{
    readingValidation.textContent="The reading could not be saved. Please try again.";
    readingValidation.className="reading-validation error";
    readingUse.textContent=selection.isDefault ? "Use computed reading" : "Use reading";
    readingUse.disabled=false;
  }
});

// pick nearest Sunday to a chosen date
function goToDate(iso){
  const selection=calendarNavigation.selectionFor(iso);
  if(selection.index<0){
    warn.style.display="block";
    warn.textContent="Choose a valid date.";
    return;
  }
  if(selection.withinRange) warn.style.display="none";
  else{
    warn.style.display="block";
    warn.textContent="That date is outside the computed range (2025–2075).";
  }
  curIdx=selection.index; refresh(); subscribeToCurrentPlan();
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
function nextSundayIdx(){ return calendarNavigation.upcomingIndex(new Date().toISOString().slice(0,10)); }
prev.addEventListener("click", ()=>{ const index=calendarNavigation.previousIndex(curIdx); if(index!==curIdx){curIdx=index; refresh(); subscribeToCurrentPlan();} });
next.addEventListener("click", ()=>{ const index=calendarNavigation.nextIndex(curIdx); if(index!==curIdx){curIdx=index; refresh(); subscribeToCurrentPlan();} });
document.getElementById("today").addEventListener("click", ()=>{ curIdx=nextSundayIdx(); refresh(); subscribeToCurrentPlan(); });
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
printMusic.addEventListener("click", ()=>printController.print("music"));
printMusicReadings.addEventListener("click", ()=>printController.print("music-readings"));

curIdx=nextSundayIdx(); refresh(); renderMusicPlan();

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
