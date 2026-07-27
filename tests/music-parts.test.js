const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.resolve(__dirname, "../src/domain/music-parts.js");
const plannerSource = () => fs.readFileSync(
  path.resolve(__dirname, "../src/app/planner.js"),
  "utf8",
);

test("Mass music parts have one canonical ordered definition", () => {
  const musicParts = require(modulePath);

  assert.deepEqual(musicParts.parts.map(part => part.key), [
    "entrance", "kyrie", "gloria", "psalm", "acclamation", "offertory",
    "sanctus", "memorial", "amen", "lordPrayer", "agnus", "communion",
    "communion2", "recessional",
  ]);
  assert.equal(new Set(musicParts.parts.map(part => part.key)).size, musicParts.parts.length);
  assert.equal(new Set(musicParts.parts.map(part => part.token)).size, musicParts.parts.length);
  assert.equal(musicParts.byKey("communion2").token, "COMMUNION_2");
});

test("both Communion slots use the same semantic suggestion class", () => {
  const musicParts = require(modulePath);

  assert.equal(musicParts.suggestionPartFor("communion"), "communion");
  assert.equal(musicParts.suggestionPartFor("communion2"), "communion");
  assert.equal(musicParts.suggestionPartFor("not-a-part"), "");
});

test("the planner consumes the canonical module instead of declaring parts inline", () => {
  const source = plannerSource();

  assert.match(source, /@@MUSIC_PARTS_JS@@/);
  assert.match(source, /const MUSIC_PARTS=MassMusicParts\.parts/);
  assert.match(source, /MassMusicParts\.suggestionPartFor/);
  assert.doesNotMatch(source, /const MUSIC_PARTS = \[/);
});
