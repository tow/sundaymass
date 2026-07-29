const test = require("node:test");
const assert = require("node:assert/strict");

const WeeklyLyrics = require("../src/domain/weekly-lyrics.js");

const PSALM = [
  "Response:",
  "Lord, let your mercy be on us.",
  "",
  "1. Ring out your joy to the Lord, O you just;",
  "for praise is fitting for loyal hearts.",
  "",
  "2. They are happy, whose God is the Lord.",
  "",
  "3. May your love be upon us, O Lord.",
].join("\n");

test("structured Psalms distinguish the congregation from cantor verses", () => {
  assert.equal(WeeklyLyrics.isStructuredPsalm(PSALM), true);
  assert.deepEqual(WeeklyLyrics.psalmSections(PSALM)
    .map(section => [section.id, section.role]), [
    ["response", "all"],
    ["verse-1", "cantor"],
    ["verse-2", "cantor"],
    ["verse-3", "cantor"],
  ]);
});

test("numbered verses are recognized without blank lines between sections", () => {
  const compact = [
    "Response:",
    "Lord, let your mercy be on us.",
    "1. Ring out your joy to the Lord.",
    "2. They are happy, whose God is the Lord.",
  ].join("\n");

  assert.equal(WeeklyLyrics.isStructuredPsalm(compact), true);
  assert.deepEqual(WeeklyLyrics.lyricBlocks("psalm", compact)
    .map(block => [block.id, block.audienceLabel]), [
    ["response", "ALL: RESPONSE"],
    ["verse-1", "CANTOR: VERSE 1"],
    ["verse-2", "CANTOR: VERSE 2"],
  ]);
});

test("unlabelled Psalm paragraphs normalize to a response and cantor verse", () => {
  const unstructured = "Response text without a heading.\n\nCantor text without a verse number.";

  assert.equal(WeeklyLyrics.isStructuredPsalm(unstructured), true);
  assert.deepEqual(WeeklyLyrics.lyricBlocks("psalm", unstructured)
    .map(block => [block.id, block.audienceLabel, block.text]), [
    ["response", "ALL: RESPONSE", "Response text without a heading."],
    ["verse-1", "CANTOR: VERSE 1", "Cantor text without a verse number."],
  ]);
});

test("continuous Psalm lines normalize into response and cantor blocks", () => {
  const lyrics = "A response line\nA first verse line\nA second verse line";
  assert.deepEqual(WeeklyLyrics.lyricBlocks("psalm", lyrics)
    .map(block => [block.role, block.text]), [
    ["all", "A response line"],
    ["cantor", "A first verse line\nA second verse line"],
  ]);
});

test("repeated recorded responses collapse to one congregational block", () => {
  const lyrics = "R. Sing to the Lord.\n\nCantor: A new song.\n\n"
    + "R. Sing to the Lord.\n\n2. Let all creation rejoice.";
  assert.deepEqual(WeeklyLyrics.lyricBlocks("psalm", lyrics)
    .map(block => [block.role, block.text]), [
    ["all", "Sing to the Lord."],
    ["cantor", "A new song."],
    ["cantor", "Let all creation rejoice."],
  ]);
});

test("omitted Psalm verses remain visible in canonical sections but not serialized output", () => {
  const sections = WeeklyLyrics.psalmSections(PSALM)
    .map(section => ({ ...section, included: section.id !== "verse-2" }));
  const edited = WeeklyLyrics.serializePsalmSections(sections);

  assert.match(edited, /Lord, let your mercy/);
  assert.match(edited, /Ring out your joy/);
  assert.doesNotMatch(edited, /They are happy/);
  assert.match(edited, /May your love/);
  assert.deepEqual(WeeklyLyrics.lyricBlocks("psalm", edited)
    .map(block => block.audienceLabel), [
    "ALL: RESPONSE",
    "CANTOR: VERSE 1",
    "CANTOR: VERSE 3",
  ]);
});

test("responsorial citations parse Psalms and canticles by structured number", () => {
  assert.deepEqual(WeeklyLyrics.parseResponsorialCitation("Psalm 85:9, 10, 11-12"), {
    book: "Psalm",
    number: 85,
    citation: "Psalm 85:9, 10, 11-12",
  });
  assert.deepEqual(WeeklyLyrics.parseResponsorialCitation("Isaiah 12:2-3, 4, 5-6"), {
    book: "Isaiah",
    number: 12,
    citation: "Isaiah 12:2-3, 4, 5-6",
  });
});
