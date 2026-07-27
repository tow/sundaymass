const assert = require("node:assert/strict");
const test = require("node:test");

const PlannerState = require("../src/app/planner-state.js");

function state() {
  return PlannerState.create({
    initialSunday: {
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

test("planner state resolves the selected Sunday and effective readings", () => {
  const value = state();
  value.setSunday({
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
