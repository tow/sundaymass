@@APP_LOGGER_JS@@
@@ASSET_URL_JS@@
@@REPERTOIRE_URL_STATE_JS@@
@@MUSIC_PARTS_JS@@
@@PWA_CONTROLLER_JS@@
@@AUTH_CONTROLLER_JS@@
@@SONG_FORM_JS@@
@@SONG_PRESENTATION_JS@@
@@SONG_CATALOG_JS@@
@@EMBEDDING_REPAIR_JS@@
window.MASS_PLANNER_ASSET_VERSIONS=Object.freeze(@@ASSET_VERSIONS@@);
window.MASS_PLANNER_BUILD="@@BUILD_VERSION@@";
const appLogger=AppLogger;
let store;
let songs=[];
let isEditor=false;
let signedIn=false;
let editingSong=null;
let repairingIndex=false;
const initialUrlState=RepertoireUrlState.read(location);
let repertoireScopeValue=initialUrlState.scope;

const esc=value=>(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const safeYoutube=SongPresentation.safeYoutubeUrl;
const details=SongPresentation.repertoireDetails;
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

function render(){
  const query=repertoireSearch.value.trim().toLocaleLowerCase();
  const scoped=songs.filter(song=>repertoireScopeValue==="library"
    ? song.inRepertoire===false
    : song.inRepertoire!==false);
  const visible=scoped.filter(song=>!query || `${song.title} ${song.authors}`.toLocaleLowerCase().includes(query));
  repertoireCount.textContent=`${visible.length} ${repertoireScopeValue==="library"?"extended library":"repertoire"} ${visible.length===1?"song":"songs"}`;
  repertoireScope.querySelectorAll("[data-repertoire-scope]").forEach(button=>{
    const selected=button.dataset.repertoireScope===repertoireScopeValue;
    button.classList.toggle("selected",selected);
    button.setAttribute("aria-pressed",String(selected));
  });
  repertoireList.innerHTML=visible.map(song=>{
    const link=safeYoutube(song.youtubeUrl);
    const badge=song.inRepertoire===false?`<span class="song-library-badge">Extended library</span>`:"";
    return `<article class="song-card"><div class="song-card-copy">${badge}<h2>${esc(song.title)}`
      +(link?` <a href="${esc(link)}" target="_blank" rel="noopener">Listen ↗</a>`:"")
      +`</h2>`
      +details(song).map(line=>`<p>${esc(line)}</p>`).join("")
      +`</div>${isEditor?`<button type="button" data-edit-song="${song.id}">Edit details</button>`:""}</article>`;
  }).join("") || `<p class="empty-state">No songs match that search.</p>`;
  repertoireEditorActions.hidden=!isEditor;
  semanticPanel.hidden=!isEditor;
  authButton.textContent=signedIn?"Sign out":"Sign in";
}

async function loadSongs(){
  repertoireStatus.textContent="Loading…";
  try{
    songs=await store.browseSongs();
    repertoireStatus.textContent="Up to date";
    render();
  }catch(error){
    appLogger.error(error);
    repertoireStatus.textContent="Could not load repertoire";
  }
}

function draft(){
  return songForm.read();
}
function openEditor(song){
  editingSong=song||null;
  editorTitle.textContent=song?"Edit song details":"Add a song";
  songForm.write(song);
  songEditorError.textContent="";
  songEditorDialog.showModal();
}
async function loadForEditing(id){
  repertoireStatus.textContent="Loading song…";
  try{ openEditor(await store.getSong(id)); repertoireStatus.textContent="Up to date"; }
  catch(error){ appLogger.error(error); repertoireStatus.textContent="Could not load song"; }
}
async function refreshIndex(){
  indexButton.disabled=true;
  try{
    const readingResponse=await fetch(AppAssets.url("data/generated/readings_text.json"));
    const readingMap=await readingResponse.json();
    const songIds=songs.map(song=>song.id);
    const readings=Object.entries(readingMap).map(([citation,text])=>({citation,text}));
    const readingBatches=[];
    let pending=[],weight=0;
    readings.forEach(reading=>{
      const readingWeight=Math.min(4,Math.max(1,Math.ceil(reading.text.length/1600)));
      if(pending.length&&(pending.length>=10||weight+readingWeight>6)){
        readingBatches.push(pending);pending=[];weight=0;
      }
      pending.push(reading);weight+=readingWeight;
    });
    if(pending.length)readingBatches.push(pending);
    const total=Math.ceil(songIds.length/5)+readingBatches.length;
    let done=0;
    for(let index=0;index<songIds.length;index+=5){
      indexStatus.textContent=`Indexing songs… ${++done}/${total}`;
      await store.syncSongs(songIds.slice(index,index+5));
    }
    for(const batch of readingBatches){
      indexStatus.textContent=`Indexing readings… ${++done}/${total}`;
      await store.syncReadings(batch);
    }
    await loadIndexStatus();
  }catch(error){
    appLogger.error(error);
    indexStatus.textContent="Indexing failed. You can safely try again.";
  }finally{ indexButton.disabled=false; }
}
async function loadIndexStatus(){
  if(!isEditor)return;
  try{
    let status=await store.semanticStatus();
    const staleIds=status.staleSongIds||[];
    indexStatus.textContent=staleIds.length
      ? `${status.embeddedSongs}/${status.songs} songs · updating ${staleIds.length} changed ${staleIds.length===1?"song":"songs"}…`
      : `${status.embeddedSongs}/${status.songs} songs · ${status.embeddedReadings} readings indexed · up to date`;
    if(staleIds.length&&!repairingIndex){
      repairingIndex=true;
      try{
        status=await EmbeddingRepair.repairStaleSongsOnce(
          status,
          ids=>store.syncSongs(ids),
          ()=>store.semanticStatus(),
        );
      }finally{repairingIndex=false;}
      const remaining=status.staleSongIds||[];
      indexStatus.textContent=remaining.length
        ? `${status.embeddedSongs}/${status.songs} songs · ${remaining.length} still need updating; try Update suggestion index`
        : `${status.embeddedSongs}/${status.songs} songs · ${status.embeddedReadings} readings indexed · up to date`;
    }
  }catch(error){
    appLogger.warn("Suggestion index not available yet",error);
    indexStatus.textContent="Suggestion index not available yet.";
  }
}

repertoireSearch.value=initialUrlState.query;

window.repertoireApp={
  connect(value){
    store=value;
    store.subscribeAuth(auth=>{
      signedIn=Boolean(auth.user); isEditor=Boolean(auth.isEditor);
      render(); if(isEditor)loadIndexStatus();
    });
    loadSongs();
  },
  fail(error){ appLogger.error(error); repertoireStatus.textContent="Could not connect"; },
};

repertoireSearch.addEventListener("input",()=>{
  RepertoireUrlState.write(window,{
    scope:repertoireScopeValue,
    query:repertoireSearch.value,
  },{replace:true});
  render();
});
repertoireScope.addEventListener("click",event=>{
  const button=event.target.closest("[data-repertoire-scope]");
  if(!button)return;
  repertoireScopeValue=button.dataset.repertoireScope;
  RepertoireUrlState.write(window,{
    scope:repertoireScopeValue,
    query:repertoireSearch.value,
  });
  render();
});
window.addEventListener("popstate",()=>{
  const state=RepertoireUrlState.read(location);
  repertoireScopeValue=state.scope;
  repertoireSearch.value=state.query;
  render();
});
repertoireList.addEventListener("click",event=>{
  const button=event.target.closest("[data-edit-song]");
  if(button&&isEditor)loadForEditing(button.dataset.editSong);
});
addRepertoireSong.addEventListener("click",()=>openEditor(null));
songEditorClose.addEventListener("click",()=>songEditorDialog.close());
songEditorCancel.addEventListener("click",()=>songEditorDialog.close());
songEditorDialog.addEventListener("click",event=>{if(event.target===songEditorDialog)songEditorDialog.close();});
songEditorForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const validation=SongCatalog.validateDraft(draft());
  if(!validation.valid){songEditorError.textContent=validation.error;return;}
  saveSong.disabled=true;
  try{
    const saved=editingSong
      ? await store.updateSong(editingSong.id,validation.value)
      : await store.createSong(validation.value);
    await store.syncSongs([saved.id])
      .catch(error=>appLogger.warn("Song indexing failed",error));
    songEditorDialog.close();
    await loadSongs();
  }catch(error){
    appLogger.error(error);
    songEditorError.textContent=error.message||"Could not save song.";
  }
  finally{saveSong.disabled=false;}
});
AuthController.create({
  button:authButton,
  dialog:loginDialog,
  form:loginForm,
  cancelButton:loginCancel,
  emailInput:loginEmail,
  passwordInput:loginPassword,
  submitButton:loginSubmit,
  errorElement:loginError,
  getStore:()=>store,
  isSignedIn:()=>signedIn,
  openDialog:dialog=>dialog.showModal(),
  scheduleFocus:callback=>setTimeout(callback,0),
  onUnavailable:()=>{repertoireStatus.textContent="Editor sign-in unavailable";},
  onActionFailure:()=>{repertoireStatus.textContent="Sign-in failed";},
  logger:appLogger,
}).start();
indexButton.addEventListener("click",refreshIndex);

PwaController.registerServiceWorker({window,navigator,location});
