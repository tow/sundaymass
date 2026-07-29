// Builds the print-only Mass sheet and coordinates the browser print lifecycle.
(function (global) {
  "use strict";

  const MODES = new Set(["music", "music-readings"]);
  const escapeHtml = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  function renderSheet({
    mode,
    celebration,
    meta,
    musicParts,
    readings,
    choiceFor,
    attributionLine,
    copyrightComplete,
  }) {
    if (!MODES.has(mode)) throw new Error(`Unknown print mode: ${mode}`);

    const readingSummary = readings.map(reading =>
      `<div class="print-reading-summary-row">`
      + `<strong>${escapeHtml(reading.label)}</strong>`
      + `<span>${escapeHtml(reading.citation || "—")}</span>`
      + `</div>`,
    ).join("");
    const musicRows = musicParts.map(part => {
      const choice = choiceFor(part.key) || {};
      const attribution = attributionLine(choice);
      const warning = choice.song && !copyrightComplete(choice)
        ? `${attribution ? " · " : ""}Copyright information incomplete`
        : "";
      return `<div class="print-music-row">`
        + `<div class="print-music-label">${escapeHtml(part.label)}`
        + `${part.note ? `<small>${escapeHtml(part.note)}</small>` : ""}</div>`
        + `<div class="print-music-choice">`
        + `<strong>${escapeHtml(choice.song || "Not yet chosen")}</strong>`
        + `${attribution || warning
          ? `<small>${escapeHtml(attribution + warning)}</small>`
          : ""}</div>`
        + `</div>`;
    }).join("");

    const fullReadings = mode === "music-readings"
      ? `<section class="print-reading-pages">`
        + `<header><div>St James the Apostle — 6pm Mass</div>`
        + `<h2>Mass readings</h2><p>${escapeHtml(celebration)} · ${escapeHtml(meta)}</p></header>`
        + readings.map(reading => {
          const fallback = reading.key === "psalm"
            ? "(sung — see citation above)"
            : reading.key === "second" ? "—" : "(see citation above)";
          return `<article class="print-reading-block">`
            + `<h3>${escapeHtml(reading.label)} <span>${escapeHtml(reading.citation || "—")}</span></h3>`
            + `<p>${escapeHtml(reading.text || fallback)}</p>`
            + `</article>`;
        }).join("")
        + `<p class="print-scripture-note">Scripture: World English Bible (public domain). `
        + `Verse numbering—especially in the Psalms—can differ slightly from the lectionary. `
        + `Confirm the proclaimed text against the parish Ordo.</p></section>`
      : "";

    return `<section class="print-plan-page">`
      + `<header class="print-plan-header"><div>St James the Apostle — 6pm Mass</div>`
      + `<span>Music planning sheet</span><h1>${escapeHtml(celebration)}</h1>`
      + `<p>${escapeHtml(meta)}</p></header>`
      + `<section class="print-reading-summary"><h2>Readings for this Mass</h2>`
      + readingSummary + `</section>`
      + `<section class="print-music-plan"><h2>Sung parts of the Mass</h2>`
      + musicRows + `</section>`
      + `<section class="print-notes"><strong>Notes</strong><div></div></section>`
      + `<footer>© 2026 Datamediate Oy · Independent planning aid</footer>`
      + `</section>${fullReadings}`;
  }

  function create({ window, root, render }) {
    let started = false;
    let preparedMode = null;

    function prepare(mode) {
      if (!MODES.has(mode)) throw new Error(`Unknown print mode: ${mode}`);
      if (preparedMode !== mode) {
        root.innerHTML = render(mode);
        preparedMode = mode;
      }
      root.setAttribute("aria-hidden", "false");
    }

    function onBeforePrint() {
      prepare(preparedMode || "music");
    }

    function onAfterPrint() {
      root.setAttribute("aria-hidden", "true");
      preparedMode = null;
    }

    function print(mode) {
      prepare(mode);
      window.print();
    }

    function start() {
      if (started) return;
      window.addEventListener("beforeprint", onBeforePrint);
      window.addEventListener("afterprint", onAfterPrint);
      started = true;
    }

    function stop() {
      if (!started) return;
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      started = false;
    }

    return Object.freeze({ print, start, stop });
  }

  const api = Object.freeze({ create, renderSheet });
  global.PrintController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
