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
    resolveSunday,
    sundaysBetween,
    upcomingSunday,
  });
  global.LiturgicalCalendar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
