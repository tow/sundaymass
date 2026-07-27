// Renders the public and editor music-plan rows from canonical song metadata.
(function (global) {
  "use strict";

  function create({
    escapeHtml,
    safeYoutubeUrl,
    copyrightComplete,
    publicAttribution,
    editorAttribution,
  }) {
    function choiceFor(songs, key) {
      const value = songs?.[key] || {};
      return {
        song: value.title || "",
        youtubeUrl: value.youtubeUrl || "",
        authors: value.authors || "",
        copyrightOwner: value.copyrightOwner || "",
        copyrightYear: value.copyrightYear || "",
        source: value.source || "",
      };
    }

    function musicLabel(part) {
      return escapeHtml(part.label)
        + (part.note
          ? `<span class="music-part-note">${escapeHtml(part.note)}</span>`
          : "");
    }

    function copyrightWarning(choice) {
      return choice.song && !copyrightComplete(choice)
        ? '<span class="music-attribution copyright-warning">Copyright information incomplete</span>'
        : "";
    }

    function practiceLink(choice) {
      const link = safeYoutubeUrl(choice.youtubeUrl);
      return link
        ? `<a class="listen-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">Listen / practise ↗</a>`
        : "";
    }

    function renderEditorRow(part, songs) {
      const song = songs?.[part.key];
      const choice = choiceFor(songs, part.key);
      const attribution = editorAttribution(choice);
      const selected = song
        ? '<div class="music-editor-choice">'
          + `<strong>${escapeHtml(song.title)}</strong>`
          + (attribution
            ? `<span class="music-attribution">${escapeHtml(attribution)}</span>`
            : "")
          + copyrightWarning(choice)
          + practiceLink(choice)
          + '</div><div class="music-editor-actions assigned">'
          + `<button type="button" data-song-action="choose" data-part="${escapeHtml(part.key)}">Change</button>`
          + "</div>"
        : '<div class="music-editor-actions empty">'
          + `<button class="primary choose-song" type="button" data-song-action="choose" data-part="${escapeHtml(part.key)}">Choose song</button>`
          + "</div>";

      return '<div class="music-edit-row">'
        + `<div class="music-part-label">${musicLabel(part)}</div>`
        + selected
        + "</div>";
    }

    function renderPublicRow(part, songs) {
      const choice = choiceFor(songs, part.key);
      const attribution = publicAttribution(choice);
      return '<div class="music-view-row">'
        + `<div class="music-part-label">${musicLabel(part)}</div>`
        + '<div class="music-choice">'
        + (choice.song
          ? escapeHtml(choice.song)
          : '<span class="music-empty">Not yet chosen</span>')
        + (attribution
          ? `<span class="music-attribution">${escapeHtml(attribution)}</span>`
          : "")
        + copyrightWarning(choice)
        + practiceLink(choice)
        + "</div></div>";
    }

    function render({ parts, songs, isEditor }) {
      return Object.freeze({
        html: parts
          .map(part => isEditor
            ? renderEditorRow(part, songs)
            : renderPublicRow(part, songs))
          .join(""),
        mode: isEditor ? "edit" : "view",
        intro: isEditor
          ? "Choose or add a song for each part."
          : "Selections for this Sunday appear here as they are chosen.",
        editorHelpHidden: !isEditor,
      });
    }

    return Object.freeze({ choiceFor, render });
  }

  const api = Object.freeze({ create });
  global.MusicPlanView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
