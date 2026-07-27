const test = require("node:test");
const assert = require("node:assert/strict");

const CalendarNavigation = require("../src/app/calendar-navigation.js");

const calendar = [
  { d: "2026-07-19" },
  { d: "2026-07-26" },
  { d: "2026-08-02" },
];

test("today selection chooses the next listed Sunday and clamps after the range", () => {
  const navigation = CalendarNavigation.create(calendar);

  assert.equal(navigation.upcomingIndex("2026-07-18"), 0);
  assert.equal(navigation.upcomingIndex("2026-07-26"), 1);
  assert.equal(navigation.upcomingIndex("2026-07-27"), 2);
  assert.equal(navigation.upcomingIndex("2027-01-01"), 2);
});

test("date selection distinguishes exact, nearby, and out-of-range dates", () => {
  const navigation = CalendarNavigation.create(calendar);

  assert.deepEqual(navigation.selectionFor("2026-07-26"), {
    index: 1,
    exact: true,
    withinRange: true,
    distanceDays: 0,
  });
  assert.deepEqual(navigation.selectionFor("2026-07-29"), {
    index: 1,
    exact: false,
    withinRange: true,
    distanceDays: 3,
  });
  assert.equal(navigation.selectionFor("2020-01-01").index, 0);
  assert.equal(navigation.selectionFor("2020-01-01").withinRange, false);
});

test("invalid dates and empty calendars cannot produce an index", () => {
  const navigation = CalendarNavigation.create(calendar);
  assert.deepEqual(navigation.selectionFor("not-a-date"), {
    index: -1,
    exact: false,
    withinRange: false,
    distanceDays: null,
  });

  const empty = CalendarNavigation.create([]);
  assert.equal(empty.upcomingIndex("2026-07-27"), -1);
  assert.equal(empty.selectionFor("2026-07-27").index, -1);
});

test("previous and next indices stop at calendar boundaries", () => {
  const navigation = CalendarNavigation.create(calendar);

  assert.equal(navigation.previousIndex(0), 0);
  assert.equal(navigation.previousIndex(2), 1);
  assert.equal(navigation.nextIndex(0), 1);
  assert.equal(navigation.nextIndex(2), 2);
});
