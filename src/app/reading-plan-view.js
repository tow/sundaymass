// Renders the selected celebration, linked reading summary, and public full texts.
(function (global) {
  "use strict";

  function create({ escapeHtml, formatLong, cycleName }) {
    function readingCitation(values, slot) {
      return values?.[slot.key] || "";
    }

    function renderResolved({ sunday, celebration, celebrationOverride }) {
      const meta = celebrationOverride
        ? escapeHtml(
          `${celebration.rank || "Celebration"} · normally ${formatLong(celebration.sourceDate)}`,
        )
        : `${escapeHtml(sunday.s)} · ${escapeHtml(cycleName(sunday.c))}`;

      return `<span class="selected-date">${escapeHtml(formatLong(sunday.d))}</span>`
        + `<span class="selected-day">${escapeHtml(celebration.name)}`
        + (celebrationOverride
          ? '<span class="reading-adjusted-note">Changed celebration</span>'
          : "")
        + "</span>"
        + `<span class="selected-meta">${meta}</span>`;
    }

    function renderSummary({
      celebrationOverride,
      readingOverrides,
      readingSlots,
      values,
    }) {
      const anyAdjusted = Boolean(celebrationOverride)
        || readingSlots.some(slot => readingOverrides?.[slot.key]);
      const rows = readingSlots.map(slot => {
        const adjusted = Boolean(readingOverrides?.[slot.key]);
        const changed = Boolean(celebrationOverride) || adjusted;
        return `<a class="reading-item${changed ? " changed" : ""}" href="#reading-${escapeHtml(slot.key)}">`
          + `<span class="reading-label">${escapeHtml(slot.label)}`
          + (adjusted
            ? '<span class="reading-adjusted-note">Adjusted</span>'
            : "")
          + "</span>"
          + `<span class="reading-cite">${escapeHtml(readingCitation(values, slot)) || "—"}</span>`
          + "</a>";
      }).join("");

      return '<div class="reading-summary-title">Readings for this Mass'
        + (anyAdjusted
          ? '<span class="reading-adjusted-note">Adjusted</span>'
          : "")
        + '</div><div class="reading-grid">'
        + rows
        + "</div>";
    }

    function renderFullReadings({
      celebrationOverride,
      readingOverrides,
      readingSlots,
      values,
      textFor,
    }) {
      const blocks = readingSlots.map(slot => {
        const citation = readingCitation(values, slot);
        const fallback = slot.key === "psalm" ? "(sung — see citation)" : "";
        const text = textFor(citation) || fallback;
        const adjusted = Boolean(celebrationOverride) || Boolean(readingOverrides?.[slot.key]);
        return `<article class="rblock reading-anchor" id="reading-${escapeHtml(slot.key)}">`
          + `<div class="rhead">${escapeHtml(slot.label)}`
          + `<span class="rcite">${escapeHtml(citation)}</span>`
          + (adjusted
            ? '<span class="reading-adjusted-note">Adjusted</span>'
            : "")
          + "</div>"
          + `<div class="rtext">${escapeHtml(text) || "<em>(see citation)</em>"}</div>`
          + "</article>";
      }).join("");

      return blocks
        + '<div class="rpcaveat">Scripture: World English Bible (public domain). '
        + "Verse numbering — especially in the Psalms — can differ slightly from the lectionary.</div>";
    }

    function render(options) {
      return Object.freeze({
        readingsIntro: `${options.values.day} · ${options.values.meta}`,
        resolvedHtml: renderResolved(options),
        summaryHtml: renderSummary(options),
        fullReadingsHtml: renderFullReadings(options),
      });
    }

    return Object.freeze({ render });
  }

  const api = Object.freeze({ create });
  global.ReadingPlanView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
