// Pure calculation of the Finnish Sunday calendar used by the planner.
(function (global) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const FIXED_ORDINARY_TIME_CELEBRATIONS = Object.freeze({
    "01-19": "Saint Henry, Bishop and Martyr",
    "02-02": "Presentation of the Lord",
    "06-24": "Birth of John the Baptist",
    "06-29": "Saints Peter and Paul, Apostles",
    "08-06": "Transfiguration",
    "08-15": "The Assumption of the Blessed Virgin Mary",
    "09-14": "The Exaltation of the Holy Cross",
    "11-01": "All Saints",
    "11-02": "All Souls",
    "11-09": "Dedication of the Lateran Basilica",
  });

  function timestamp(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
    const value = new Date(`${iso}T12:00:00Z`).getTime();
    if (!Number.isFinite(value)) return null;
    return new Date(value).toISOString().slice(0, 10) === iso ? value : null;
  }

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const value = timestamp(iso);
    return value === null ? null : isoDate(value + days * DAY_MS);
  }

  function dayDistance(a, b) {
    const first = timestamp(a);
    const second = timestamp(b);
    return first === null || second === null ? null : Math.round((first - second) / DAY_MS);
  }

  function sundayOnOrAfter(iso) {
    const value = timestamp(iso);
    if (value === null) return null;
    const weekday = new Date(value).getUTCDay();
    return isoDate(value + ((7 - weekday) % 7) * DAY_MS);
  }

  // Meeus/Jones/Butcher Gregorian computus.
  function easterSunday(year) {
    if (!Number.isInteger(year) || year < 1583 || year > 9999) return null;
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function firstSundayOfAdvent(year) {
    return sundayOnOrAfter(`${year}-11-27`);
  }

  function cycleFor(iso) {
    const year = Number(iso.slice(0, 4));
    const liturgicalYear = iso >= firstSundayOfAdvent(year) ? year + 1 : year;
    return { 0: "C", 1: "A", 2: "B" }[liturgicalYear % 3];
  }

  function ordinal(value) {
    const remainder = value % 100;
    if (remainder >= 11 && remainder <= 13) return `${value}th`;
    return `${value}${({ 1: "st", 2: "nd", 3: "rd" })[value % 10] || "th"}`;
  }

  function calculatedNameAndSeason(iso) {
    const year = Number(iso.slice(0, 4));
    const monthDay = iso.slice(5);
    const easter = easterSunday(year);
    const baptism = sundayOnOrAfter(`${year}-01-07`);
    const firstLent = addDays(easter, -42);
    const palm = addDays(easter, -7);
    const divineMercy = addDays(easter, 7);
    const pentecost = addDays(easter, 49);
    const trinity = addDays(easter, 56);
    const corpusChristi = addDays(easter, 63);
    const advent = firstSundayOfAdvent(year);
    const christKing = addDays(advent, -7);

    if (monthDay === "01-01") {
      return { name: "Mary, Mother of God", season: "Christmas" };
    }
    if (monthDay >= "01-02" && monthDay <= "01-05") {
      return { name: "Second Sunday after Christmas", season: "Christmas" };
    }
    if (monthDay === "01-06") {
      return { name: "Epiphany", season: "Christmas" };
    }
    if (iso === baptism) {
      return { name: "Baptism of the Lord", season: "Christmas" };
    }
    if (monthDay === "12-25") {
      return { name: "Christmas", season: "Christmas" };
    }
    if (monthDay >= "12-26") {
      return { name: "Holy Family", season: "Christmas" };
    }
    if (iso >= advent && monthDay <= "12-24") {
      const week = 1 + dayDistance(iso, advent) / 7;
      return { name: `${ordinal(week)} Sunday of Advent`, season: "Advent" };
    }
    if (iso === christKing) {
      return { name: "Christ the King", season: "Ordinary Time" };
    }
    if (iso === firstLent) {
      return { name: "1st Sunday of Lent", season: "Lent" };
    }
    if (iso > firstLent && iso < palm) {
      const week = 1 + dayDistance(iso, firstLent) / 7;
      return { name: `${ordinal(week)} Sunday of Lent`, season: "Lent" };
    }
    if (iso === palm) {
      return { name: "Palm Sunday", season: "Holy Week" };
    }
    if (iso === easter) {
      return { name: "Easter Sunday", season: "Eastertide" };
    }
    if (iso === divineMercy) {
      return { name: "Divine Mercy Sunday", season: "Eastertide" };
    }
    if (iso > divineMercy && iso < pentecost) {
      const week = 2 + dayDistance(iso, divineMercy) / 7;
      return { name: `${ordinal(week)} Sunday of Easter`, season: "Eastertide" };
    }
    if (iso === pentecost) {
      return { name: "Pentecost Sunday", season: "Eastertide" };
    }
    if (iso === trinity) {
      return { name: "Trinity Sunday", season: "Ordinary Time" };
    }
    if (iso === corpusChristi) {
      return { name: "Corpus Christi", season: "Ordinary Time" };
    }

    if (iso > baptism && iso < firstLent) {
      const week = 2 + dayDistance(iso, addDays(baptism, 7)) / 7;
      return {
        name: `${ordinal(week)} Sunday in Ordinary Time`,
        season: "Ordinary Time",
      };
    }

    const week = 34 - dayDistance(christKing, iso) / 7;
    return {
      name: `${ordinal(week)} Sunday in Ordinary Time`,
      season: "Ordinary Time",
    };
  }

  function resolveSunday(iso) {
    const value = timestamp(iso);
    if (value === null || new Date(value).getUTCDay() !== 0) return null;
    const cycle = cycleFor(iso);
    const calculated = calculatedNameAndSeason(iso);
    const fixedName = /Sunday in Ordinary Time$/.test(calculated.name)
      ? FIXED_ORDINARY_TIME_CELEBRATIONS[iso.slice(5)]
      : "";
    const name = fixedName || calculated.name;
    return {
      d: iso,
      n: name,
      s: calculated.season,
      c: cycle,
      l: `${cycle}|${name}`,
    };
  }

  function upcomingSunday(iso) {
    const sunday = sundayOnOrAfter(iso);
    return sunday ? resolveSunday(sunday) : null;
  }

  function nearestSunday(iso) {
    const value = timestamp(iso);
    if (value === null) return null;
    const upcoming = sundayOnOrAfter(iso);
    const previous = addDays(upcoming, -7);
    const upcomingDistance = Math.abs(dayDistance(upcoming, iso));
    const previousDistance = Math.abs(dayDistance(previous, iso));
    const selected = previousDistance <= upcomingDistance ? previous : upcoming;
    return {
      sunday: resolveSunday(selected),
      exact: selected === iso,
      distanceDays: Math.min(previousDistance, upcomingDistance),
    };
  }

  // ---- Any date -------------------------------------------------------------------
  //
  // A weekday's default readings are the day the Finnish calendar celebrates: the
  // weekday of the Proper of Time, unless a solemnity or feast takes precedence.
  // Memorials are left to the editor's celebration picker, since a memorial normally
  // keeps the weekday readings. Ranks follow the Table of Liturgical Days: a lower
  // number takes precedence. See docs/lectionary.md for the assumptions behind the
  // Finnish list below and what still needs confirming against the diocesan Ordo.

  const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const RANK = Object.freeze({
    TRIDUUM: 1,
    PRIVILEGED_DAY: 2,
    SOLEMNITY: 3,
    PROPER_SOLEMNITY: 4,
    FEAST_OF_THE_LORD: 5,
    FEAST: 7,
    PROPER_FEAST: 8,
    PRIVILEGED_WEEKDAY: 9,
    WEEKDAY: 13,
  });

  // `sunday` names a Sunday-lectionary template, used where one exists so a celebration
  // has the same readings whichever day it falls on; `celebration` names a
  // celebrations.json entry.
  const FIXED_CELEBRATIONS = Object.freeze([
    { monthDay: "01-19", rank: RANK.PROPER_SOLEMNITY, name: "Saint Henry, Bishop and Martyr", sunday: "Saint Henry, Bishop and Martyr" },
    { monthDay: "01-25", rank: RANK.FEAST, name: "The Conversion of Saint Paul, Apostle", celebration: "sanctoral-519" },
    { monthDay: "02-02", rank: RANK.FEAST_OF_THE_LORD, name: "Presentation of the Lord", celebration: "sanctoral-524" },
    { monthDay: "02-14", rank: RANK.PROPER_FEAST, name: "Saints Cyril and Methodius, Patrons of Europe", celebration: "sanctoral-532" },
    { monthDay: "02-22", rank: RANK.FEAST, name: "The Chair of Saint Peter, Apostle", celebration: "sanctoral-535" },
    { monthDay: "03-19", rank: RANK.SOLEMNITY, name: "Saint Joseph, Husband of the Blessed Virgin Mary", celebration: "sanctoral-543" },
    { monthDay: "03-25", rank: RANK.SOLEMNITY, name: "The Annunciation of the Lord", celebration: "sanctoral-545" },
    { monthDay: "04-25", rank: RANK.FEAST, name: "Saint Mark, Evangelist", celebration: "sanctoral-555" },
    { monthDay: "04-29", rank: RANK.PROPER_FEAST, name: "Saint Catherine of Siena, Patron of Europe", celebration: "sanctoral-557" },
    { monthDay: "05-03", rank: RANK.FEAST, name: "Saints Philip and James, Apostles", celebration: "sanctoral-561" },
    { monthDay: "05-14", rank: RANK.FEAST, name: "Saint Matthias, Apostle", celebration: "sanctoral-564" },
    { monthDay: "05-31", rank: RANK.FEAST, name: "The Visitation of the Blessed Virgin Mary", celebration: "sanctoral-572" },
    { monthDay: "06-24", rank: RANK.SOLEMNITY, name: "Birth of John the Baptist", sunday: "Birth of John the Baptist" },
    { monthDay: "06-29", rank: RANK.SOLEMNITY, name: "Saints Peter and Paul, Apostles", sunday: "Saints Peter and Paul, Apostles" },
    { monthDay: "07-03", rank: RANK.FEAST, name: "Saint Thomas, Apostle", celebration: "sanctoral-593" },
    { monthDay: "07-11", rank: RANK.PROPER_FEAST, name: "Saint Benedict, Patron of Europe", celebration: "sanctoral-597" },
    { monthDay: "07-22", rank: RANK.FEAST, name: "Saint Mary Magdalene", celebration: "sanctoral-603" },
    { monthDay: "07-23", rank: RANK.PROPER_FEAST, name: "Saint Bridget of Sweden, Patron of Europe", celebration: "sanctoral-604" },
    // The titular solemnity of this parish's church.
    { monthDay: "07-25", rank: RANK.PROPER_SOLEMNITY, name: "Saint James the Apostle", celebration: "sanctoral-605" },
    { monthDay: "08-06", rank: RANK.FEAST_OF_THE_LORD, name: "Transfiguration", celebration: "sanctoral-614" },
    { monthDay: "08-09", rank: RANK.PROPER_FEAST, name: "Saint Teresa Benedicta of the Cross, Patron of Europe", celebration: "sanctoral-617a" },
    { monthDay: "08-10", rank: RANK.FEAST, name: "Saint Lawrence, Deacon and Martyr", celebration: "sanctoral-618" },
    { monthDay: "08-15", rank: RANK.SOLEMNITY, name: "The Assumption of the Blessed Virgin Mary", sunday: "The Assumption of the Blessed Virgin Mary" },
    { monthDay: "08-24", rank: RANK.FEAST, name: "Saint Bartholomew, Apostle", celebration: "sanctoral-629" },
    { monthDay: "09-08", rank: RANK.FEAST, name: "The Nativity of the Blessed Virgin Mary", celebration: "sanctoral-636" },
    { monthDay: "09-14", rank: RANK.FEAST_OF_THE_LORD, name: "The Exaltation of the Holy Cross", celebration: "sanctoral-638" },
    { monthDay: "09-21", rank: RANK.FEAST, name: "Saint Matthew, Apostle and Evangelist", celebration: "sanctoral-643" },
    { monthDay: "09-29", rank: RANK.FEAST, name: "Saints Michael, Gabriel, and Raphael, Archangels", celebration: "sanctoral-647" },
    { monthDay: "10-18", rank: RANK.FEAST, name: "Saint Luke, Evangelist", celebration: "sanctoral-661" },
    { monthDay: "10-28", rank: RANK.FEAST, name: "Saints Simon and Jude, Apostles", celebration: "sanctoral-666" },
    { monthDay: "11-01", rank: RANK.SOLEMNITY, name: "All Saints", sunday: "All Saints" },
    { monthDay: "11-02", rank: RANK.SOLEMNITY, name: "All Souls", sunday: "All Souls" },
    { monthDay: "11-09", rank: RANK.FEAST_OF_THE_LORD, name: "Dedication of the Lateran Basilica", celebration: "sanctoral-671" },
    { monthDay: "11-30", rank: RANK.FEAST, name: "Saint Andrew, Apostle", celebration: "sanctoral-684" },
    { monthDay: "12-08", rank: RANK.SOLEMNITY, name: "The Immaculate Conception of the Blessed Virgin Mary", celebration: "sanctoral-689" },
    { monthDay: "12-26", rank: RANK.FEAST, name: "Saint Stephen, the First Martyr", celebration: "sanctoral-696" },
    { monthDay: "12-27", rank: RANK.FEAST, name: "Saint John, Apostle and Evangelist", celebration: "sanctoral-697" },
    { monthDay: "12-28", rank: RANK.FEAST, name: "The Holy Innocents, Martyrs", celebration: "sanctoral-698" },
  ]);

  function weekdayOf(iso) {
    return new Date(timestamp(iso)).getUTCDay();
  }

  function sundayOnOrBefore(iso) {
    return addDays(iso, -weekdayOf(iso));
  }

  function weekOf(iso, start) {
    return 1 + Math.floor(dayDistance(iso, start) / 7);
  }

  // The weekday of the Proper of Time on a non-Sunday date, with its rank.
  function properOfTimeDay(iso) {
    const year = Number(iso.slice(0, 4));
    const monthDay = iso.slice(5);
    const weekday = WEEKDAY_NAMES[weekdayOf(iso)];
    const cycle = cycleFor(iso);
    const easter = easterSunday(year);
    const ashWednesday = addDays(easter, -46);
    const firstLent = addDays(easter, -42);
    const palm = addDays(easter, -7);
    const pentecost = addDays(easter, 49);
    const advent = firstSundayOfAdvent(year);
    const christKing = addDays(advent, -7);
    const baptism = sundayOnOrAfter(`${year}-01-07`);
    const christmasSunday = weekdayOf(`${year}-12-25`) === 0;
    const day = (fields, rank = RANK.WEEKDAY, r = "Weekday") => ({ rank, r, ...fields });

    if (monthDay === "12-25") {
      return day({ n: "Christmas", s: "Christmas", l: `${cycle}|Christmas` }, RANK.PRIVILEGED_DAY, "Solemnity");
    }
    if (monthDay >= "12-26") {
      if (christmasSunday && monthDay === "12-30") {
        return day({ n: "Holy Family", s: "Christmas", l: `${cycle}|Holy Family` }, RANK.FEAST_OF_THE_LORD, "Feast");
      }
      return day({
        n: `December ${Number(iso.slice(8))}, within the Octave of Christmas`,
        s: "Christmas",
        l: `Christmas|${monthDay}`,
      }, RANK.PRIVILEGED_WEEKDAY);
    }
    if (monthDay === "01-01") {
      return day({ n: "Mary, Mother of God", s: "Christmas", l: `${cycle}|Mary, Mother of God` }, RANK.SOLEMNITY, "Solemnity");
    }
    if (monthDay === "01-06") {
      return day({ n: "Epiphany", s: "Christmas", l: `${cycle}|Epiphany` }, RANK.PRIVILEGED_DAY, "Solemnity");
    }
    if (iso < baptism) {
      return day({
        n: `January ${Number(iso.slice(8))}, Christmas Weekday`,
        s: "Christmas",
        l: `Christmas|${monthDay}`,
      });
    }
    if (iso >= advent) {
      if (monthDay >= "12-17") {
        return day({ n: `December ${Number(iso.slice(8))}`, s: "Advent", l: `Advent|${monthDay}` }, RANK.PRIVILEGED_WEEKDAY);
      }
      const week = weekOf(iso, advent);
      return day({
        n: `${weekday} of the ${ordinal(week)} Week of Advent`,
        s: "Advent",
        l: `Advent|${week}|${weekday}`,
        variant: cycle,
      });
    }
    if (iso >= ashWednesday && iso < firstLent) {
      if (iso === ashWednesday) return day({ n: "Ash Wednesday", s: "Lent", l: "Ash Wednesday" }, RANK.PRIVILEGED_DAY);
      return day({ n: `${weekday} after Ash Wednesday`, s: "Lent", l: `Lent|0|${weekday}` }, RANK.PRIVILEGED_WEEKDAY);
    }
    if (iso > firstLent && iso < palm) {
      const week = weekOf(iso, firstLent);
      return day({
        n: `${weekday} of the ${ordinal(week)} Week of Lent`,
        s: "Lent",
        l: `Lent|${week}|${weekday}`,
        variant: cycle,
      }, RANK.PRIVILEGED_WEEKDAY);
    }
    if (iso > palm && iso < easter) {
      if (iso === addDays(easter, -3)) {
        return day({ n: "Holy Thursday", s: "Holy Week", l: "Holy Thursday" }, RANK.TRIDUUM, "Triduum");
      }
      if (iso === addDays(easter, -2)) {
        return day({ n: "Good Friday", s: "Holy Week", l: "Good Friday" }, RANK.TRIDUUM, "Triduum");
      }
      if (iso === addDays(easter, -1)) {
        // No Mass is celebrated by day; the Easter Vigil belongs to Easter Sunday.
        return day({ n: "Holy Saturday", s: "Holy Week", l: "" }, RANK.TRIDUUM, "Triduum");
      }
      return day({ n: `${weekday} of Holy Week`, s: "Holy Week", l: `Holy Week|${weekday}` }, RANK.PRIVILEGED_DAY);
    }
    if (iso > easter && iso < pentecost) {
      const week = weekOf(iso, easter);
      if (week === 1) {
        return day({
          n: `${weekday} within the Octave of Easter`,
          s: "Eastertide",
          l: `Easter|1|${weekday}`,
        }, RANK.PRIVILEGED_DAY, "Solemnity");
      }
      // Finland keeps the Ascension on its Thursday.
      if (iso === addDays(easter, 39)) {
        return day({ n: "Ascension of the Lord", s: "Eastertide", l: `${cycle}|Ascension` }, RANK.PRIVILEGED_DAY, "Solemnity");
      }
      return day({
        n: `${weekday} of the ${ordinal(week)} Week of Easter`,
        s: "Eastertide",
        l: `Easter|${week}|${weekday}`,
        variant: cycle,
      });
    }
    if (iso === addDays(easter, 68)) {
      return day({ n: "Most Sacred Heart of Jesus", s: "Ordinary Time", l: `${cycle}|Sacred Heart` }, RANK.SOLEMNITY, "Solemnity");
    }
    const week = iso < ashWednesday
      ? weekOf(iso, baptism)
      : 34 - dayDistance(christKing, sundayOnOrBefore(iso)) / 7;
    const weekdayCycle = year % 2 === 1 ? "I" : "II";
    return day({
      n: `${weekday} of the ${ordinal(week)} Week in Ordinary Time`,
      s: "Ordinary Time",
      l: `${weekdayCycle}|Ordinary Time|${week}|${weekday}`,
      variant: cycle,
    });
  }

  function fixedCelebrationDay(item, iso) {
    const cycle = cycleFor(iso);
    return {
      rank: item.rank,
      r: item.rank <= RANK.PROPER_SOLEMNITY ? "Solemnity" : "Feast",
      n: item.name,
      s: properOfTimeDay(iso).s,
      l: item.sunday ? `${cycle}|${item.sunday}` : `celebration:${item.celebration}`,
    };
  }

  // Whether nothing of solemnity or feast rank already occupies the date, so an impeded
  // solemnity can be moved there.
  function isFreeDay(iso) {
    if (weekdayOf(iso) === 0 || properOfTimeDay(iso).rank <= RANK.PROPER_FEAST) return false;
    return !FIXED_CELEBRATIONS.some(item => item.monthDay === iso.slice(5));
  }

  // Where a fixed solemnity is actually celebrated in a given year, or null when a
  // Sunday takes it (the Sunday calendar handles that case).
  function solemnityDate(item, year) {
    const nominal = `${year}-${item.monthDay}`;
    const easter = easterSunday(year);
    const palm = addDays(easter, -7);
    if (item.monthDay === "03-19" && nominal >= palm && nominal <= easter) return addDays(palm, -1);
    if (item.monthDay === "03-25" && nominal >= palm && nominal <= addDays(easter, 7)) return addDays(easter, 8);
    const sacredHeart = addDays(easter, 68);
    let impeded = properOfTimeDay(nominal).rank <= RANK.SOLEMNITY || nominal === sacredHeart;
    if (weekdayOf(nominal) === 0) {
      const sunday = resolveSunday(nominal);
      if (sunday.n === (item.sunday || item.name)) return null;
      impeded = /Advent|Lent|Easter|Palm|Pentecost|Trinity|Corpus Christi/.test(sunday.n);
      if (!impeded) return null;
    }
    if (!impeded) return nominal;
    // The Birth of John the Baptist is anticipated when the Sacred Heart displaces it.
    if (item.monthDay === "06-24" && nominal === sacredHeart) return addDays(nominal, -1);
    let date = addDays(nominal, 1);
    while (!isFreeDay(date)) date = addDays(date, 1);
    return date;
  }

  function resolveDay(iso) {
    const value = timestamp(iso);
    if (value === null) return null;
    if (weekdayOf(iso) === 0) return { ...resolveSunday(iso), r: "Sunday" };
    const year = Number(iso.slice(0, 4));
    const candidates = [properOfTimeDay(iso)];
    FIXED_CELEBRATIONS.forEach(item => {
      if (item.rank <= RANK.PROPER_SOLEMNITY) {
        if (solemnityDate(item, year) === iso) candidates.push(fixedCelebrationDay(item, iso));
      } else if (item.monthDay === iso.slice(5)) {
        candidates.push(fixedCelebrationDay(item, iso));
      }
    });
    const winner = candidates.reduce((best, item) => (item.rank < best.rank ? item : best));
    const variant = winner.variant ? `${winner.variant}|${winner.l}` : "";
    return {
      d: iso,
      n: winner.n,
      s: winner.s,
      c: cycleFor(iso),
      l: winner.l,
      ...(variant ? { v: variant } : {}),
      r: winner.r,
    };
  }

  function previousSunday(iso) {
    return resolveSunday(addDays(iso, -7));
  }

  function nextSunday(iso) {
    return resolveSunday(addDays(iso, 7));
  }

  function sundaysBetween(start, end) {
    if (timestamp(start) === null || timestamp(end) === null || start > end) return [];
    const values = [];
    for (let iso = sundayOnOrAfter(start); iso && iso <= end; iso = addDays(iso, 7)) {
      values.push(resolveSunday(iso));
    }
    return values;
  }

  const api = Object.freeze({
    addDays,
    cycleFor,
    easterSunday,
    firstSundayOfAdvent,
    nearestSunday,
    nextSunday,
    previousSunday,
    resolveDay,
    resolveSunday,
    sundaysBetween,
    upcomingSunday,
  });
  global.LiturgicalCalendar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
