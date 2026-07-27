const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("the public repertoire is a first-class mobile page linked from the app", () => {
  const planner = read("src/planner.html");
  const about = read("about.html");
  const repertoire = read("src/repertoire.html");

  assert.match(planner, /href="\.\/repertoire\.html"/);
  assert.match(planner, /class="bar-desktop">Repertoire</);
  assert.match(about, /href="\.\/repertoire\.html"/);
  assert.match(about, /class="bar-desktop">Repertoire</);
  assert.match(repertoire, /id="repertoireSearch"/);
  assert.match(repertoire, /id="repertoireList"/);
  assert.match(repertoire, /id="repertoireCount"/);
  assert.match(repertoire, /id="repertoireScope"/);
  assert.match(repertoire, /data-repertoire-scope="repertoire"/);
  assert.match(repertoire, /data-repertoire-scope="library"/);
  assert.match(repertoire, /id="repertoireEditorActions"/);
  assert.match(repertoire, /id="addRepertoireSong"/);
});

test("public repertoire loading never requests private lyrics", () => {
  const store = read("src/services/repertoire-store.js");
  const supabaseStore = store.slice(
    store.indexOf("function createSupabaseStore"),
    store.indexOf("async function supabaseStore"),
  );
  const publicQuery = supabaseStore.slice(
    supabaseStore.indexOf("async browseSongs"),
    supabaseStore.indexOf("async getSong"),
  );
  const editorQuery = supabaseStore.slice(
    supabaseStore.indexOf("async getSong"),
    supabaseStore.indexOf("async createSong"),
  );

  assert.match(publicQuery, /\.from\("songs"\)/);
  assert.match(publicQuery, /copyright_owner/);
  assert.doesNotMatch(publicQuery, /song_lyrics/);
  assert.match(editorQuery, /song_lyrics/);
});

test("repertoire editors can create and update canonical songs without assigning a Mass", () => {
  const store = read("src/services/repertoire-store.js");
  const app = read("src/app/repertoire.js");
  const html = read("src/repertoire.html");

  assert.match(store, /async createSong\(/);
  assert.match(store, /\.rpc\("create_song"/);
  assert.match(store, /async updateSong\(/);
  assert.match(store, /\.rpc\("update_song"/);
  assert.match(html, /id="songSuggestionParts"/);
  assert.match(html, /id="songInRepertoire"/);
  assert.match(html, /leave blank to exclude it from suggestions/);
  assert.match(app, /const songForm=SongForm\.create/);
  assert.match(app, /songForm\.write\(song\)/);
  assert.match(app, /song\.inRepertoire/);
  assert.match(app, /Extended library/);
  assert.match(html, /Only authorised editors can change song details/);
  assert.match(app, /status\.staleSongIds/);
  assert.match(app, /EmbeddingRepair\.repairStaleSongsOnce/);
});

test("the PWA caches and routes the repertoire independently", () => {
  const worker = read("service-worker.js");
  assert.match(worker, /"\.\/repertoire\.html"/);
  assert.match(worker, /endsWith\("\/repertoire\.html"\)/);
  assert.match(worker, /src\/services\/repertoire-store\.js/);
});

test("public repertoire attribution is compact and includes the copyright mark", () => {
  const app = read("src/app/repertoire.js");
  const styles = read("src/styles/repertoire.css");

  assert.match(app, /const details=SongPresentation\.repertoireDetails/);
  assert.doesNotMatch(app, /const copyrightLine=/);
  assert.match(app, /<h2>\$\{esc\(song\.title\)\}[\s\S]*Listen ↗[\s\S]*<\/h2>/);
  assert.match(styles, /\.song-card h2 a\{/);
});

test("all mobile headers use compact labels instead of overflowing the viewport", () => {
  const planner = read("src/planner.html");
  const repertoire = read("src/repertoire.html");
  const about = read("about.html");
  const plannerStyles = read("src/styles/planner.css");
  const repertoireStyles = read("src/styles/repertoire.css");

  [planner, repertoire, about].forEach(html => {
    assert.match(html, /class="bar-mobile">St James ↗</);
  });
  assert.match(planner, /class="bar-mobile">Songs</);
  assert.match(plannerStyles, /\.parish-bar-actions\{ gap:4px; \}/);
  assert.match(repertoireStyles, /\.bar-mobile\{display:none\}/);
});
