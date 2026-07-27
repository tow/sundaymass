@@MUSIC_PARTS_JS@@
@@PWA_CONTROLLER_JS@@
@@AUTH_CONTROLLER_JS@@
@@SONG_PRESENTATION_JS@@
@@SONG_CATALOG_JS@@
@@EMBEDDING_REPAIR_JS@@
let store;
let songs=[];
let isEditor=false;
let signedIn=false;
let editingSong=null;
let repairingIndex=false;

const esc=value=>(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const safeYoutube=SongPresentation.safeYoutubeUrl;
const details=SongPresentation.repertoireDetails;

function render(){
  const query=repertoireSearch.value.trim().toLocaleLowerCase();
  const visible=songs.filter(song=>!query || `${song.title} ${song.authors}`.toLocaleLowerCase().includes(query));
  repertoireCount.textContent=`${visible.length} ${visible.length===1?"song":"songs"}`;
  repertoireList.innerHTML=visible.map(song=>{
    const link=safeYoutube(song.youtubeUrl);
    return `<article class="song-card"><div class="song-card-copy"><h2>${esc(song.title)}</h2>`
      +details(song).map(line=>`<p>${esc(line)}</p>`).join("")
      +(link?`<a href="${esc(link)}" target="_blank" rel="noopener">Listen / practise ↗</a>`:"")
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
    console.error(error);
    repertoireStatus.textContent="Could not load repertoire";
  }
}

function draft(){
  return {
    title:songTitle.value, youtubeUrl:songYoutube.value, authors:songAuthors.value,
    copyrightOwner:songCopyrightOwner.value, copyrightYear:songCopyrightYear.value,
    source:songSource.value, lyrics:songLyrics.value,
    suggestionParts:[...songSuggestionParts.querySelectorAll('input[type="checkbox"]:checked')]
      .map(input=>input.value),
  };
}
function openEditor(song){
  editingSong=song||null;
  editorTitle.textContent=song?"Edit song details":"Add a song";
  songTitle.value=song?.title||"";
  songYoutube.value=song?.youtubeUrl||"";
  songAuthors.value=song?.authors||"";
  songCopyrightOwner.value=song?.copyrightOwner||"";
  songCopyrightYear.value=song?.copyrightYear||"";
  songSource.value=song?.source||"";
  songLyrics.value=song?.lyrics||"";
  const selected=new Set(song?.suggestionParts||[]);
  songSuggestionParts.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.checked=selected.has(input.value);
  });
  songEditorError.textContent="";
  songEditorDialog.showModal();
}
async function loadForEditing(id){
  repertoireStatus.textContent="Loading song…";
  try{ openEditor(await store.getSong(id)); repertoireStatus.textContent="Up to date"; }
  catch(error){ console.error(error); repertoireStatus.textContent="Could not load song"; }
}
async function refreshIndex(){
  indexButton.disabled=true;
  try{
    const readingResponse=await fetch("./data/generated/readings_text.json");
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
    console.error(error);
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
  }catch{ indexStatus.textContent="Suggestion index not available yet."; }
}

window.repertoireApp={
  connect(value){
    store=value;
    store.subscribeAuth(auth=>{
      signedIn=Boolean(auth.user); isEditor=Boolean(auth.isEditor);
      render(); if(isEditor)loadIndexStatus();
    });
    loadSongs();
  },
  fail(error){ console.error(error); repertoireStatus.textContent="Could not connect"; },
};

repertoireSearch.addEventListener("input",render);
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
    await store.syncSongs([saved.id]).catch(()=>{});
    songEditorDialog.close();
    await loadSongs();
  }catch(error){songEditorError.textContent=error.message||"Could not save song.";}
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
}).start();
indexButton.addEventListener("click",refreshIndex);

PwaController.registerServiceWorker({window,navigator,location});
