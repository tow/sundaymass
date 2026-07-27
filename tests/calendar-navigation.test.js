const test = require("node:test");
const assert = require("node:assert/strict");

const CalendarNavigation = require("../src/app/calendar-navigation.js");
const LiturgicalCalendar = require("../src/domain/liturgical-calendar.js");

test("today selection calculates the next Sunday without a fixed range", () => {
  const navigation = CalendarNavigation.create(LiturgicalCalendar);

  assert.equal(navigation.upcomingSunday("2026-07-18").d, "2026-07-19");
  assert.equal(navigation.upcomingSunday("2026-07-26").d, "2026-07-26");
  assert.equal(navigation.upcomingSunday("2026-07-27").d, "2026-08-02");
  assert.equal(navigation.upcomingSunday("2126-07-27").d, "2126-07-28");
});

test("date selection returns the exact or nearest calculated Sunday", () => {
  const navigation = CalendarNavigation.create(LiturgicalCalendar);

  assert.deepEqual(navigation.selectionFor("2026-07-26"), {
    sunday: LiturgicalCalendar.resolveSunday("2026-07-26"),
    exact: true,
    distanceDays: 0,
  });
  assert.deepEqual(navigation.selectionFor("2026-07-29"), {
    sunday: LiturgicalCalendar.resolveSunday("2026-07-26"),
    exact: false,
    distanceDays: 3,
  });
});

test("invalid dates cannot produce a Sunday", () => {
  const navigation = CalendarNavigation.create(LiturgicalCalendar);
  assert.equal(navigation.selectionFor("not-a-date"), null);
  assert.equal(navigation.upcomingSunday("not-a-date"), null);
});

test("previous and next navigation crosses former calendar boundaries", () => {
  const navigation = CalendarNavigation.create(LiturgicalCalendar);

  assert.equal(navigation.previousSunday({ d: "2025-01-05" }).d, "2024-12-29");
  assert.equal(navigation.nextSunday({ d: "2075-12-29" }).d, "2076-01-05");
});
