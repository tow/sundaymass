@@MODAL_CONTROLLER_JS@@
@@PWA_CONTROLLER_JS@@
@@CALENDAR_NAVIGATION_JS@@
@@AUTH_CONTROLLER_JS@@
@@SONG_FORM_JS@@
@@PRINT_CONTROLLER_JS@@
@@MUSIC_PARTS_JS@@
@@SONG_PRESENTATION_JS@@
@@MUSIC_PLAN_VIEW_JS@@
@@READING_PLAN_VIEW_JS@@
@@SONG_PICKER_VIEW_JS@@
@@CELEBRATION_PICKER_VIEW_JS@@
@@SONG_CATALOG_JS@@
@@PLAN_MUSIC_DATA_JS@@
@@LECTIONARY_CATALOG_JS@@
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
const songPickerView=SongPickerView.create({escapeHtml:esc});
const celebrationPickerView=CelebrationPickerView.create({
  escapeHtml:esc,
  formatLong:fmtLong,
  cycleName,
  dayDistance:lectionary.dayDistance,
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
let stopPlanSubscription = null;
let stopAuthSubscription = null;
let showingCachedPlan = false;
let isEditor = false;
let signedIn = false;
let editingReadingSlot = null;
let pendingReadingSelection = null;
let pendingCelebration = null;
let editingSongPart = null;
let selectedSong = null;
let visibleSongs = [];
let editingSong = null;
let suggestedSongs = [];

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
function readingSlot(key){ return READING_SLOTS.find(slot=>slot.key===key); }
function computedCitation(slot){ return baseCelebration().readings?.[slot.key] || ""; }
function displayedCitation(slot){ return readingOverrides[slot.key]?.citation || computedCitation(slot); }
function setReadingStatus(text,state){
  readingSaveStatus.textContent=text || "";
  readingSaveStatus.dataset.state=state || "";
}
function renderReadingEditor(){
  liturgicalEditLaunch.hidden=!isEditor;
  if(!isEditor) return;
  const celebration=baseCelebration();
  celebrationCurrent.classList.toggle("changed",!!celebrationOverride);
  celebrationCurrent.innerHTML='<div class="celebration-current-label">Celebration for this Mass'
    +'<span class="reading-status-badge'+(celebrationOverride?' changed':'')+'">'+(celebrationOverride?'Changed':'Computed')+'</span></div>'
    +'<div class="celebration-current-name">'+esc(celebration.name)+'</div>'
    +'<div class="celebration-current-meta">'+(celebrationOverride
      ? esc((celebration.rank||"Celebration")+" · normally "+fmtLong(celebration.sourceDate))
      : esc(fmtLong(current().d)+" · "+current().s+" · "+cycleName(current().c)))+'</div>';
  restoreCelebration.hidden=!celebrationOverride;
  const changed=READING_SLOTS.filter(slot=>readingOverrides[slot.key]);
  readingEditorList.innerHTML=READING_SLOTS.map(slot=>{
    const adjusted=!!readingOverrides[slot.key];
    return '<div class="reading-editor-row"><div><div class="reading-editor-label">'+esc(slot.label)
      +'<span class="reading-status-badge'+(adjusted?' changed':'')+'">'+(adjusted?'Changed':(celebrationOverride?'Selected Mass':'Computed'))+'</span></div>'
      +'<div class="reading-editor-cite">'+(esc(displayedCitation(slot))||"—")+'</div></div>'
      +'<div class="reading-editor-actions"><button type="button" data-reading-action="change" data-reading-slot="'+slot.key+'">Change</button>'
      +(adjusted?'<button type="button" data-reading-action="restore" data-reading-slot="'+slot.key+'">Restore</button>':'')+'</div></div>';
  }).join("");
  readingEditorFooter.hidden=changed.length===0;
}
let visibleCelebrationCandidates=[];
function renderCelebrationPreview(){
  const view=celebrationPickerView.renderPreview(pendingCelebration);
  celebrationPreview.innerHTML=view.html;
  celebrationPreview.hidden=view.hidden;
  celebrationUse.disabled=view.useDisabled;
}
function renderCelebrationResults(){
  const view=celebrationPickerView.search({
    candidates:lectionary.availableCelebrations(current()),
    currentSunday:current(),
    query:celebrationSearch.value,
    selectedId:pendingCelebration?.id || "",
  });
  visibleCelebrationCandidates=view.candidates;
  celebrationResultsHeading.textContent=view.heading;
  celebrationResults.innerHTML=view.html;
}
function openCelebrationDialog(){
  pendingCelebration=null;
  celebrationSearch.value="";
  celebrationUse.textContent="Use this celebration";
  celebrationDialogContext.textContent="For the Mass on "+fmtLong(current().d);
  renderCelebrationResults();
  renderCelebrationPreview();
  openModal(celebrationDialog);
  setTimeout(()=>celebrationSearch.focus(),0);
}
function suggestedCitations(slot){
  const computed=computedCitation(slot);
  const alternatives=citationAlternatives(computed);
  if(alternatives.length===1) return [{citation:computed,label:computed,note:"Computed for this celebration",isDefault:true}];
  return alternatives.map((citation,index)=>({
    citation,
    label:citation,
    note:index===0 ? "Longer form" : "Shorter or alternative form",
    isDefault:false,
  }));
}
function fillReadingOptions(slot){
  const suggestions=suggestedCitations(slot);
  readingSuggested.innerHTML=suggestions.map((option,index)=>
    '<label class="suggested-reading"><input type="radio" name="suggestedReading" value="'+esc(option.citation)+'" data-default="'+(option.isDefault?'true':'false')+'">'
    +'<span><strong>'+esc(option.label)+'</strong><small>'+esc(option.note)+'</small></span></label>'
  ).join("");
  readingCitationOptions.innerHTML=Array.from(ROLE_CITATIONS[slot.key].values()).sort((a,b)=>a.localeCompare(b)).map(citation=>'<option value="'+esc(citation)+'"></option>').join("");
  readingSearchHelp.textContent="Only "+slot.label.toLowerCase()+" passages contained in this app’s lectionary data can be selected.";
}
function showReadingValidation(message,state){
  readingValidation.textContent=message || "";
  readingValidation.className="reading-validation"+(state?" "+state:"");
}
function validateReadingSelection(){
  pendingReadingSelection=null;
  readingUse.disabled=true;
  readingTextPreview.hidden=true;
  ordoConfirmWrap.hidden=true;
  const slot=readingSlot(editingReadingSlot);
  if(!slot) return;
  const raw=readingCitationInput.value.trim();
  if(!raw){
    showReadingValidation("Choose one of the options above or enter a citation.","");
    return;
  }
  const computed=computedCitation(slot);
  const suggestions=suggestedCitations(slot);
  const defaultOption=suggestions.find(option=>option.isDefault && normalizedCitation(option.citation)===normalizedCitation(raw));
  if(defaultOption){
    pendingReadingSelection={slot:slot.key,citation:computed,isDefault:true,requiresConfirmation:false};
    readingTextPreview.innerHTML='<strong>Full text preview</strong>'+esc(READINGS[computed] || "The text is not available in this app.");
    readingTextPreview.hidden=false;
    showReadingValidation("This restores the computed reading.","valid");
    readingUse.textContent="Use computed reading";
    readingUse.disabled=false;
    return;
  }
  const canonical=ROLE_CITATIONS[slot.key].get(normalizedCitation(raw));
  if(!canonical){
    const otherRoles=CITATION_ROLES[normalizedCitation(raw)] || [];
    if(otherRoles.length){
      const labels=otherRoles.map(key=>readingSlot(key).label.toLowerCase()).join(" or ");
      showReadingValidation("That passage is known as a "+labels+", not a "+slot.label.toLowerCase()+".","error");
    }else{
      showReadingValidation("That citation is not in the available "+slot.label.toLowerCase()+" lectionary passages.","error");
    }
    return;
  }
  const parsed=parseReadingCitation(canonical);
  const text=READINGS[canonical];
  if(!parsed || !text){
    showReadingValidation("This passage is missing a valid citation or full text and cannot be selected.","error");
    return;
  }
  const approved=suggestions.some(option=>normalizedCitation(option.citation)===normalizedCitation(canonical));
  const requiresConfirmation=!approved;
  pendingReadingSelection={
    slot:slot.key,
    citation:canonical,
    book:parsed.book,
    segments:parsed.segments,
    origin:approved ? "ordo-option" : "lectionary-catalog",
    translation:"World English Bible",
    textVersion:"embedded-2026-07",
    requiresConfirmation,
  };
  readingCitationInput.value=canonical;
  readingTextPreview.innerHTML='<strong>Full text preview</strong>'+esc(text);
  readingTextPreview.hidden=false;
  ordoConfirmWrap.hidden=!requiresConfirmation;
  showReadingValidation(requiresConfirmation ? "Valid for this reading slot. Confirm the non-standard selection below." : "Valid option for this celebration.","valid");
  readingUse.textContent="Use reading";
  readingUse.disabled=requiresConfirmation && !ordoConfirm.checked;
}
function openReadingDialog(key){
  const slot=readingSlot(key);
  if(!slot || !isEditor) return;
  editingReadingSlot=key;
  pendingReadingSelection=null;
  readingDialogTitle.textContent=slot.label;
  readingDialogContext.textContent=baseCelebration().name+" · "+fmtLong(current().d);
  fillReadingOptions(slot);
  const suggestions=suggestedCitations(slot);
  readingCitationInput.value=readingOverrides[key]?.citation || suggestions[0]?.citation || computedCitation(slot);
  readingSuggested.querySelectorAll('input[name="suggestedReading"]').forEach(input=>{
    input.checked=normalizedCitation(input.value)===normalizedCitation(readingCitationInput.value);
  });
  ordoConfirm.checked=false;
  readingUse.textContent="Use reading";
  validateReadingSelection();
  openModal(readingDialog);
  setTimeout(()=>readingCitationInput.focus(),0);
}
async function restoreReadingOverride(slotKey){
  if(!planStore || !isEditor) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearReadingOverride(current().d,slotKey);
    delete readingOverrides[slotKey];
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
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
function subscribeToCurrentPlan(){
  if(stopPlanSubscription){ stopPlanSubscription(); stopPlanSubscription=null; }
  musicSongs={};
  readingOverrides={};
  celebrationOverride=null;
  showingCachedPlan=false;
  renderMusicPlan();
  refresh();
  if(!planStore){ setSyncStatus("Connecting…",""); return; }
  setSyncStatus("Loading…","");
  stopPlanSubscription=planStore.subscribePlan(current().d,(plan,meta)=>{
    musicSongs=plan?.songs || {};
    readingOverrides=plan?.readingOverrides || {};
    celebrationOverride=plan?.celebrationOverride || null;
    renderMusicPlan();
    refresh();
    const offline=meta && meta.offline;
    showingCachedPlan=Boolean(offline && meta.cached);
    setSyncStatus(
      offline ? (meta.cached ? "Offline — showing saved copy" : "Offline — no saved plan") : "Up to date",
      offline ? "" : "saved",
    );
  },(error,meta={})=>{
    console.error(error);
    if(meta.offline || !navigator.onLine){
      setSyncStatus(
        showingCachedPlan || meta.cached ? "Offline — showing saved copy" : "Offline — no saved plan",
        showingCachedPlan || meta.cached ? "" : "error",
      );
    }else{
      setSyncStatus("Could not load plan","error");
    }
  });
}
function connectPlanStore(store){
  planStore=store;
  if(stopAuthSubscription) stopAuthSubscription();
  stopAuthSubscription=store.subscribeAuth(auth=>{
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
  });
  subscribeToCurrentPlan();
}
window.massPlanApp={connect:connectPlanStore};

function songPart(key){ return MUSIC_PARTS.find(part=>part.key===key); }
function currentReadingCitations(){
  return READING_SLOTS.map(slot=>displayedCitation(slot)).filter(Boolean);
}
function renderSongResults(){
  const view=songPickerView.renderSearchResults({songs:visibleSongs,selectedSong});
  songResults.innerHTML=view.html;
  songResults.hidden=!view.hasResults;
  songResultsHeading.hidden=!view.hasResults;
  songPickerEmpty.hidden=view.hasResults;
  useSong.disabled=view.useDisabled;
}
function renderSongSuggestions(){
  const view=songPickerView.renderSuggestions({songs:suggestedSongs,selectedSong});
  songSuggestionResults.innerHTML=view.html;
  songSuggestionStatus.hidden=view.hasSuggestions;
}
async function loadSongSuggestions(){
  suggestedSongs=[];
  songSuggestionStatus.hidden=false;
  songSuggestionStatus.textContent="Finding related songs…";
  renderSongSuggestions();
  try{
    suggestedSongs=(await planStore.suggestSongs(currentReadingCitations(),suggestionPartFor(editingSongPart))).slice(0,3);
    songSuggestionStatus.textContent=suggestedSongs.length
      ? ""
      : "Suggestions are not indexed for these readings yet.";
  }catch(error){
    console.warn("Could not load suggestions",error);
    songSuggestionStatus.textContent="Suggestions are not available yet.";
  }
  renderSongSuggestions();
}
let songSearchRequest=0;
async function searchSongCatalog(){
  if(!isEditor || !planStore) return;
  const query=songSearch.value;
  const request=++songSearchRequest;
  try{
    const matches=await planStore.searchSongs(query);
    if(request!==songSearchRequest) return;
    visibleSongs=matches;
    selectedSong=null;
    renderSongResults();
  }catch(error){
    if(request!==songSearchRequest) return;
    console.error(error);
    visibleSongs=[];
    renderSongResults();
    songPickerEmpty.hidden=false;
    songPickerEmpty.textContent="Could not load songs. Please try again.";
  }
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
    searchSongCatalog();
    if(window.matchMedia("(min-width:701px)").matches){
      setTimeout(()=>songSearch.focus({preventScroll:true}),0);
    }
  }
}
async function openSongPicker(partKey){
  if(!isEditor) return;
  editingSongPart=partKey;
  selectedSong=null;
  visibleSongs=[];
  suggestedSongs=[];
  const part=songPart(partKey);
  const currentSong=musicSongs[partKey];
  const currentSelection=songPickerView.currentSelection(currentSong);
  songPickerTitle.textContent="Choose "+(part?.label || "song");
  songCurrentActions.hidden=currentSelection.hidden;
  songCurrentName.textContent=currentSelection.name;
  songCurrentAuthor.textContent=currentSelection.author;
  songSearch.value="";
  songPickerEmpty.textContent="No matching songs.";
  renderSongResults();
  setSongPickerMode("suggested");
  openModal(songPickerDialog);
  await loadSongSuggestions();
}
function closeSongPicker(){
  songSearchRequest++;
  songPickerDialog.close();
  selectedSong=null;
}
function songDraftFromForm(){
  return songForm.read();
}
function fillSongForm(song){
  songForm.write(song,{
    fallbackTitle:songSearch.value.trim(),
    defaultSuggestionParts:[suggestionPartFor(editingSongPart)],
  });
}
function openSongEditor(song){
  if(!isEditor || !editingSongPart) return;
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
  if(songPickerDialog.open) songPickerDialog.close();
  openModal(songEditorDialog);
  setTimeout(()=>songTitle.focus(),0);
}
function closeSongEditor(){
  songEditorDialog.close();
  editingSong=null;
}
async function runSongMutation(work,success){
  if(!navigator.onLine){
    setSyncStatus("Offline — editing unavailable","error");
    throw new Error("Editing requires an internet connection");
  }
  setSyncStatus("Saving…","");
  try{
    await work();
    setSyncStatus(success,"saved");
  }catch(error){
    console.error(error);
    setSyncStatus(navigator.onLine ? "Save failed" : "Offline — editing unavailable","error");
    throw error;
  }
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
  songSearchTimer=setTimeout(searchSongCatalog,180);
});
songPickerModes.addEventListener("click",event=>{
  const button=event.target.closest("[data-song-picker-mode]");
  if(button) setSongPickerMode(button.dataset.songPickerMode);
});
songResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-song-index]");
  if(!button) return;
  selectedSong=visibleSongs[Number(button.dataset.songIndex)] || null;
  renderSongResults();
});
songSuggestionResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-song-suggestion-index]");
  if(!button)return;
  selectedSong=suggestedSongs[Number(button.dataset.songSuggestionIndex)]||null;
  renderSongSuggestions();
  renderSongResults();
});
editCurrentSong.addEventListener("click",async ()=>{
  const currentSong=musicSongs[editingSongPart];
  if(!currentSong || !isEditor) return;
  setSyncStatus("Loading song…","");
  try{
    const song=await planStore.getSong(currentSong.id);
    setSyncStatus("Up to date","saved");
    openSongEditor(song);
  }catch(error){
    console.error(error);
    setSyncStatus("Could not load song","error");
  }
});
removeCurrentSong.addEventListener("click",async ()=>{
  const part=editingSongPart;
  const currentSong=musicSongs[part];
  if(!currentSong || !isEditor) return;
  if(!confirm("Remove “"+currentSong.title+"” from "+(songPart(part)?.label || "this part")+"? The shared song will remain available.")) return;
  try{
    await runSongMutation(()=>planStore.clearSong(current().d,part),"Saved");
    delete musicSongs[part];
    closeSongPicker();
    renderMusicPlan();
  }catch(error){}
});
useSong.addEventListener("click",async ()=>{
  if(!selectedSong || !editingSongPart) return;
  const part=editingSongPart;
  try{
    await runSongMutation(()=>planStore.assignSong(current().d,part,selectedSong.id),"Saved");
    musicSongs[part]=selectedSong;
    closeSongPicker();
    renderMusicPlan();
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
    if(editingSong){
      const updated=await planStore.updateSong(editingSong.id,validation.value);
      planStore.syncSongEmbedding(updated.id).catch(error=>console.warn("Song indexing failed",error));
      Object.keys(musicSongs).forEach(part=>{
        if(musicSongs[part]?.id===updated.id) musicSongs[part]=updated;
      });
      setSyncStatus("Saved","saved");
    }else{
      const created=await planStore.createAndAssignSong(current().d,editingSongPart,validation.value);
      planStore.syncSongEmbedding(created.id).catch(error=>console.warn("Song indexing failed",error));
      musicSongs[editingSongPart]=created;
      setSyncStatus("Saved","saved");
    }
    closeSongEditor();
    renderMusicPlan();
  }catch(error){
    console.error(error);
    songEditorError.textContent=error.message || "Could not save the song.";
    setSyncStatus("Save failed","error");
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
  pendingCelebration=null;
  renderCelebrationResults();
  renderCelebrationPreview();
});
celebrationResults.addEventListener("click",event=>{
  const button=event.target.closest("button[data-celebration-index]");
  if(!button) return;
  pendingCelebration=visibleCelebrationCandidates[Number(button.dataset.celebrationIndex)] || null;
  renderCelebrationResults();
  renderCelebrationPreview();
  celebrationPreview.scrollIntoView({block:"nearest"});
});
celebrationPreview.addEventListener("change",event=>{
  const select=event.target.closest("select[data-celebration-reading]");
  if(!select || !pendingCelebration || !isEditor) return;
  pendingCelebration.readings[select.dataset.celebrationReading]=select.value;
});
function closeCelebrationDialog(){
  celebrationDialog.close();
  pendingCelebration=null;
}
celebrationDialogClose.addEventListener("click",closeCelebrationDialog);
celebrationCancel.addEventListener("click",closeCelebrationDialog);
celebrationDialog.addEventListener("click",event=>{ if(event.target===celebrationDialog) closeCelebrationDialog(); });
celebrationForm.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!pendingCelebration || !isEditor || !planStore || celebrationUse.disabled) return;
  const selection=pendingCelebration;
  const payload={
    id:selection.id,
    name:selection.name,
    sourceDate:selection.sourceDate,
    rank:selection.rank,
    season:selection.season,
    cycle:selection.cycle,
    lectionary:selection.lectionary || "",
    source:selection.source || "Standard lectionary",
    readings:selection.readings,
    checkedAgainstOrdo:true,
  };
  celebrationUse.disabled=true;
  celebrationUse.textContent="Saving…";
  setReadingStatus("Saving…","");
  try{
    await planStore.saveCelebrationOverride(current().d,payload);
    celebrationOverride=payload;
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
    closeCelebrationDialog();
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
    celebrationUse.disabled=false;
    celebrationUse.textContent="Use this celebration";
  }
});
restoreCelebration.addEventListener("click",async ()=>{
  if(!isEditor || !planStore) return;
  if(!confirm("Restore the computed Sunday celebration and all of its readings?")) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearCelebrationOverride(current().d);
    celebrationOverride=null;
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
});
readingEditorList.addEventListener("click",event=>{
  const button=event.target.closest("button[data-reading-action]");
  if(!button || !isEditor) return;
  if(button.dataset.readingAction==="change") openReadingDialog(button.dataset.readingSlot);
  if(button.dataset.readingAction==="restore") restoreReadingOverride(button.dataset.readingSlot);
});
restoreAllReadings.addEventListener("click",async ()=>{
  if(!isEditor || !planStore) return;
  if(!confirm("Restore all individual readings to the selected celebration?")) return;
  setReadingStatus("Saving…","");
  try{
    await planStore.clearReadingOverride(current().d,null);
    readingOverrides={};
    refresh();
    setReadingStatus("Saved","saved");
  }catch(error){
    console.error(error);
    setReadingStatus("Save failed","error");
  }
});
readingSuggested.addEventListener("change",event=>{
  const input=event.target.closest('input[name="suggestedReading"]');
  if(!input) return;
  readingCitationInput.value=input.value;
  ordoConfirm.checked=false;
  validateReadingSelection();
});
readingCitationInput.addEventListener("input",()=>{
  readingSuggested.querySelectorAll('input[name="suggestedReading"]').forEach(input=>{
    input.checked=normalizedCitation(input.value)===normalizedCitation(readingCitationInput.value);
  });
  ordoConfirm.checked=false;
  validateReadingSelection();
});
ordoConfirm.addEventListener("change",validateReadingSelection);
function closeReadingDialog(){
  readingDialog.close();
  editingReadingSlot=null;
  pendingReadingSelection=null;
}
readingDialogClose.addEventListener("click",closeReadingDialog);
readingCancel.addEventListener("click",closeReadingDialog);
readingDialog.addEventListener("click",event=>{ if(event.target===readingDialog) closeReadingDialog(); });
readingForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const selection=pendingReadingSelection;
  if(!selection || !isEditor || !planStore || readingUse.disabled) return;
  readingUse.disabled=true;
  readingUse.textContent="Saving…";
  setReadingStatus("Saving…","");
  try{
    if(selection.isDefault){
      await planStore.clearReadingOverride(current().d,selection.slot);
      delete readingOverrides[selection.slot];
    }else{
      const readingOverride={
        citation:selection.citation,
        book:selection.book,
        segments:selection.segments,
        origin:selection.origin,
        translation:selection.translation,
        textVersion:selection.textVersion,
        checkedAgainstOrdo:selection.requiresConfirmation ? ordoConfirm.checked : true,
      };
      await planStore.saveReadingOverride(current().d,selection.slot,readingOverride);
      readingOverrides[selection.slot]=readingOverride;
    }
    refresh();
    setReadingStatus("Saved","saved");
    closeReadingDialog();
  }catch(error){
    console.error(error);
    showReadingValidation("The reading could not be saved. Please try again.","error");
    setReadingStatus("Save failed","error");
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
