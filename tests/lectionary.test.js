const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/domain/lectionary.js");

const sundayLectionary = require("../data/generated/sunday-lectionary.json");
const weekdayLectionary = require("../data/generated/weekday-lectionary.json");
const celebrations = require("../data/generated/celebrations.json");
const commons = require("../data/generated/commons.json");
const readings = require("../data/generated/readings_text.json");
const liturgicalCalendar = require("../src/domain/liturgical-calendar.js");
const catalog = global.LectionaryCatalog.create({
  liturgicalCalendar,
  sundayLectionary,
  weekdayLectionary,
  celebrations,
  commons,
  readings,
});
const ordinarySunday = liturgicalCalendar.resolveSunday("2026-07-26");

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
  assert.deepEqual(
    catalog.parseReadingCitation("Philemon 9-10, 12-17").segments[0],
    { startChapter: 1, startVerse: "9", endChapter: 1, endVerse: "10" },
  );
});

test("St James is a complete selectable parish solemnity", () => {
  const james = catalog.availableCelebrations(ordinarySunday)
    .find(celebration => celebration.id === "sanctoral-605");
  assert.ok(james);
  assert.equal(james.rank, "Solemnity at St James");
  assert.equal(james.requiresSecondReading, true);
  assert.deepEqual(james.readings, {
    first: "Acts 11:19-21; 12:1-2, 24",
    psalm: "Psalm 67:2-3, 5, 7-8",
    second: "2 Corinthians 4:7-15",
    gospel: "Matthew 20:20-28",
  });
});

test("a calendar date resolves its scheduled readings through one lectionary key", () => {
  const scheduled = catalog.scheduledCelebration(ordinarySunday);
  assert.equal(ordinarySunday.l, "A|17th Sunday in Ordinary Time");
  assert.equal(scheduled.name, "17th Sunday in Ordinary Time");
  assert.equal(scheduled.readings.first, "1 Kings 3:5, 7-12");
  assert.equal(scheduled.readings.gospel, "Matthew 13:44-52");
  assert.ok(!("f" in ordinarySunday), "calendar rows must not contain precomputed readings");
});

test("Sunday override candidates find real nearby occurrences at runtime", () => {
  const futureSunday = liturgicalCalendar.resolveSunday("2126-07-28");
  const candidates = catalog.availableCelebrations(futureSunday);
  const ordinary = candidates.find(candidate =>
    candidate.id === "sunday-template-A-17th Sunday in Ordinary Time");
  assert.ok(ordinary);
  assert.equal(
    liturgicalCalendar.resolveSunday(ordinary.sourceDate).l,
    "A|17th Sunday in Ordinary Time",
  );
  assert.ok(Math.abs(catalog.dayDistance(ordinary.sourceDate, futureSunday.d)) < 365 * 31);
});

test("runtime Sundays resolve only to complete unique lectionary entries", () => {
  const byId = new Map(sundayLectionary.map(item => [item.id, item]));
  assert.equal(byId.size, sundayLectionary.length, "lectionary IDs must be unique");
  const reached = new Set();
  liturgicalCalendar.sundaysBetween("1900-01-01", "2200-12-31").forEach(day => {
    assert.ok(byId.has(day.l), `${day.d} must reference a known lectionary entry`);
    reached.add(day.l);
    ["f", "p", "e", "g"].forEach(field => {
      assert.ok(!(field in day), `${day.d} must not embed its ${field} citation`);
    });
  });
  assert.equal(reached.size, byId.size, "every lectionary template must be reachable");
  sundayLectionary.forEach(item => {
    assert.ok(item.f && item.p && item.e && item.g, `${item.id} must contain all four Sunday readings`);
  });
});

