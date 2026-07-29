const test = require("node:test");
const assert = require("node:assert/strict");

const MusicPlanView = require("../src/app/music-plan-view.js");
const SongPresentation = require("../src/domain/song-presentation.js");

const escapeHtml = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const view = MusicPlanView.create({
  escapeHtml,
  safeYoutubeUrl: SongPresentation.safeYoutubeUrl,
  copyrightComplete: SongPresentation.copyrightComplete,
  publicAttribution: SongPresentation.planAuthor,
  editorAttribution: SongPresentation.planAuthor,
});

const parts = [
  { key: "entrance", label: "Entrance <Hymn>", note: "(optional)" },
  { key: "communion", label: "Communion Hymn 1", note: "" },
];

const songs = {
  entrance: {
    id: "song-1",
    title: "All <Are> Welcome",
    youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
    authors: "Marty Haugen",
    copyrightOwner: "GIA",
    copyrightYear: "1994",
    source: "",
    lyrics: "Public rendering must never expose this",
  },
};

test("choiceFor projects a selected song down to public plan metadata", () => {
  assert.deepEqual(view.choiceFor(songs, "entrance"), {
    song: "All <Are> Welcome",
    youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
    authors: "Marty Haugen",
    copyrightOwner: "GIA",
    copyrightYear: "1994",
    source: "",
  });
  assert.equal("lyrics" in view.choiceFor(songs, "entrance"), false);
});

test("public rendering includes safe metadata but never private lyrics", () => {
  const result = view.render({ parts, songs, isEditor: false });

  assert.equal(result.mode, "view");
  assert.equal(result.editorHelpHidden, true);
  assert.match(result.intro, /Selections for this Sunday/);
  assert.match(result.html, /All &lt;Are&gt; Welcome/);
  assert.match(result.html, /Marty Haugen/);
  assert.doesNotMatch(result.html, /Authors:/);
  assert.doesNotMatch(result.html, /© 1994 GIA/);
  assert.match(result.html, /href="https:\/\/www\.youtube\.com\/watch\?v=AAAAAAAAAAA"/);
  assert.match(
    result.html,
    /<span class="music-song-title">All &lt;Are&gt; Welcome <a class="listen-link"[^>]*>Listen ↗<\/a><\/span>/,
  );
  assert.match(
    result.html,
    /data-song-action="suggestions" data-part="communion">See suggestions<\/button>/,
  );
  assert.equal((result.html.match(/See suggestions/g) || []).length, 1);
  assert.doesNotMatch(result.html, /Public rendering must never expose this/);
  assert.doesNotMatch(result.html, /\blyrics\b/i);
});

test("editor rendering offers weekly lyrics only for selected slots", () => {
  const result = view.render({ parts, songs, isEditor: true });

  assert.equal(result.mode, "edit");
  assert.equal(result.editorHelpHidden, false);
  assert.match(result.intro, /Choose or add a song/);
  assert.match(result.html, /data-song-action="choose" data-part="entrance">Change<\/button>/);
  assert.match(result.html, /data-song-action="choose" data-part="communion">Choose song<\/button>/);
  assert.match(result.html, /data-song-action="lyrics" data-part="entrance">Lyrics for this Sunday/);
  assert.equal((result.html.match(/data-song-action=/g) || []).length, 3);
  assert.doesNotMatch(result.html, /data-song-action="edit"/);
  assert.doesNotMatch(result.html, /data-song-action="remove"/);
  assert.doesNotMatch(result.html, /Not yet chosen/);
});

test("rendering escapes labels and warns only for incomplete selected songs", () => {
  const result = view.render({
    parts,
    songs: {
      entrance: {
        title: "Incomplete",
        authors: "",
        copyrightOwner: "",
        copyrightYear: "",
      },
    },
    isEditor: false,
  });

  assert.match(result.html, /Entrance &lt;Hymn&gt;/);
  assert.match(result.html, /<span class="music-part-note">\(optional\)<\/span>/);
  assert.equal(
    (result.html.match(/Copyright information incomplete/g) || []).length,
    1,
  );
});
