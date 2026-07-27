const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("planner contains a song picker and optional-lyrics editor", () => {
  const html = read("src/planner.html");
  const app = read("src/app/planner.js");
  assert.match(html, /id="songPickerDialog"/);
  assert.match(html, /id="songSearch"/);
  assert.match(html, /id="songModeSuggested"/);
  assert.match(html, /id="songModeSearch"/);
  assert.match(html, /id="songModeCreate"/);
  assert.match(html, /id="songEditorDialog"/);
  assert.match(html, /id="songLyrics"/);
  assert.match(html, /id="songSuggestionParts"/);
  assert.match(html, /Manual selection remains unrestricted/);
  assert.match(html, /Add lyrics now \(optional\)/);
  assert.match(app, /suggestionPartFor\(editingSongPart\)/);
});

test("suggest, search, and create are explicit picker modes", () => {
  const html = read("src/planner.html");
  const app = read("src/app/planner.js");

  assert.match(html, /id="songSuggestedPanel"/);
  assert.match(html, /id="songSearchPanel"[^>]*hidden/);
  assert.match(app, /function setSongPickerMode\(mode\)/);
  assert.match(app, /songSuggestedPanel\.hidden=mode!=="suggested"/);
  assert.match(app, /songSearchPanel\.hidden=mode!=="search"/);
  assert.match(app, /if\(mode==="create"\)\{ openSongEditor\(null\); return; \}/);
});

test("the mobile song picker is a sheet over the plan, not a full-screen page", () => {
  const css = read("src/styles/planner.css");
  assert.match(
    css,
    /\.song-picker-dialog\{[^}]*height:min\(90dvh,760px\)[^}]*margin:auto 8px 8px/,
  );
  assert.match(css, /\.song-picker-dialog \.reading-dialog-form\{ height:100%;/);
  assert.match(css, /\.song-picker-dialog \.reading-dialog-body\{ flex:1; min-height:0;/);
});

test("the song picker removes the rubric and uses one compact footer action", () => {
  const html = read("src/planner.html");
  const css = read("src/styles/planner.css");

  assert.doesNotMatch(html, /id="songPickerContext"/);
  assert.doesNotMatch(html, /Any song can be used in any part/);
  assert.doesNotMatch(html, /id="songPickerCancel"/);
  assert.match(html, /class="song-picker-actions"/);
  assert.match(html, /id="useSong" disabled>Use song</);
  assert.match(css, /\.song-picker-actions\{ display:flex; justify-content:flex-end;/);
});

test("empty editor slots use one Choose song control without a second empty-state line", () => {
  const renderer = read("src/app/music-plan-view.js");
  assert.equal(
    (renderer.match(/Not yet chosen/g) || []).length,
    1,
    "Not yet chosen should appear only in the public read-only view",
  );
  assert.match(renderer, /music-editor-actions empty/);
});

test("selected rows show only Change and move secondary actions into the picker", () => {
  const app = read("src/app/planner.js");
  const html = read("src/planner.html");
  const musicRenderer = read("src/app/music-plan-view.js");
  const pickerRenderer = read("src/app/song-picker-view.js");

  assert.match(musicRenderer, />Change<\/button>/);
  assert.doesNotMatch(musicRenderer, /data-song-action="edit"/);
  assert.doesNotMatch(musicRenderer, /data-song-action="remove"/);
  assert.match(html, /id="songCurrentActions"/);
  assert.match(html, /id="songCurrentAuthor"/);
  assert.match(html, /id="editCurrentSong"/);
  assert.match(html, /id="removeCurrentSong"/);
  assert.match(html, />Edit song details<\/button>/);
  assert.match(html, />Remove from this Mass<\/button>/);
  assert.match(pickerRenderer, /author: song\?\.authors \|\| "Author not recorded"/);
  assert.match(app, /editorAttribution:SongPresentation\.editorPlanAttribution/);
  assert.match(html, />Changes are live\.<\/div>/);
});

test("legacy free-text music editing and autosave are removed", () => {
  const app = read("src/app/planner.js");
  const store = read("src/services/plan-store.js");
  assert.doesNotMatch(app, /data-field="song"/);
  assert.doesNotMatch(app, /saveTimers/);
  assert.doesNotMatch(store, /savePart/);
  assert.doesNotMatch(store, /save_music_choice/);
  assert.doesNotMatch(store, /\bchoices\b/);
});

test("mobile dialogs lock and restore the page scroll position", () => {
  const app = read("src/app/planner.js");
  const controller = read("src/app/modal-controller.js");
  const styles = read("src/styles/planner.css");

  assert.match(app, /const openModal=modalController\.open/);
  assert.doesNotMatch(app, /modalPageScrollY/);
  assert.match(controller, /pageScrollY = window\.scrollY/);
  assert.match(controller, /window\.scrollTo\(0, scrollY\)/);
  assert.match(styles, /html\.modal-open body\{ position:fixed;/);
  assert.match(styles, /\.reading-dialog\{[^}]*overscroll-behavior:none;/);
});
