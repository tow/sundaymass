// Pure index selection for the planner's finite, ordered Sunday calendar.
(function (global) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  function timestamp(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return null;
    const value = new Date(`${iso}T12:00:00Z`).getTime();
    if (!Number.isFinite(value)) return null;
    return new Date(value).toISOString().slice(0, 10) === iso ? value : null;
  }

  function create(calendar, { maxDistanceDays = 366 } = {}) {
    const dates = calendar.map(entry => entry.d);
    const dateIndexes = new Map(dates.map((date, index) => [date, index]));

    function upcomingIndex(iso) {
      if (!dates.length || timestamp(iso) === null) return -1;
      const index = dates.findIndex(date => date >= iso);
      return index < 0 ? dates.length - 1 : index;
    }

    function selectionFor(iso) {
      const exactIndex = dateIndexes.get(iso);
      if (exactIndex !== undefined) {
        return { index: exactIndex, exact: true, withinRange: true, distanceDays: 0 };
      }

      const target = timestamp(iso);
      if (target === null || !dates.length) {
        return { index: -1, exact: false, withinRange: false, distanceDays: null };
      }

      let index = -1;
      let distance = Number.POSITIVE_INFINITY;
      dates.forEach((date, candidateIndex) => {
        const candidateDistance = Math.abs(timestamp(date) - target);
        if (candidateDistance < distance) {
          index = candidateIndex;
          distance = candidateDistance;
        }
      });
      const distanceDays = distance / DAY_MS;
      return {
        index,
        exact: false,
        withinRange: distanceDays <= maxDistanceDays,
        distanceDays,
      };
    }

    function previousIndex(index) {
      return dates.length ? Math.max(0, index - 1) : -1;
    }

    function nextIndex(index) {
      return dates.length ? Math.min(dates.length - 1, index + 1) : -1;
    }

    return Object.freeze({ upcomingIndex, selectionFor, previousIndex, nextIndex });
  }

  const api = Object.freeze({ create });
  global.CalendarNavigation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
