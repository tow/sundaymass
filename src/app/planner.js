@@SONG_CATALOG_JS@@
@@PLAN_MUSIC_DATA_JS@@
@@LECTIONARY_CATALOG_JS@@
const CALENDAR = @@CALENDAR@@;
const SUNDAY_LECTIONARY = @@SUNDAY_LECTIONARY@@;
const CELEBRATIONS = @@CELEBRATIONS@@;
const COMMONS = @@COMMONS@@;
const PARTS = @@PARTS@@;
const PARTS2 = @@PARTS2@@;
const READINGS = @@READINGS@@;
const MUSIC_PARTS = [
  {key:"entrance",token:"ENTRANCE",label:"Entrance / Processional Hymn",note:""},
  {key:"kyrie",token:"KYRIE",label:"Kyrie — Lord, Have Mercy",note:""},
  {key:"gloria",token:"GLORIA",label:"Gloria — Glory to God",note:"(omitted in Advent & Lent)"},
  {key:"psalm",token:"PSALM_MUSIC",label:"Responsorial Psalm",note:""},
  {key:"acclamation",token:"ACCLAMATION",label:"Gospel Acclamation — Alleluia",note:"(Lenten acclamation in Lent)"},
  {key:"offertory",token:"OFFERTORY",label:"Preparation of the Gifts / Offertory",note:""},
  {key:"sanctus",token:"SANCTUS",label:"Sanctus — Holy, Holy, Holy",note:""},
  {key:"memorial",token:"MEMORIAL",label:"Memorial Acclamation — Mystery of Faith",note:""},
  {key:"amen",token:"AMEN",label:"Great Amen",note:""},
  {key:"lordPrayer",token:"LORD_PRAYER",label:"The Lord's Prayer — Our Father",note:"(if sung)"},
  {key:"agnus",token:"AGNUS",label:"Agnus Dei — Lamb of God",note:""},
  {key:"communion",token:"COMMUNION",label:"Communion Hymn 1",note:""},
  {key:"communion2",token:"COMMUNION_2",label:"Communion Hymn 2",note:""},
  {key:"recessional",token:"RECESSIONAL",label:"Recessional / Closing Hymn",note:""},
];
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
const dayDistance=lectionary.dayDistance;
const byDate = {}; CALENDAR.forEach((s,i)=>byDate[s.d]=i);
const cycleName = c => "Year " + c;
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
let modalPageScrollY = null;

