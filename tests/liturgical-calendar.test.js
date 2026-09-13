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

// ---- Any date --------------------------------------------------------------------

const WEEKDAY = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday" };

// romcal names the celebrations; these are the lectionary keys the planner uses for them.
function celebrationKey(key, cycle) {
  const sunday = name => `${cycle}|${name}`;
  const celebration = id => `celebration:${id}`;
  return {
    allSaints: sunday("All Saints"),
    allSouls: sunday("All Souls"),
    annunciation: celebration("sanctoral-545"),
    ascension: sunday("Ascension"),
    assumption: sunday("The Assumption of the Blessed Virgin Mary"),
    birthOfJohnTheBaptist: sunday("Birth of John the Baptist"),
    birthOfTheBlessedVirginMary: celebration("sanctoral-636"),
    chairOfSaintPeterApostle: celebration("sanctoral-535"),
    christmas: sunday("Christmas"),
    conversionOfSaintPaulApostle: celebration("sanctoral-519"),
    dedicationOfTheLateranBasilica: celebration("sanctoral-671"),
    epiphany: sunday("Epiphany"),
    holyFamily: sunday("Holy Family"),
    holyInnocentsMartyrs: celebration("sanctoral-698"),
    immaculateConception: celebration("sanctoral-689"),
    josephHusbandOfMary: celebration("sanctoral-543"),
    maryMotherOfGod: sunday("Mary, Mother of God"),
    peterAndPaulApostles: sunday("Saints Peter and Paul, Apostles"),
    presentationOfTheLord: celebration("sanctoral-524"),
    sacredHeartOfJesus: sunday("Sacred Heart"),
    saintAndrewTheApostle: celebration("sanctoral-684"),
    saintBartholomewTheApostle: celebration("sanctoral-629"),
    saintBenedictOfNursiaAbbot: celebration("sanctoral-597"),
    saintBridgetOfSwedenReligious: celebration("sanctoral-604"),
    saintCatherineOfSienaVirginAndDoctorOfTheChurch: celebration("sanctoral-557"),
    saintHenryBishopAndMartyr: sunday("Saint Henry, Bishop and Martyr"),
    saintJamesApostle: celebration("sanctoral-605"),
    saintJohnTheApostleAndEvangelist: celebration("sanctoral-697"),
    saintLawrenceOfRomeDeaconAndMartyr: celebration("sanctoral-618"),
    saintLukeTheEvangelist: celebration("sanctoral-661"),
    saintMarkTheEvangelist: celebration("sanctoral-555"),
    saintMaryMagdalene: celebration("sanctoral-603"),
    saintMatthewApostleAndEvangelist: celebration("sanctoral-643"),
    saintMatthiasTheApostle: celebration("sanctoral-564"),
    saintStephenTheFirstMartyr: celebration("sanctoral-696"),
    saintTeresaBenedictaOfTheCrossEdithSteinVirginAndMartyr: celebration("sanctoral-617a"),
    saintThomasTheApostle: celebration("sanctoral-593"),
    saintsCyrilMonkAndMethodiusBishop: celebration("sanctoral-532"),
    saintsMichaelGabrielAndRaphaelArchangels: celebration("sanctoral-647"),
    saintsPhilipAndJamesApostles: celebration("sanctoral-561"),
    saintsSimonAndJudeApostles: celebration("sanctoral-666"),
    theExaltationOfTheHolyCross: celebration("sanctoral-638"),
    transfiguration: celebration("sanctoral-614"),
    visitationOfTheBlessedVirginMary: celebration("sanctoral-572"),
  }[key];
}

