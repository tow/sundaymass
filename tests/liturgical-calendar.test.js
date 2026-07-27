const assert = require("node:assert/strict");
const test = require("node:test");

const LiturgicalCalendar = require("../src/domain/liturgical-calendar.js");
const expectedCalendar = require("../data/generated/sunday-calendar.json");

test("runtime calculation reproduces every generated Finnish Sunday from 2025–2075", () => {
  const actual = LiturgicalCalendar.sundaysBetween("2025-01-01", "2075-12-31");
  assert.deepEqual(actual, expectedCalendar);
});

test("runtime navigation has no fixed year horizon", () => {
  assert.deepEqual(
    LiturgicalCalendar.upcomingSunday("2126-07-27"),
    LiturgicalCalendar.resolveSunday("2126-07-28"),
  );
  assert.equal(
    LiturgicalCalendar.previousSunday("2126-07-28").d,
    "2126-07-21",
  );
  assert.equal(
    LiturgicalCalendar.nextSunday("2126-07-28").d,
    "2126-08-04",
  );
});

test("nearest Sunday selection validates dates and reports distance", () => {
  assert.deepEqual(LiturgicalCalendar.nearestSunday("2026-07-29"), {
    sunday: LiturgicalCalendar.resolveSunday("2026-07-26"),
    exact: false,
    distanceDays: 3,
  });
  assert.equal(LiturgicalCalendar.nearestSunday("not-a-date"), null);
  assert.equal(LiturgicalCalendar.resolveSunday("2026-07-27"), null);
});