function current(){ return CALENDAR[curIdx]; }
function openModal(dialog){
  if(modalPageScrollY===null){
    modalPageScrollY=window.scrollY;
    document.body.style.setProperty("--modal-page-top","-"+modalPageScrollY+"px");
    document.documentElement.classList.add("modal-open");
  }
  dialog.showModal();
}
function restoreModalPageScroll(){
  if(document.querySelector("dialog[open]") || modalPageScrollY===null) return;
  const scrollY=modalPageScrollY;
  modalPageScrollY=null;
  document.documentElement.classList.remove("modal-open");
  document.body.style.removeProperty("--modal-page-top");
  window.scrollTo(0,scrollY);
}
document.addEventListener("close",()=>requestAnimationFrame(restoreModalPageScroll),true);
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
function choiceFor(key){
  const value=musicSongs[key] || {};
  return {
    song:value.title || "",
    youtubeUrl:value.youtubeUrl || "",
    authors:value.authors || "",
    copyrightOwner:value.copyrightOwner || "",
    copyrightYear:value.copyrightYear || "",
    source:value.source || "",
  };
}
function safeYoutubeUrl(value){
  if(!value) return "";
  try{
    const url=new URL(value);
    const host=url.hostname.toLowerCase().replace(/^www\./,"");
    return url.protocol==="https:" && (host==="youtube.com" || host.endsWith(".youtube.com") || host==="youtu.be") ? url.href : "";
  }catch(error){ return ""; }
}
function musicLabel(part){
  return esc(part.label)+(part.note?'<span class="music-part-note">'+esc(part.note)+'</span>':'');
}
function copyrightComplete(choice){
  if(!choice.song) return true;
  const publicDomain=/\bpublic domain\b/i.test(choice.copyrightOwner);
  return !!(choice.authors.trim() && choice.copyrightOwner.trim() && (choice.copyrightYear.trim() || publicDomain));
}
function attributionLine(choice){
  const items=[];
  if(choice.authors.trim()) items.push("Authors: "+choice.authors.trim());
  const publicDomain=/\bpublic domain\b/i.test(choice.copyrightOwner);
  const copyright=[choice.copyrightYear.trim(),choice.copyrightOwner.trim()].filter(Boolean).join(" ");
  if(copyright) items.push(publicDomain ? copyright : "© "+copyright);
  if(choice.source.trim()) items.push("Source: "+choice.source.trim());
  return items.join(" · ");
}
function editorAttributionLine(choice){
  const items=[];
  if(choice.authors.trim()) items.push(choice.authors.trim());
  const publicDomain=/\bpublic domain\b/i.test(choice.copyrightOwner);
  const copyright=[choice.copyrightYear.trim(),choice.copyrightOwner.trim()].filter(Boolean).join(" ");
  if(copyright) items.push(publicDomain ? copyright : "© "+copyright);
  if(choice.source.trim()) items.push(choice.source.trim());
  return items.join(" · ");
}
function renderMusicPlan(){
  editorHelp.hidden=!isEditor;
  musicIntro.textContent=isEditor ? "Choose or add a song for each part." : "Selections for this Sunday appear here as they are chosen.";
  if(isEditor){
    musicList.innerHTML=MUSIC_PARTS.map(part=>{
      const song=musicSongs[part.key];
      const choice=choiceFor(part.key);
      const link=safeYoutubeUrl(choice.youtubeUrl);
      const attribution=editorAttributionLine(choice);
      const incomplete=choice.song && !copyrightComplete(choice);
      return '<div class="music-edit-row"><div class="music-part-label">'+musicLabel(part)+'</div>'
        +(song
          ? '<div class="music-editor-choice"><strong>'+esc(song.title)+'</strong>'
            +(attribution?'<span class="music-attribution">'+esc(attribution)+'</span>':'')
            +(incomplete?'<span class="music-attribution copyright-warning">Copyright information incomplete</span>':'')
            +(link?'<a class="listen-link" href="'+esc(link)+'" target="_blank" rel="noopener">Listen / practise ↗</a>':'')
            +'</div><div class="music-editor-actions assigned">'
            +'<button type="button" data-song-action="choose" data-part="'+part.key+'">Change</button>'
            +'</div>'
          : '<div class="music-editor-actions empty"><button class="primary choose-song" type="button" data-song-action="choose" data-part="'+part.key+'">Choose song</button></div>')
        +'</div>';
    }).join("");
    musicList.dataset.mode="edit";
  }else{
    musicList.innerHTML=MUSIC_PARTS.map(part=>{
      const choice=choiceFor(part.key);
      const link=safeYoutubeUrl(choice.youtubeUrl);
      const attribution=attributionLine(choice);
      const incomplete=choice.song && !copyrightComplete(choice);
      return '<div class="music-view-row"><div class="music-part-label">'+musicLabel(part)+'</div><div class="music-choice">'
        +(choice.song?esc(choice.song):'<span class="music-empty">Not yet chosen</span>')
        +(attribution?'<span class="music-attribution">'+esc(attribution)+'</span>':'')
        +(incomplete?'<span class="music-attribution copyright-warning">Copyright information incomplete</span>':'')
        +(link?'<a class="listen-link" href="'+esc(link)+'" target="_blank" rel="noopener">Listen / practise ↗</a>':'')+'</div></div>';
    }).join("");
    musicList.dataset.mode="view";
  }
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
function searchText(value){
  return (value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
let visibleCelebrationCandidates=[];
function celebrationMeta(candidate){
  return (candidate.rank||"Celebration")+" · "+fmtLong(candidate.sourceDate)
    +(candidate.cycle && candidate.rank==="Sunday" ? " · "+cycleName(candidate.cycle) : "")
    +(candidate.lectionary ? " · Lectionary "+candidate.lectionary : "");
}
function renderCelebrationPreview(){
  if(!pendingCelebration){ celebrationPreview.hidden=true; celebrationUse.disabled=true; return; }
  const readings=pendingCelebration.readings;
  const field=(slot,label)=>{
    const options=pendingCelebration.readingOptions?.[slot] || [];
    const allowNone=slot==="second" && !pendingCelebration.requiresSecondReading && !readings.second;
    if(options.length<=1 && !allowNone) return '<dt>'+esc(label)+'</dt><dd>'+(esc(readings[slot])||"—")+'</dd>';
    return '<dt><label for="celebrationReading_'+slot+'">'+esc(label)+'</label></dt><dd><select id="celebrationReading_'+slot+'" data-celebration-reading="'+slot+'">'
      +(slot==="second" && !pendingCelebration.requiresSecondReading?'<option value="">No second reading</option>':'')
      +options.map(citation=>'<option value="'+esc(citation)+'"'+(citation===readings[slot]?' selected':'')+'>'+esc(citation)+'</option>').join("")
      +'</select></dd>';
  };
  celebrationPreview.innerHTML='<h3>'+esc(pendingCelebration.name)+'</h3><p>'+esc(celebrationMeta(pendingCelebration))+'</p>'
    +'<dl class="celebration-preview-grid">'+field("first","First Reading")+field("psalm","Psalm")
    +field("second","Second Reading")+field("gospel","Gospel")+'</dl>'
    +(pendingCelebration.commonNames?.length
      ? '<p class="celebration-options-note">Reading choices include '+esc(pendingCelebration.commonNames.join(" and "))+".</p>"
      : "");
  celebrationPreview.hidden=false;
  celebrationUse.disabled=false;
}
function renderCelebrationResults(){
  const query=searchText(celebrationSearch.value);
  const anchor=current().d;
  const all=lectionary.availableCelebrations(current()).filter(candidate=>!(candidate.sourceDate===current().d && candidate.name===current().n));
  if(query){
    celebrationResultsHeading.textContent="Matching celebrations";
    visibleCelebrationCandidates=all.filter(candidate=>{
      const haystack=searchText(candidate.name+" "+candidate.rank+" "+fmtLong(candidate.sourceDate)+" "+(candidate.cycle||"")+" "+(candidate.commonNames||[]).join(" "));
      return query.split(" ").every(word=>haystack.includes(word));
    }).sort((a,b)=>a.name.localeCompare(b.name) || a.sourceDate.localeCompare(b.sourceDate)).slice(0,40);
  }else{
    celebrationResultsHeading.textContent="Nearby celebrations";
    visibleCelebrationCandidates=all.filter(candidate=>Math.abs(dayDistance(candidate.sourceDate,anchor))<=14)
      .sort((a,b)=>Math.abs(dayDistance(a.sourceDate,anchor))-Math.abs(dayDistance(b.sourceDate,anchor)) || a.sourceDate.localeCompare(b.sourceDate))
      .slice(0,30);
  }
  celebrationResults.innerHTML=visibleCelebrationCandidates.length
    ? visibleCelebrationCandidates.map((candidate,index)=>'<button class="celebration-result'+(pendingCelebration?.id===candidate.id?' selected':'')+'" type="button" data-celebration-index="'+index+'"><strong>'+esc(candidate.name)+'</strong><small>'+esc(celebrationMeta(candidate))+'</small></button>').join("")
    : '<p class="reading-validation">No available celebration matches that search.</p>';
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
function renderFullReadings(){
  const v = vals();
  readingsIntro.textContent=v.day+" · "+v.meta;
  const blk = (slot,id,label,cite,text) => '<article class="rblock reading-anchor" id="'+id+'"><div class="rhead">'+esc(label)+'<span class="rcite">'+esc(cite)+'</span>'
    +(celebrationOverride || readingOverrides[slot]?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</div><div class="rtext">'+(esc(text)||'<em>(see citation)</em>')+'</div></article>';
  readingTexts.innerHTML =
    blk("first","reading-first","First Reading",v.first,textFor(v.first))
    + blk("psalm","reading-psalm","Responsorial Psalm",v.psalm,textFor(v.psalm)||"(sung — see citation)")
    + blk("second","reading-second","Second Reading",v.second,textFor(v.second))
    + blk("gospel","reading-gospel","Gospel",v.gospel,textFor(v.gospel))
    + '<div class="rpcaveat">Scripture: World English Bible (public domain). Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div>';
}
function renderResolved(){
  const s=current();
  const celebration=baseCelebration();
  resolved.innerHTML = '<span class="selected-date">'+fmtLong(s.d)+'</span>'
    + '<span class="selected-day">'+esc(celebration.name)+(celebrationOverride?'<span class="reading-adjusted-note">Changed celebration</span>':'')+'</span>'
    + '<span class="selected-meta">'+(celebrationOverride
      ? esc((celebration.rank||"Celebration")+" · normally "+fmtLong(celebration.sourceDate))
      : esc(s.s)+' · '+cycleName(s.c))+'</span>';
}
function renderReadingSummary(){
  const v=vals();
  const readings=[
    ["first","First Reading",v.first,"reading-first"],
    ["psalm","Responsorial Psalm",v.psalm,"reading-psalm"],
    ["second","Second Reading",v.second,"reading-second"],
    ["gospel","Gospel",v.gospel,"reading-gospel"],
  ];
  const anyAdjusted=!!celebrationOverride || READING_SLOTS.some(slot=>readingOverrides[slot.key]);
  readingSummary.innerHTML='<div class="reading-summary-title">Readings for this Mass'+(anyAdjusted?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</div><div class="reading-grid">'
    + readings.map(r=>'<a class="reading-item'+(celebrationOverride || readingOverrides[r[0]]?' changed':'')+'" href="#'+r[3]+'"><span class="reading-label">'+esc(r[1])+(readingOverrides[r[0]]?'<span class="reading-adjusted-note">Adjusted</span>':'')+'</span><span class="reading-cite">'+(esc(r[2])||"—")+'</span></a>').join('')
    + '</div>';
}
function syncDateControl(){
  date.value=current().d;
  dateDisplay.textContent=fmtPicker(current().d);
}
function refresh(){
  syncDateControl(); renderResolved(); renderReadingSummary(); renderFullReadings(); renderReadingEditor();
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
    setSyncStatus(meta && meta.offline ? "Offline — showing saved copy" : "Up to date",meta && meta.offline ? "" : "saved");
  },error=>{
    console.error(error);
    setSyncStatus("Could not load plan","error");
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
function songResultDescription(song){
  const items=[song.authors,song.copyrightYear,song.copyrightOwner,song.source].filter(Boolean);
  if(song.hasLyrics) items.push("Lyrics recorded");
  const sameTitle=visibleSongs.filter(value=>value.title.trim().toLocaleLowerCase()===song.title.trim().toLocaleLowerCase());
  if(sameTitle.length>1) items.push("Separate record "+song.id.slice(0,8));
  return items.join(" · ") || "No additional details";
}
function renderSongResults(){
  createSongAction.textContent=SongCatalog.creationActionLabel(songSearch.value);
  songResults.innerHTML=visibleSongs.map((song,index)=>{
    const selected=selectedSong?.id===song.id;
    return '<button class="song-result'+(selected?' selected':'')+'" type="button" data-song-index="'+index+'" aria-pressed="'+selected+'">'
      +'<strong>'+esc(song.title)+'</strong><span>'+esc(songResultDescription(song))+'</span></button>';
  }).join("");
  songResults.hidden=!visibleSongs.length;
  songResultsHeading.hidden=!visibleSongs.length;
  songPickerEmpty.hidden=!!visibleSongs.length;
  useSong.disabled=!selectedSong;
}
function renderSongSuggestions(){
  songSuggestionResults.innerHTML=suggestedSongs.map((song,index)=>{
    const selected=selectedSong?.id===song.id;
    return '<button class="song-suggestion'+(selected?' selected':'')+'" type="button" data-song-suggestion-index="'+index+'">'
      +'<strong>'+esc(song.title)+'</strong><span>'+esc(song.authors || "Author not recorded")+'</span></button>';
  }).join("");
  songSuggestionStatus.hidden=!!suggestedSongs.length;
}
async function loadSongSuggestions(){
  suggestedSongs=[];
  songSuggestionStatus.hidden=false;
  songSuggestionStatus.textContent="Finding related songs…";
  renderSongSuggestions();
  try{
    suggestedSongs=(await planStore.suggestSongs(currentReadingCitations())).slice(0,3);
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
  createSongAction.textContent=SongCatalog.creationActionLabel(query);
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
async function openSongPicker(partKey){
  if(!isEditor) return;
  editingSongPart=partKey;
  selectedSong=null;
  visibleSongs=[];
  suggestedSongs=[];
  const part=songPart(partKey);
  const currentSong=musicSongs[partKey];
  songPickerTitle.textContent="Choose "+(part?.label || "song");
  songPickerContext.textContent="Any song can be used in any part of the Mass. Search the whole repertoire, or create another song even when a title already exists.";
  songCurrentActions.hidden=!currentSong;
  songCurrentName.textContent=currentSong?.title || "";
  songCurrentAuthor.textContent=currentSong?.authors || "Author not recorded";
  songSearch.value="";
  songPickerEmpty.textContent="No matching songs. You can still create a new one above.";
  renderSongResults();
  songPickerDialog.querySelector(".reading-dialog-body").scrollTop=0;
  openModal(songPickerDialog);
  await Promise.all([searchSongCatalog(),loadSongSuggestions()]);
  if(window.matchMedia("(min-width:701px)").matches){
    setTimeout(()=>songSearch.focus({preventScroll:true}),0);
  }
}
function closeSongPicker(){
  songSearchRequest++;
  songPickerDialog.close();
  selectedSong=null;
}
function songDraftFromForm(){
  return {
    title:songTitle.value,
    youtubeUrl:songYoutube.value,
    authors:songAuthors.value,
    copyrightOwner:songCopyrightOwner.value,
    copyrightYear:songCopyrightYear.value,
    source:songSource.value,
    lyrics:songLyrics.value,
  };
}
function fillSongForm(song){
  songTitle.value=song?.title || songSearch.value.trim();
  songYoutube.value=song?.youtubeUrl || "";
  songAuthors.value=song?.authors || "";
  songCopyrightOwner.value=song?.copyrightOwner || "";
  songCopyrightYear.value=song?.copyrightYear || "";
  songSource.value=song?.source || "";
  songLyrics.value=song?.lyrics || "";
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
  setSyncStatus("Saving…","");
  try{
    await work();
    setSyncStatus(navigator.onLine ? success : "Saved offline","saved");
  }catch(error){
    console.error(error);
    setSyncStatus("Save failed","error");
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
  createSongAction.textContent=SongCatalog.creationActionLabel(songSearch.value);
  songSearchTimer=setTimeout(searchSongCatalog,180);
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
createSongAction.addEventListener("click",()=>openSongEditor(null));
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
songPickerCancel.addEventListener("click",closeSongPicker);
songPickerDialog.addEventListener("click",event=>{ if(event.target===songPickerDialog) closeSongPicker(); });
songEditorClose.addEventListener("click",closeSongEditor);
songEditorCancel.addEventListener("click",closeSongEditor);
songEditorDialog.addEventListener("click",event=>{ if(event.target===songEditorDialog) closeSongEditor(); });
authButton.addEventListener("click",async ()=>{
  if(!planStore){ setSyncStatus("Editor sign-in unavailable","error"); return; }
  try{
    if(signedIn) await planStore.signOut();
    else{
      loginError.textContent="";
      openModal(loginDialog);
      setTimeout(()=>loginEmail.focus(),0);
    }
  }catch(error){
    console.error(error);
    setSyncStatus("Sign-in failed","error");
  }
});
loginCancel.addEventListener("click",()=>loginDialog.close());
loginDialog.addEventListener("click",event=>{
  if(event.target===loginDialog) loginDialog.close();
});
loginForm.addEventListener("submit",async event=>{
  event.preventDefault();
  loginError.textContent="";
  loginSubmit.disabled=true;
  loginSubmit.textContent="Signing in…";
  try{
    await planStore.signIn(loginEmail.value.trim(),loginPassword.value);
    loginPassword.value="";
    loginDialog.close();
  }catch(error){
    console.error(error);
    loginError.textContent="Sign-in failed. Check the email and password.";
  }finally{
    loginSubmit.disabled=false;
    loginSubmit.textContent="Sign in";
  }
});
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
  if(byDate[iso]!==undefined){ curIdx=byDate[iso]; warn.style.display="none"; refresh(); subscribeToCurrentPlan(); return; }
  // find nearest Sunday record
  let best=-1,bestDiff=1e15; const t=new Date(iso+"T12:00:00Z").getTime();
  CALENDAR.forEach((s,i)=>{ const diff=Math.abs(new Date(s.d+"T12:00:00Z").getTime()-t); if(diff<bestDiff){bestDiff=diff;best=i;} });
  if(best<0 || bestDiff>1000*3600*24*366){ warn.style.display="block"; warn.textContent="That date is outside the computed range (2025–2075)."; }
  else warn.style.display="none";
  curIdx=best; refresh(); subscribeToCurrentPlan();
}

// ---- Word (.docx) generation in-browser ----
@@DOCX_EXPORT_JS@@
const downloadWord=createDocxExporter({
  templates:PARTS,
  templatesWithReadings:PARTS2,
  readings:READINGS,
  musicParts:MUSIC_PARTS,
  values:vals,
  choiceFor,
  attributionLine,
  copyrightComplete,
  escapeXml:esc,
});

// wire up
function nextSundayIdx(){ const today=new Date().toISOString().slice(0,10); let i=CALENDAR.findIndex(s=>s.d>=today); return i<0?CALENDAR.length-1:i; }
prev.addEventListener("click", ()=>{ if(curIdx>0){curIdx--; refresh(); subscribeToCurrentPlan(); } });
next.addEventListener("click", ()=>{ if(curIdx<CALENDAR.length-1){curIdx++; refresh(); subscribeToCurrentPlan(); } });
document.getElementById("today").addEventListener("click", ()=>{ curIdx=nextSundayIdx(); refresh(); subscribeToCurrentPlan(); });
date.addEventListener("change", ()=>{ if(date.value) goToDate(date.value); else syncDateControl(); });
printMusic.addEventListener("click", ()=>downloadWord(false));
printMusicReadings.addEventListener("click", ()=>downloadWord(true));

curIdx=nextSundayIdx(); refresh(); renderMusicPlan();

// Installable app support. iPhone/iPad uses Safari's Share → Add to Home Screen flow.
let deferredInstallPrompt = null;
const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
if(ios && !standalone) installApp.hidden=false;
window.addEventListener("beforeinstallprompt", event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  if(!standalone) installApp.hidden=false;
});
installApp.addEventListener("click", async ()=>{
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    installApp.hidden=true;
  }else if(ios){
    alert("In Safari, tap the Share button, then choose “Add to Home Screen”.");
  }
});
window.addEventListener("appinstalled", ()=>{ installApp.hidden=true; deferredInstallPrompt=null; });
if("serviceWorker" in navigator && location.protocol!=="file:"){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("./service-worker.js"));
}
