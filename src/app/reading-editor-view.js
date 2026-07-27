// Pure presentation for the editor-only celebration and reading summary.
(function (global) {
  "use strict";

  function create({ escapeHtml, formatLong, cycleName }) {
    function empty() {
      return {
        launchHidden: true,
        editorVisible: false,
        celebrationChanged: false,
        celebrationHtml: "",
        restoreCelebrationHidden: true,
        readingsHtml: "",
        footerHidden: true,
      };
    }

    function render({
      isEditor,
      celebration,
      celebrationOverride,
      sunday,
      readingOverrides,
      readingSlots,
      citations,
    }) {
      if (!isEditor) return Object.freeze(empty());
      const celebrationChanged = Boolean(celebrationOverride);
      const celebrationMeta = celebrationChanged
        ? `${celebration.rank || "Celebration"} · normally ${formatLong(celebration.sourceDate)}`
        : `${formatLong(sunday.d)} · ${sunday.s} · ${cycleName(sunday.c)}`;
      const changedSlots = readingSlots.filter(slot => readingOverrides[slot.key]);
      const readingsHtml = readingSlots.map(slot => {
        const adjusted = Boolean(readingOverrides[slot.key]);
        const badge = adjusted
          ? "Changed"
          : (celebrationChanged ? "Selected Mass" : "Computed");
        return '<div class="reading-editor-row"><div><div class="reading-editor-label">'
          + escapeHtml(slot.label)
          + `<span class="reading-status-badge${adjusted ? " changed" : ""}">${badge}</span></div>`
          + `<div class="reading-editor-cite">${escapeHtml(citations[slot.key]) || "—"}</div></div>`
          + '<div class="reading-editor-actions">'
          + `<button type="button" data-reading-action="change" data-reading-slot="${slot.key}">Change</button>`
          + (adjusted
            ? `<button type="button" data-reading-action="restore" data-reading-slot="${slot.key}">Restore</button>`
            : "")
          + "</div></div>";
      }).join("");

      return Object.freeze({
        launchHidden: false,
        editorVisible: true,
        celebrationChanged,
        celebrationHtml: '<div class="celebration-current-label">Celebration for this Mass'
          + `<span class="reading-status-badge${celebrationChanged ? " changed" : ""}">`
          + `${celebrationChanged ? "Changed" : "Computed"}</span></div>`
          + `<div class="celebration-current-name">${escapeHtml(celebration.name)}</div>`
          + `<div class="celebration-current-meta">${escapeHtml(celebrationMeta)}</div>`,
        restoreCelebrationHidden: !celebrationChanged,
        readingsHtml,
        footerHidden: changedSlots.length === 0,
      });
    }

    return Object.freeze({ render });
  }

  const api = Object.freeze({ create });
  global.ReadingEditorView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
