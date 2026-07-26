(function (global) {
  "use strict";

  const READING_SLOTS = [
    { key: "first", dataKey: "f", label: "First Reading" },
    { key: "psalm", dataKey: "p", label: "Responsorial Psalm" },
    { key: "second", dataKey: "e", label: "Second Reading" },
    { key: "gospel", dataKey: "g", label: "Gospel" },
  ];

  function normalizedCitation(value) {
    return (value || "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Lectionary sources commonly encode a long form, short form, or genuinely
  // different passage as "Book 1:1-10 or 1:1-5". Expand the implied book name so
  // every option becomes an independently valid citation and storage value.
  function citationAlternatives(value) {
    const citation = (value || "").replace(/[–—]/g, "-").trim();
    if (!citation) return [];
    const parts = citation.split(/\s+or\s+/i).map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) return [citation];
    const bookMatch = parts[0].match(/^((?:[1-3]\s+)?[A-Za-z][A-Za-z ]*?)\s+\d/);
    const book = bookMatch ? bookMatch[1] : "";
    return parts.map((part, index) => index === 0 || !/^\d+:/.test(part) ? part : book + " " + part);
  }

  // This parser is deliberately narrower than a general Bible-reference parser.
  // A selection is accepted only when it can be stored as structured chapter/verse
  // segments and has an embedded full text in this app.
  function parseReadingCitation(value) {
    const citation = (value || "").replace(/[–—]/g, "-").trim();
    const match = citation.match(/^((?:[1-3]\s+)?[A-Za-z][A-Za-z ]*?)\s+(\d.*)$/);
    if (!match || /\s+or\s+/i.test(citation)) return null;
    const book = match[1].trim();
    const pieces = match[2]
      .replace(/(\d+)-\d+-\d+-(\d+)/g, "$1-$2")
      .split(/[;,.+]/)
      .map(piece => piece.trim())
      .filter(Boolean);
    const segments = [];
    let chapter = null;
    for (const piece of pieces) {
      let part = piece.match(/^(\d+):(\d+[a-z]*)-(\d+):(\d+[a-z]*)$/i);
      if (part) {
        chapter = Number(part[1]);
        segments.push({ startChapter: chapter, startVerse: part[2], endChapter: Number(part[3]), endVerse: part[4] });
        continue;
      }
      part = piece.match(/^(\d+):(\d+[a-z]*)-(\d+[a-z]*)$/i);
      if (part) {
        chapter = Number(part[1]);
        segments.push({ startChapter: chapter, startVerse: part[2], endChapter: chapter, endVerse: part[3] });
        continue;
      }
      part = piece.match(/^(\d+):(\d+[a-z]*)$/i);
      if (part) {
        chapter = Number(part[1]);
        segments.push({ startChapter: chapter, startVerse: part[2], endChapter: chapter, endVerse: part[2] });
        continue;
      }
      part = piece.match(/^(\d+[a-z]*)-(\d+[a-z]*)$/i);
      if (part && chapter !== null) {
        segments.push({ startChapter: chapter, startVerse: part[1], endChapter: chapter, endVerse: part[2] });
        continue;
      }
      part = piece.match(/^(\d+[a-z]*)$/i);
      if (part && chapter !== null) {
        segments.push({ startChapter: chapter, startVerse: part[1], endChapter: chapter, endVerse: part[1] });
        continue;
      }
      return null;
    }
    return segments.length ? { book, segments } : null;
  }

  function dayDistance(a, b) {
    return Math.round((new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime()) / 86400000);
  }

  function nearestDateForMonthDay(monthDay, anchorDate) {
    const year = Number(anchorDate.slice(0, 4));
    return [year - 1, year, year + 1]
      .map(value => value + "-" + monthDay)
      .sort((a, b) => Math.abs(dayDistance(a, anchorDate)) - Math.abs(dayDistance(b, anchorDate)))[0];
  }

  function create({ sundays, celebrations, commons, readings }) {
    const commonById = new Map(commons.map(common => [common.id, common]));

    function usableCitation(citation) {
      return Boolean(citation && readings[citation] && parseReadingCitation(citation));
    }

    function uniqueAvailableCitations(values) {
      const seen = new Set();
      return values.flatMap(citationAlternatives).filter(citation => {
        const key = normalizedCitation(citation);
        if (!usableCitation(citation) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // Commons distinguish the first reading used in Easter from the OT reading
    // used outside Easter. Other roles are season-independent. An explicit proper
    // reading is placed first, followed by every usable option from each referenced
    // Common; duplicates are removed without changing source order.
    function celebrationReadingOptions(item, slot, season) {
      const direct = citationAlternatives(item[slot.dataKey]);
      const commonValues = (item.commonIds || []).flatMap(id => {
        const common = commonById.get(id);
        if (!common) return [];
        if (slot.key === "first") {
          return /Easter/i.test(season) ? common.firstEaster : common.firstOutsideEaster;
        }
        return common[slot.key] || [];
      });
      return uniqueAvailableCitations([...direct, ...commonValues]);
    }

    // These two role catalogues power individual-reading validation. Commons are
    // included here even when no currently listed saint selects that passage.
    const roleCitations = {};
    const citationRoles = {};
    READING_SLOTS.forEach(slot => {
      const commonValues = commons.flatMap(common => {
        if (slot.key === "first") return [...common.firstOutsideEaster, ...common.firstEaster];
        return common[slot.key] || [];
      });
      const catalogueValues = [
        ...sundays.flatMap(sunday => citationAlternatives(sunday[slot.dataKey])),
        ...celebrations.flatMap(item => citationAlternatives(item[slot.dataKey])),
        ...commonValues.flatMap(citationAlternatives),
      ];
      const values = new Map();
      catalogueValues.forEach(citation => {
        if (!usableCitation(citation)) return;
        values.set(normalizedCitation(citation), citation);
        const roles = citationRoles[normalizedCitation(citation)] || [];
        if (!roles.includes(slot.key)) roles.push(slot.key);
        citationRoles[normalizedCitation(citation)] = roles;
      });
      roleCitations[slot.key] = values;
    });

    function availableCelebrations(currentSunday) {
      const anchor = currentSunday.d;
      const fixed = celebrations.map(item => {
        const readingOptions = Object.fromEntries(READING_SLOTS.map(slot => [
          slot.key,
          celebrationReadingOptions(item, slot, currentSunday.s),
        ]));
        if (!readingOptions.first.length || !readingOptions.psalm.length || !readingOptions.gospel.length) return null;
        const commonNames = (item.commonIds || []).map(id => commonById.get(id)?.name).filter(Boolean);
        return {
          id: item.id,
          name: item.name,
          sourceDate: nearestDateForMonthDay(item.monthDay, anchor),
          rank: item.rank || "Celebration",
          season: currentSunday.s,
          cycle: currentSunday.c,
          lectionary: item.lectionary,
          source: item.source,
          commonNames,
          readingOptions,
          readings: {
            first: readingOptions.first[0],
            psalm: readingOptions.psalm[0],
            // A Common supplies permitted second-reading choices, but absence of
            // a proper second reading remains the safe default for a memorial.
            second: citationAlternatives(item.e)[0] || "",
            gospel: readingOptions.gospel[0],
          },
        };
      }).filter(Boolean);

      // A/B/C Sunday patterns repeat. Retain the nearest concrete date for each
      // cycle + Sunday name, giving the picker one option rather than 51 duplicates.
      const bestSundays = new Map();
      sundays.forEach(sunday => {
        const key = sunday.c + "|" + sunday.n;
        const previous = bestSundays.get(key);
        if (!previous || Math.abs(dayDistance(sunday.d, anchor)) < Math.abs(dayDistance(previous.d, anchor))) {
          bestSundays.set(key, sunday);
        }
      });
      const sundayOptions = Array.from(bestSundays.values()).map(sunday => {
        const readingOptions = Object.fromEntries(READING_SLOTS.map(slot => [
          slot.key,
          uniqueAvailableCitations(citationAlternatives(sunday[slot.dataKey])),
        ]));
        if (!readingOptions.first.length || !readingOptions.psalm.length || !readingOptions.gospel.length) return null;
        return {
          id: "sunday-template-" + sunday.c + "-" + sunday.n,
          name: sunday.n,
          sourceDate: sunday.d,
          rank: "Sunday",
          season: sunday.s,
          cycle: sunday.c,
          source: "Sunday lectionary",
          commonNames: [],
          readingOptions,
          readings: {
            first: readingOptions.first[0],
            psalm: readingOptions.psalm[0],
            second: readingOptions.second[0] || "",
            gospel: readingOptions.gospel[0],
          },
        };
      }).filter(Boolean);
      return [...fixed, ...sundayOptions];
    }

    return {
      readingSlots: READING_SLOTS,
      roleCitations,
      citationRoles,
      normalizedCitation,
      citationAlternatives,
      parseReadingCitation,
      dayDistance,
      availableCelebrations,
    };
  }

  global.LectionaryCatalog = { create };
})(typeof window === "undefined" ? globalThis : window);
