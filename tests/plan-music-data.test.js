const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/domain/plan-music-data.js");

const data = global.PlanMusicData;

test("Supabase song rows become canonical browser song values", () => {
  assert.deepEqual(data.songFromRow({
    id: "song-1",
    title: "Same Title",
    youtube_url: "https://youtu.be/example",
    authors: "Composer",
    copyright_owner: "Publisher",
    copyright_year: "1975, 2016",
    source: "Hymnal 12",
    song_lyrics: { lyrics: "[Verse 1]\nWords" },
  }), {
    id: "song-1",
    title: "Same Title",
    youtubeUrl: "https://youtu.be/example",
    authors: "Composer",
    copyrightOwner: "Publisher",
    copyrightYear: "1975, 2016",
    source: "Hymnal 12",
    lyrics: "[Verse 1]\nWords",
    hasLyrics: true,
  });
});

test("public plan rows omit lyrics while retaining current canonical metadata", () => {
  const plan = data.planFromRow({
    reading_overrides: {},
    celebration_override: null,
    plan_songs: [{
      part: "entrance",
      song: {
        id: "song-1",
        title: "Entrance Song",
        youtube_url: "",
        authors: "",
        copyright_owner: "",
        copyright_year: "",
        source: "",
      },
    }],
  });
  assert.equal(plan.songs.entrance.id, "song-1");
  assert.equal(plan.songs.entrance.title, "Entrance Song");
  assert.equal(plan.songs.entrance.lyrics, "");
  assert.equal(plan.songs.entrance.hasLyrics, false);
  assert.deepEqual(plan.readingOverrides, {});
  assert.equal(plan.celebrationOverride, null);
});

test("duplicate titles in different assignments remain distinct songs", () => {
  const plan = data.planFromRow({
    plan_songs: [
      { part: "entrance", song: { id: "a", title: "Gloria" } },
      { part: "gloria", song: { id: "b", title: "Gloria" } },
    ],
  });
  assert.equal(plan.songs.entrance.id, "a");
  assert.equal(plan.songs.gloria.id, "b");
});