test("every selectable Sunday or solemnity has a usable second reading", () => {
  const candidates = catalog.availableCelebrations(ordinarySunday)
    .filter(celebration => catalog.requiresSecondReading(celebration.rank));
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.ok(candidate.readings.second, candidate.name + " has no second reading");
    assert.ok(readings[candidate.readings.second], candidate.name + " has no second-reading text");
  }
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

// A Mass on any date starts from that date's readings. These defaults were checked against
// the USCCB readings published by cpbjr/catholic-readings-api, except where Finland's
// calendar differs (see docs/lectionary.md).
test("a weekday's default readings are the Finnish calendar's celebration of that date", () => {
  const readingsOn = date => catalog.scheduledCelebration(liturgicalCalendar.resolveDay(date));
  const expectations = {
    // An ordinary weekday, Year II.
    "2026-10-30": ["Friday of the 30th Week in Ordinary Time", "Weekday", "Philippians 1:1-11", "Psalm 111:1-2, 3-4, 5-6", "", "Luke 14:1-6"],
    // The Year A replacement for the reading the Sunday has just used.
    "2025-12-01": ["Monday of the 1st Week of Advent", "Weekday", "Isaiah 4:2-6", "Psalm 122:1-2, 3-4b, 4cd-5, 6-7, 8-9", "", "Matthew 8:5-11"],
    "2026-02-18": ["Ash Wednesday", "Weekday", "Joel 2:12-18", "Psalm 51:3-4, 5-6ab, 12-13, 14+17", "2 Corinthians 5:20-6:2", "Matthew 6:1-6, 16-18"],
    // Finland keeps the Ascension on Thursday.
    "2026-05-14": ["Ascension of the Lord", "Solemnity", "Acts 1:1-11", "Psalm 47:2-3, 6-7, 8-9", "Ephesians 1:17-23", "Matthew 28:16-20"],
    // A solemnity displaced from Holy Week to the Monday after the Second Sunday of Easter.
    "2027-04-05": ["The Annunciation of the Lord", "Solemnity", "Isaiah 7:10-14; 8:10", "Psalm 40:7-8a, 8b-9, 10, 11", "Hebrews 10:4-10", "Luke 1:26-38"],
    // A feast that takes precedence over the weekday.
    "2026-10-28": ["Saints Simon and Jude, Apostles", "Feast", "Ephesians 2:19-22", "Psalm 19:2-3, 4-5", "", "Luke 6:12-19"],
    // A European co-patron, a feast in Finland rather than a memorial.
    "2026-07-23": ["Saint Bridget of Sweden, Patron of Europe", "Feast", "Galatians 2:19-20", "Psalm 34:2-3, 4-5, 6-7, 8-9, 10-11", "", "John 15:1-8"],
    // No Mass by day on Holy Saturday.
    "2026-04-04": ["Holy Saturday", "Triduum", "", "", "", ""],
  };
  for (const [date, [name, rank, first, psalm, second, gospel]] of Object.entries(expectations)) {
    const scheduled = readingsOn(date);
    assert.equal(scheduled.name, name, date);
    assert.equal(scheduled.rank, rank, date);
    assert.equal(scheduled.id, `day-${date}`);
    assert.deepEqual(scheduled.readings, { first, psalm, second, gospel }, date);
  }
});

test("every weekday for a century has usable default readings, and every weekday set is reachable", () => {
  const byId = new Map(weekdayLectionary.map(item => [item.id, item]));
  assert.equal(byId.size, weekdayLectionary.length, "weekday lectionary IDs must be unique");
  const reached = new Set();
  const unusable = [];
  for (let date = "2000-01-01"; date <= "2100-12-31"; date = liturgicalCalendar.addDays(date, 1)) {
    const day = liturgicalCalendar.resolveDay(date);
    if (day.r === "Sunday" || day.n === "Holy Saturday") continue;
    [day.v, day.l].forEach(key => byId.has(key) && reached.add(key));
    const scheduled = catalog.scheduledCelebration(day).readings;
    Object.entries(scheduled).forEach(([role, citation]) => {
      if (!citation && role === "second") return;
      const options = catalog.citationAlternatives(citation);
      if (!options.length || options.some(option => !readings[option] || !catalog.parseReadingCitation(option))) {
        unusable.push(`${date} ${day.l} ${role}: "${citation}"`);
      }
    });
  }
  assert.deepEqual(unusable, []);
  // The source's Thursday of the 6th Week of Easter serves countries that move the
  // Ascension to Sunday; in Finland that Thursday is always the Ascension.
  assert.deepEqual(weekdayLectionary.map(item => item.id).filter(id => !reached.has(id)), ["Easter|6|Thursday"]);
});

test("a range running on into the next chapter parses as one segment", () => {
  assert.deepEqual(
    catalog.parseReadingCitation("2 Samuel 18:9-10, 14b, 24-25a, 30-19:3").segments.at(-1),
    { startChapter: 18, startVerse: "30", endChapter: 19, endVerse: "3" },
  );
});

