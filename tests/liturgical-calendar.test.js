const assert = require("node:assert/strict");
const test = require("node:test");
const romcal = require("romcal");

const LiturgicalCalendar = require("../src/domain/liturgical-calendar.js");

function romcalOracle(startYear, endYear) {
  const rank = type => ({ SOLEMNITY: 3, FEAST: 2, SUNDAY: 1 })[type] || 0;
  const byDate = {};
  for (let year = startYear; year <= endYear; year += 1) {
    romcal.calendarFor({ year, country: "finland", locale: "en" }).forEach(day => {
      const iso = day.moment.slice(0, 10);
      if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 0) return;
      if (!byDate[iso] || rank(day.type) > rank(byDate[iso].type)) byDate[iso] = day;
    });
  }
  return Object.values(byDate)
    .sort((a, b) => a.moment.localeCompare(b.moment))
    .map(day => {
      const iso = day.moment.slice(0, 10);
      const monthDay = iso.slice(5);
      const dayOfMonth = Number(iso.slice(8, 10));
      let name = day.name;
      let season = day.data.season.value;
      if (name === "Epiphany" && monthDay !== "01-06") {
        if (dayOfMonth <= 5) {
          name = "Second Sunday after Christmas";
        } else {
          name = "Baptism of the Lord";
        }
        season = "Christmas";
      } else if (monthDay === "11-02") {
        name = "All Souls";
        season = "Ordinary Time";
      } else if (/Saint Henry/.test(name)) {
        name = "Saint Henry, Bishop and Martyr";
      }
      name = name.replace(/ of Ordinary Time/, " in Ordinary Time");
      const cycle = day.data.meta.cycle.value.replace("Year ", "");
      return { d: iso, n: name, s: season, c: cycle, l: `${cycle}|${name}` };
    });
}

test("runtime calculation agrees with an independent Finnish-calendar oracle", () => {
  const actual = LiturgicalCalendar.sundaysBetween("2025-01-01", "2075-12-31");
  assert.deepEqual(actual, romcalOracle(2025, 2075));
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
