// Pure navigation over Sundays calculated by the liturgical-calendar domain.
(function (global) {
  "use strict";

  function create(calendar) {
    if (!calendar?.upcomingSunday || !calendar?.nearestSunday
      || !calendar?.previousSunday || !calendar?.nextSunday) {
      throw new Error("A runtime liturgical calendar is required");
    }

    function selectionFor(iso) {
      return calendar.nearestSunday(iso);
    }

    function previousSunday(sunday) {
      return calendar.previousSunday(sunday?.d);
    }

    function nextSunday(sunday) {
      return calendar.nextSunday(sunday?.d);
    }

    return Object.freeze({
      upcomingSunday: calendar.upcomingSunday,
      selectionFor,
      previousSunday,
      nextSunday,
    });
  }

  const api = Object.freeze({ create });
  global.CalendarNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