// The key romcal's day implies, or null for a memorial, whose date keeps the weekday's
// readings but whose weekday romcal does not name.
function oracleKey(day) {
  const iso = day.moment.slice(0, 10);
  const monthDay = iso.slice(5);
  const cycle = day.data.meta.cycle.value.replace("Year ", "");
  const key = day.key.replace(/(\d+)(?:st|nd|rd|th)/i, "$1");
  let match;
  if (day.type === "COMMEMORATION" && celebrationKey(key, cycle)) return celebrationKey(key, cycle);
  if (/MEMORIAL|COMMEMORATION/.test(day.type)) return null;
  if ((match = key.match(/^(\w+?)OfThe(\d+)WeekOfOrdinaryTime$/))) {
    return `${Number(iso.slice(0, 4)) % 2 ? "I" : "II"}|Ordinary Time|${match[2]}|${WEEKDAY[match[1]]}`;
  }
  if ((match = key.match(/^(\w+?)OfThe(\d+)WeekOfAdvent$/))) {
    return monthDay >= "12-17" ? `Advent|${monthDay}` : `Advent|${match[2]}|${WEEKDAY[match[1]]}`;
  }
  if ((match = key.match(/^(\w+?)OfThe(\d+)WeekOfLent$/))) return `Lent|${match[2]}|${WEEKDAY[match[1]]}`;
  if ((match = key.match(/^(\w+?)AfterAshWednesday$/))) return `Lent|0|${WEEKDAY[match[1]]}`;
  if (key === "ashWednesday") return "Ash Wednesday";
  if ((match = key.match(/^(\w+?)OfHolyWeek$/))) return `Holy Week|${WEEKDAY[match[1]]}`;
  if (key === "holyThursday") return "Holy Thursday";
  if (key === "goodFriday") return "Good Friday";
  if (key === "holySaturday") return "";
  if ((match = key.match(/^easter(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/))) return `Easter|1|${match[1]}`;
  if ((match = key.match(/^(\w+?)OfThe(\d+)WeekOfEaster$/))) return `Easter|${match[2]}|${WEEKDAY[match[1]]}`;
  if (/DayInTheOctaveOfChristmas$/.test(key) || /(Before|After)Epiphany$/.test(key)) {
    return `Christmas|${monthDay}`;
  }
  const celebration = celebrationKey(key, cycle);
  if (!celebration) throw new Error(`No oracle mapping for ${day.type} ${day.key} on ${iso}`);
  return celebration;
}

// Where romcal 1.3 differs from the Table of Liturgical Days, which the planner follows:
// - it demotes a feast in Lent to a commemoration (handled in oracleKey above);
// - it ranks the Immaculate Heart of Mary, an obligatory memorial, as a feast, and lets
//   it and Mary, Mother of the Church override a feast on the same day;
// - when a Lord's solemnity displaces a June solemnity it drops the saint, where the
//   planner moves it (see MOVED_SOLEMNITIES).
const MOVABLE_MEMORIALS = new Set(["immaculateHeartOfMary", "maryMotherOfTheChurch"]);
const MOVED_SOLEMNITIES = {
  // The Sacred Heart falls on 24 June; the Birth of John the Baptist is anticipated.
  "2033-06-23": "B|Birth of John the Baptist",
  "2044-06-23": "A|Birth of John the Baptist",
  // Corpus Christi falls on Sunday 24 June, and the Sacred Heart on 29 June.
  "2057-06-25": "B|Birth of John the Baptist",
  "2057-06-30": "B|Saints Peter and Paul, Apostles",
  "2068-06-25": "A|Birth of John the Baptist",
  "2068-06-30": "A|Saints Peter and Paul, Apostles",
};

test("every weekday resolves to what an independent Finnish-calendar oracle celebrates", () => {
  const mismatches = [];
  for (let year = 2025; year <= 2075; year += 1) {
    romcal.calendarFor({ year, country: "finland", locale: "en", epiphanyOnJan6: true }).forEach(day => {
      const iso = day.moment.slice(0, 10);
      if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 0) return;
      const actual = LiturgicalCalendar.resolveDay(iso);
      if (MOVABLE_MEMORIALS.has(day.key) && !MOVED_SOLEMNITIES[iso]) {
        if (actual.r !== "Weekday" && actual.r !== "Feast") mismatches.push(`${iso} ${day.key}: got ${actual.l}`);
        return;
      }
      const expected = MOVED_SOLEMNITIES[iso] || oracleKey(day);
      if (expected === null) {
        if (actual.r !== "Weekday") mismatches.push(`${iso} ${day.key}: expected a weekday, got ${actual.l}`);
      } else if (actual.l !== expected) {
        mismatches.push(`${iso} ${day.type} ${day.key}: expected ${expected}, got ${actual.l}`);
      }
    });
  }
  assert.deepEqual(mismatches, []);
});

test("resolving a date validates it and hands Sundays to the Sunday calendar", () => {
  assert.equal(LiturgicalCalendar.resolveDay("2026-02-30"), null);
  assert.deepEqual(LiturgicalCalendar.resolveDay("2026-07-26"), {
    ...LiturgicalCalendar.resolveSunday("2026-07-26"),
    r: "Sunday",
  });
  // Any date keeps resolving without a horizon.
  assert.equal(LiturgicalCalendar.resolveDay("2190-10-30").r, "Weekday");
});

