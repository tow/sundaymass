// Pure navigation over days calculated by the liturgical-calendar domain. A chosen date is
// planned exactly; the arrows step between Sundays, the usual way into a plan.
(function (global) {
  "use strict";

  function create(calendar) {
    if (!calendar?.upcomingSunday || !calendar?.resolveDay || !calendar?.addDays) {
      throw new Error("A runtime liturgical calendar is required");
    }

    function selectionFor(iso) {
      return calendar.resolveDay(iso);
    }

    // The Sunday before a day, or the one before that when the day is itself a Sunday.
    function previousSunday(day) {
      const earlier = calendar.addDays(day?.d, -7);
      return earlier ? calendar.upcomingSunday(earlier) : null;
    }

    function nextSunday(day) {
      const later = calendar.addDays(day?.d, 1);
      return later ? calendar.upcomingSunday(later) : null;
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
