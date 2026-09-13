const assert = require("node:assert/strict");
const test = require("node:test");

const PlannerState = require("../src/app/planner-state.js");

function state() {
  return PlannerState.create({
    initialDay: {
      d: "2026-07-26",
      s: "Ordinary Time",
      c: "A",
      l: "A|17th Sunday in Ordinary Time",
    },
    readingSlots: [
      { key: "first" },
      { key: "psalm" },
      { key: "second" },
      { key: "gospel" },
    ],
    scheduledCelebration: sunday => ({
      name: `Scheduled ${sunday.d}`,
      readings: {
        first: "First default",
        psalm: "Psalm default",
        second: "Second default",
        gospel: "Gospel default",
      },
    }),
    formatLong: value => `Long ${value}`,
    cycleName: value => `Year ${value}`,
  });
}

test("planner state resolves the selected day and effective readings", () => {
  const value = state();
  value.setDay({
    d: "2026-08-02",
    s: "Ordinary Time",
    c: "A",
    l: "A|18th Sunday in Ordinary Time",
  });
  value.applyPlan({
    songs: { entrance: { id: "song-1", title: "Entrance" } },
    readingOverrides: {
      gospel: { citation: "Gospel override" },
    },
    celebrationOverride: null,
  });

  assert.equal(value.current().d, "2026-08-02");
  assert.equal(value.displayedCitation({ key: "first" }), "First default");
  assert.equal(value.displayedCitation({ key: "gospel" }), "Gospel override");
  assert.equal(value.songs().entrance.title, "Entrance");
  assert.deepEqual(value.values(), {
    day: "Scheduled 2026-08-02",
    meta: "Long 2026-08-02  ·  Ordinary Time · Year A",
    first: "First default",
    psalm: "Psalm default",
    second: "Second default",
    gospel: "Gospel override",
    date: "2026-08-02",
  });
});

test("summary values are shared by stateful and command-line booklet exports", () => {
  assert.deepEqual(PlannerState.summaryValues({
    day: { d: "2026-08-30", s: "Ordinary Time", c: "A" },
    celebration: { name: "22nd Sunday in Ordinary Time" },
    formatLong: value => `Long ${value}`,
    cycleName: value => `Year ${value}`,
  }), {
    day: "22nd Sunday in Ordinary Time",
    meta: "Long 2026-08-30  ·  Ordinary Time · Year A",
    date: "2026-08-30",
  });
});

test("celebration replacement atomically clears individual reading overrides", () => {
  const value = state();
  value.applyPlan({
    readingOverrides: { first: { citation: "Old override" } },
  });
  value.useCelebration({
    name: "Parish solemnity",
    rank: "Solemnity",
    sourceDate: "2026-07-25",
    readings: {
      first: "Proper first",
      psalm: "Proper psalm",
      second: "Proper second",
      gospel: "Proper gospel",
    },
  });

  assert.deepEqual(value.readingOverrides(), {});
  assert.equal(value.displayedCitation({ key: "first" }), "Proper first");
  assert.match(value.values().meta, /Solemnity · normally Long 2026-07-25/);

  value.restoreCelebration();
  assert.equal(value.celebrationOverride(), null);
  assert.equal(value.displayedCitation({ key: "first" }), "First default");
});

test("song and reading mutations update only their intended state", () => {
  const value = state();
  value.assignSong("communion", { id: "same-song", title: "Before" });
  value.assignSong("communion2", { id: "same-song", title: "Before" });
  value.assignSong("entrance", { id: "other-song", title: "Other" });
  value.updateSong({ id: "same-song", title: "After" });
  value.setReadingOverride("first", { citation: "Changed first" });

  assert.equal(value.songs().communion.title, "After");
  assert.equal(value.songs().communion2.title, "After");
  assert.equal(value.songs().entrance.title, "Other");
  assert.equal(value.displayedCitation({ key: "first" }), "Changed first");

  value.clearSong("communion2");
  value.setReadingOverride("first", null);
  assert.equal(value.songs().communion2, undefined);
  assert.deepEqual(value.readingOverrides(), {});

  value.reset();
  assert.deepEqual(value.songs(), {});
  assert.equal(value.celebrationOverride(), null);
});

test("a weekday is described by its rank and Holy Saturday can be selected", () => {
  assert.deepEqual(PlannerState.summaryValues({
    day: { d: "2026-10-30", s: "Ordinary Time", c: "A", r: "Weekday" },
    celebration: { name: "Friday of the 30th Week in Ordinary Time" },
    formatLong: value => `Long ${value}`,
    cycleName: value => `Year ${value}`,
  }).meta, "Long 2026-10-30  ·  Ordinary Time · Weekday");
  const value = state();
  value.setDay({ d: "2026-04-04", s: "Holy Week", c: "A", l: "", r: "Triduum" });
  assert.equal(value.current().d, "2026-04-04");
  assert.throws(() => value.setDay({ d: "2026-04-05" }), /A resolved day is required/);
});

test("a named Mass takes the title and keeps its celebration in the details", () => {
  const value = state();
  value.applyPlan({ songs: {}, readingOverrides: {}, occasionLabel: "Filipino Mass" });
  assert.equal(value.occasionLabel(), "Filipino Mass");
  assert.equal(value.values().day, "Filipino Mass");
  assert.equal(value.values().meta, "Long 2026-07-26  ·  Scheduled 2026-07-26 · Ordinary Time · Year A");
  value.setOccasionLabel("");
  assert.equal(value.values().day, "Scheduled 2026-07-26");
  value.applyPlan({ occasionLabel: "Filipino Mass" });
  value.reset();
  assert.equal(value.occasionLabel(), "");
});

