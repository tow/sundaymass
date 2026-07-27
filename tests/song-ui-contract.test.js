const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("planner contains a song picker and optional-lyrics editor", () => {
  const html = read("src/planner.html");
  assert.match(html, /id="songPickerDialog"/);
  assert.match(html, /id="songSearch"/);
  assert.match(html, /id="createSongAction"/);
  assert.match(html, /id="songEditorDialog"/);
  assert.match(html, /id="songLyrics"/);
  assert.match(html, /Add lyrics now \(optional\)/);
});

test("new-song action is rendered separately from matching results", () => {
  const html = read("src/planner.html");
  const action = html.indexOf('id="createSongAction"');
  const results = html.indexOf('id="songResults"');
  assert.ok(action >= 0 && results >= 0);
  assert.ok(action < results, "creation must remain visible before the potentially long result list");
});

test("the mobile song picker is a sheet over the plan, not a full-screen page", () => {
  const css = read("src/styles/planner.css");
  assert.match(
    css,
    /\.song-picker-dialog\{[^}]*height:min\(78dvh,650px\)[^}]*margin:auto 8px 8px/,
  );
  assert.match(css, /\.song-picker-dialog \.reading-dialog-form\{ height:100%;/);
});

test("empty editor slots use one Choose song control without a second empty-state line", () => {
  const app = read("src/app/planner.js");
  assert.equal(
    (app.match(/Not yet chosen/g) || []).length,
    1,
    "Not yet chosen should appear only in the public read-only view",
  );
  assert.match(app, /music-editor-actions empty/);
});

test("selected rows show only Change and move secondary actions into the picker", () => {
  const app = read("src/app/planner.js");
  const html = read("src/planner.html");
  const musicRenderer = app.slice(
    app.indexOf("function renderMusicPlan"),
    app.indexOf("function readingSlot"),
  );

  assert.match(musicRenderer, />Change<\/button>/);
  assert.doesNotMatch(musicRenderer, /data-song-action="edit"/);
  assert.doesNotMatch(musicRenderer, /data-song-action="remove"/);
  assert.match(html, /id="songCurrentActions"/);
  assert.match(html, /id="songCurrentAuthor"/);
  assert.match(html, /id="editCurrentSong"/);
  assert.match(html, /id="removeCurrentSong"/);
  assert.match(html, />Edit song details<\/button>/);
  assert.match(html, />Remove from this Mass<\/button>/);
  assert.match(app, /songCurrentAuthor\.textContent=currentSong\?\.authors \|\| "Author not recorded"/);
  assert.match(app, /function editorAttributionLine/);
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
