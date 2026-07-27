const test = require("node:test");
const assert = require("node:assert/strict");

const SongPickerView = require("../src/app/song-picker-view.js");
const SongPresentation = require("../src/domain/song-presentation.js");

const escapeHtml = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const view = SongPickerView.create({
  escapeHtml,
  safeYoutubeUrl: SongPresentation.safeYoutubeUrl,
});

const songs = [
  {
    id: "aaaaaaaa-1111-2222-3333-444444444444",
    title: "Amen <Mass>",
    authors: "First Author",
    copyrightYear: "2020",
    copyrightOwner: "Publisher",
    source: "",
    hasLyrics: true,
    inRepertoire: true,
    lyrics: "Private first lyrics",
  },
  {
    id: "bbbbbbbb-1111-2222-3333-444444444444",
    title: "Amen <Mass>",
    authors: "",
    copyrightYear: "",
    copyrightOwner: "",
    source: "",
    hasLyrics: false,
    inRepertoire: false,
    lyrics: "Private second lyrics",
  },
];

test("search results preserve selection and disambiguate duplicate titles", () => {
  const result = view.renderSearchResults({
    songs,
    selectedSong: songs[1],
  });

  assert.equal(result.hasResults, true);
  assert.equal(result.useDisabled, false);
  assert.equal((result.html.match(/class="song-result/g) || []).length, 2);
  assert.match(result.html, /Amen &lt;Mass&gt;/);
  assert.match(result.html, /First Author · 2020 · Publisher · Lyrics recorded · Separate record aaaaaaaa/);
  assert.match(result.html, /Extended library · Separate record bbbbbbbb/);
  assert.match(result.html, /data-song-index="1" aria-pressed="true"/);
  assert.doesNotMatch(result.html, /Private first lyrics|Private second lyrics/);
});

test("empty search results disable the use action", () => {
  assert.deepEqual(
    view.renderSearchResults({ songs: [], selectedSong: null }),
    {
      html: "",
      hasResults: false,
      useDisabled: true,
    },
  );
});

test("suggestions show compact author details without private lyrics", () => {
  const result = view.renderSuggestions({
    songs,
    selectedSong: songs[0],
  });

  assert.equal(result.hasSuggestions, true);
  assert.match(result.html, /data-song-suggestion-index="0"/);
  assert.match(result.html, /class="song-suggestion selected"/);
  assert.match(result.html, /First Author/);
  assert.match(result.html, /Author not recorded/);
  assert.match(result.html, /Extended library/);
  assert.doesNotMatch(result.html, /Private first lyrics|Private second lyrics|Lyrics recorded/);
});

test("read-only suggestions cannot be selected or assigned", () => {
  const result = view.renderSuggestions({
    songs: [{
      id: "public",
      title: "Public suggestion",
      authors: "Composer",
      youtubeUrl: "https://youtu.be/AAAAAAAAAAA",
      lyrics: "private lyrics",
    }],
    selectedSong: null,
    interactive: false,
  });

  assert.match(result.html, /<article class="song-suggestion song-suggestion-readonly">/);
  assert.match(result.html, /Public suggestion/);
  assert.match(result.html, /Composer/);
  assert.match(
    result.html,
    /href="https:\/\/youtu\.be\/AAAAAAAAAAA"[^>]*>Listen ↗<\/a>/,
  );
  assert.doesNotMatch(result.html, /<button|data-song-suggestion-index|private lyrics/);
});

test("read-only suggestions omit unsafe listening links", () => {
  const result = view.renderSuggestions({
    songs: [{
      id: "unsafe",
      title: "Unsafe link",
      youtubeUrl: "https://example.com/not-youtube",
    }],
    selectedSong: null,
    interactive: false,
  });

  assert.doesNotMatch(result.html, /<a\s|example\.com|Listen/);
});

test("current selection context includes an author fallback", () => {
  assert.deepEqual(view.currentSelection(songs[0]), {
    hidden: false,
    name: "Amen <Mass>",
    author: "First Author",
  });
  assert.deepEqual(view.currentSelection(null), {
    hidden: true,
    name: "",
    author: "Author not recorded",
  });
});
