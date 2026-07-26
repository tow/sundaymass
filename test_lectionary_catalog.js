const test = require("node:test");
const assert = require("node:assert/strict");

require("./lectionary-catalog.js");

const sundays = require("./sundays.json");
const celebrations = require("./celebrations.json");
const commons = require("./commons.json");
const readings = require("./readings_text.json");
const catalog = global.LectionaryCatalog.create({ sundays, celebrations, commons, readings });
const ordinarySunday = sundays.find(sunday => sunday.d === "2026-07-26");

test("citation alternatives distinguish an implied chapter from a numbered book", () => {
  assert.deepEqual(
    catalog.citationAlternatives("Luke 2:22-40 or 2:22-32"),
    ["Luke 2:22-40", "Luke 2:22-32"],
  );
  assert.deepEqual(
    catalog.citationAlternatives("Song of Songs 3:1-4b or 2 Corinthians 5:14-17"),
    ["Song of Songs 3:1-4b", "2 Corinthians 5:14-17"],
  );
});

test("structured citation parser accepts multi-letter verse fragments", () => {
  const parsed = catalog.parseReadingCitation("Psalm 126:1bc-2ab, 2cd-3, 4-5, 6");
  assert.equal(parsed.book, "Psalm");
  assert.deepEqual(parsed.segments[0], {
    startChapter: 126,
    startVerse: "1bc",
    endChapter: 126,
    endVerse: "2ab",
  });
});

test("St James is a complete selectable Proper celebration", () => {
  const james = catalog.availableCelebrations(ordinarySunday)
    .find(celebration => celebration.id === "sanctoral-605");
  assert.ok(james);
  assert.deepEqual(james.readings, {
    first: "2 Corinthians 4:7-15",
    psalm: "Psalm 126:1bc-2ab, 2cd-3, 4-5, 6",
    second: "",
    gospel: "Matthew 20:20-28",
  });
});

test("every explicit Proper 'or' option remains independently selectable", () => {
  const conversion = catalog.availableCelebrations(ordinarySunday)
    .find(celebration => celebration.id === "sanctoral-519");
  assert.deepEqual(conversion.readingOptions.first, ["Acts 22:3-16", "Acts 9:1-22"]);
});

test("Commons options are role-aware and Easter-aware", () => {
  const outsideEaster = catalog.availableCelebrations(ordinarySunday)
    .find(celebration => celebration.id === "sanctoral-517a");
  const inEaster = catalog.availableCelebrations({ ...ordinarySunday, s: "Easter" })
    .find(celebration => celebration.id === "sanctoral-517a");
  assert.ok(outsideEaster.commonNames.includes("Common of Virgins"));
  assert.ok(outsideEaster.readingOptions.psalm.every(citation => catalog.roleCitations.psalm.has(catalog.normalizedCitation(citation))));
  assert.ok(outsideEaster.readingOptions.gospel.every(citation => catalog.roleCitations.gospel.has(catalog.normalizedCitation(citation))));
  assert.notDeepEqual(outsideEaster.readingOptions.first, inEaster.readingOptions.first);
  assert.equal(outsideEaster.readings.second, "");
});

test("the picker never offers a celebration without a usable first reading, psalm, and Gospel", () => {
  const candidates = catalog.availableCelebrations(ordinarySunday);
  assert.ok(candidates.length > 400);
  for (const candidate of candidates) {
    assert.ok(readings[candidate.readings.first], candidate.name + " has no first-reading text");
    assert.ok(readings[candidate.readings.psalm], candidate.name + " has no psalm text");
    assert.ok(readings[candidate.readings.gospel], candidate.name + " has no Gospel text");
  }
});

test("every generated citation has text and Psalm offsets preserve the cited verse", () => {
  for (const [citation, text] of Object.entries(readings)) {
    assert.ok(text, citation + " has no generated text");
  }
  assert.match(readings["Psalm 19:8, 9, 10, 15"], /^⁸ Yahweh's law is perfect/);
  assert.match(readings["Psalm 23:1-3a, 3b-4, 5, 6"], /^¹ &gt; Yahweh is my shepherd/);
  assert.match(readings["Psalm 51:3-4, 12-13, 14-15"], /^³ &gt; Have mercy on me/);
  assert.ok(!("Psalm 23: 1-3a, 3b4, 5, 6" in readings));
});
