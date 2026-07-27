// Pure search and preview presentation for selecting another lectionary celebration.
(function (global) {
  "use strict";

  function create({ escapeHtml, formatLong, cycleName, dayDistance }) {
    function searchText(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    function metadata(candidate) {
      return `${candidate.rank || "Celebration"} · ${formatLong(candidate.sourceDate)}`
        + (candidate.cycle && candidate.rank === "Sunday"
          ? ` · ${cycleName(candidate.cycle)}`
          : "")
        + (candidate.lectionary ? ` · Lectionary ${candidate.lectionary}` : "");
    }

    function renderResults(candidates, selectedId) {
      if (!candidates.length) {
        return '<p class="reading-validation">No available celebration matches that search.</p>';
      }
      return candidates.map((candidate, index) =>
        `<button class="celebration-result${selectedId === candidate.id ? " selected" : ""}" `
        + `type="button" data-celebration-index="${index}">`
        + `<strong>${escapeHtml(candidate.name)}</strong>`
        + `<small>${escapeHtml(metadata(candidate))}</small></button>`,
      ).join("");
    }

    function search({ candidates, currentSunday, query, selectedId }) {
      const available = candidates.filter(candidate =>
        !(candidate.sourceDate === currentSunday.d && candidate.name === currentSunday.n),
      );
      const normalizedQuery = searchText(query);
      let visible;
      let heading;
      if (normalizedQuery) {
        heading = "Matching celebrations";
        const words = normalizedQuery.split(" ");
        visible = available
          .filter(candidate => {
            const haystack = searchText(
              `${candidate.name} ${candidate.rank} ${formatLong(candidate.sourceDate)} `
              + `${candidate.cycle || ""} ${(candidate.commonNames || []).join(" ")}`,
            );
            return words.every(word => haystack.includes(word));
          })
          .sort((left, right) =>
            left.name.localeCompare(right.name)
            || left.sourceDate.localeCompare(right.sourceDate),
          )
          .slice(0, 40);
      } else {
        heading = "Nearby celebrations";
        visible = available
          .filter(candidate =>
            Math.abs(dayDistance(candidate.sourceDate, currentSunday.d)) <= 14,
          )
          .sort((left, right) =>
            Math.abs(dayDistance(left.sourceDate, currentSunday.d))
            - Math.abs(dayDistance(right.sourceDate, currentSunday.d))
            || left.sourceDate.localeCompare(right.sourceDate),
          )
          .slice(0, 30);
      }

      return Object.freeze({
        heading,
        candidates: visible,
        html: renderResults(visible, selectedId),
      });
    }

    function readingField(candidate, slot, label) {
      const readings = candidate.readings || {};
      const options = candidate.readingOptions?.[slot] || [];
      const allowNone = slot === "second"
        && !candidate.requiresSecondReading
        && !readings.second;
      if (options.length <= 1 && !allowNone) {
        return `<dt>${escapeHtml(label)}</dt>`
          + `<dd>${escapeHtml(readings[slot]) || "—"}</dd>`;
      }
      return `<dt><label for="celebrationReading_${slot}">${escapeHtml(label)}</label></dt>`
        + `<dd><select id="celebrationReading_${slot}" data-celebration-reading="${slot}">`
        + (slot === "second" && !candidate.requiresSecondReading
          ? '<option value="">No second reading</option>'
          : "")
        + options.map(citation =>
          `<option value="${escapeHtml(citation)}"`
          + (citation === readings[slot] ? " selected" : "")
          + `>${escapeHtml(citation)}</option>`,
        ).join("")
        + "</select></dd>";
    }

    function renderPreview(candidate) {
      if (!candidate) {
        return Object.freeze({ hidden: true, useDisabled: true, html: "" });
      }
      const optionsNote = candidate.commonNames?.length
        ? '<p class="celebration-options-note">Reading choices include '
          + `${escapeHtml(candidate.commonNames.join(" and "))}.</p>`
        : "";
      return Object.freeze({
        hidden: false,
        useDisabled: false,
        html: `<h3>${escapeHtml(candidate.name)}</h3>`
          + `<p>${escapeHtml(metadata(candidate))}</p>`
          + '<dl class="celebration-preview-grid">'
          + readingField(candidate, "first", "First Reading")
          + readingField(candidate, "psalm", "Psalm")
          + readingField(candidate, "second", "Second Reading")
          + readingField(candidate, "gospel", "Gospel")
          + `</dl>${optionsNote}`,
      });
    }

    return Object.freeze({ renderPreview, search });
  }

  const api = Object.freeze({ create });
  global.CelebrationPickerView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
