// Editor-only Sunday lyric editor. Reuse copies an earlier edit; it never links weeks.
(function (global) {
  "use strict";

  function create({
    elements,
    parts,
    weeklyLyrics,
    getStore,
    getSongs,
    getDate,
    isEditor,
    isOnline,
    openModal,
    onStatus,
    onSummaryChanged,
    formatDate,
    schedule = callback => setTimeout(callback, 0),
    logger = console,
  }) {
    let partKey = "";
    let song = null;
    let canonical = "";
    let current = null;
    let previous = null;
    let psalmSections = [];
    let customizedParts = new Set();
    let openedSunday = "";
    let openGeneration = 0;
    let summaryGeneration = 0;

    const partFor = key => parts.find(part => part.key === key);

    function requireAccess() {
      if (!isEditor()) throw new Error("Editor access required");
      if (!isOnline()) throw new Error("Editing requires an internet connection");
      const store = getStore();
      if (!store) throw new Error("Still connecting. Try again in a moment.");
      return store;
    }

    function requireCurrentSession() {
      const store = requireAccess();
      if (!openedSunday || !song || getDate() !== openedSunday) {
        throw new Error("The selected Sunday changed. Close and reopen weekly lyrics.");
      }
      if (getSongs()[partKey]?.id !== song.id) {
        throw new Error("The assigned song changed. Close and reopen weekly lyrics.");
      }
      return store;
    }

    function setError(message = "") {
      elements.error.textContent = message;
    }

    function renderPrevious() {
      elements.previous.hidden = !previous?.lyrics;
      elements.previousButton.textContent = previous?.lyrics
        ? `Reuse edit from ${formatDate(previous.sunday)}`
        : "Reuse most recent edit";
      elements.previousMeta.textContent = previous?.lyrics
        ? `${partFor(previous.part)?.label || previous.part} · copied only when you choose it`
        : "";
    }

    function renderPsalm(value) {
      const editedIds = weeklyLyrics.includedPsalmIds(value);
      psalmSections = weeklyLyrics.psalmSections(canonical).map(section => ({
        ...section,
        included: section.role === "all" || editedIds.has(section.id),
        text: weeklyLyrics.psalmSections(value)
          .find(edited => edited.id === section.id)?.text || section.text,
      }));
      elements.psalmSections.innerHTML = psalmSections.map((section, index) =>
        `<section class="weekly-psalm-section${section.included === false ? " omitted" : ""}" data-weekly-section="${index}">`
        + '<div class="weekly-psalm-section-head">'
        + `<strong data-weekly-role="${index}">${section.role === "all" ? "ALL" : section.included ? "CANTOR" : "OMITTED"} · ${section.label}</strong>`
        + (section.role === "cantor"
          ? `<label><input type="checkbox" data-weekly-include="${index}"${section.included ? " checked" : ""}> Sing this verse</label>`
          : "")
        + "</div>"
        + `<textarea data-weekly-text="${index}" rows="${section.role === "all" ? 3 : 5}"></textarea>`
        + "</section>"
      ).join("");
      psalmSections.forEach((section, index) => {
        const textarea = elements.psalmSections.querySelector(`[data-weekly-text="${index}"]`);
        textarea.value = section.text;
        textarea.disabled = section.included === false;
      });
      elements.psalmEditor.hidden = false;
      elements.textEditor.hidden = true;
    }

    function renderEditor(value) {
      const isPsalm = partKey === "psalm" && weeklyLyrics.isStructuredPsalm(canonical);
      elements.psalmFallback.hidden = partKey !== "psalm" || isPsalm;
      if (isPsalm) {
        renderPsalm(value);
      } else {
        elements.textarea.value = value;
        elements.psalmEditor.hidden = true;
        elements.textEditor.hidden = false;
      }
    }

    function editedValue() {
      if (elements.psalmEditor.hidden) return weeklyLyrics.normalize(elements.textarea.value);
      return weeklyLyrics.serializePsalmSections(psalmSections.map((section, index) => ({
        ...section,
        included: section.role === "all"
          || elements.psalmSections.querySelector(`[data-weekly-include="${index}"]`)?.checked,
        text: elements.psalmSections.querySelector(`[data-weekly-text="${index}"]`)?.value || "",
      })));
    }

    async function refreshSummary() {
      const generation = ++summaryGeneration;
      const sunday = getDate();
      if (!isEditor() || !getStore()?.getWeeklyLyricsParts) {
        customizedParts = new Set();
        onSummaryChanged(customizedParts);
        return;
      }
      try {
        const partsForSunday = await getStore().getWeeklyLyricsParts(sunday);
        if (generation !== summaryGeneration || !isEditor() || getDate() !== sunday) return;
        customizedParts = new Set(partsForSunday);
      } catch (error) {
        if (generation !== summaryGeneration || getDate() !== sunday) return;
        logger.warn("Could not load weekly lyric summary", error);
        customizedParts = new Set();
      }
      onSummaryChanged(customizedParts);
    }

    async function open(part) {
      const generation = ++openGeneration;
      try {
        const store = requireAccess();
        const sunday = getDate();
        const selected = getSongs()[part];
        if (!selected?.id) return;
        const loadedSong = await store.getSong(selected.id);
        const loadedCanonical = weeklyLyrics.normalize(loadedSong.lyrics);
        if (!loadedCanonical) {
          throw new Error(`Add canonical lyrics for ${loadedSong.title} first.`);
        }
        const context = await store.getWeeklyLyricsContext(
          sunday,
          part,
          loadedSong.id,
        );
        if (generation !== openGeneration
          || getDate() !== sunday
          || getSongs()[part]?.id !== loadedSong.id) return;
        partKey = part;
        song = loadedSong;
        canonical = loadedCanonical;
        openedSunday = sunday;
        current = context.current || null;
        previous = context.previous || null;
        elements.eyebrow.textContent = partFor(part)?.label || "Weekly lyrics";
        elements.title.textContent = song.title;
        elements.context.textContent = `Lyrics for ${formatDate(sunday)}. Canonical lyrics are unchanged.`;
        elements.customNotice.hidden = !current;
        renderPrevious();
        renderEditor(current?.lyrics || canonical);
        setError();
        openModal(elements.dialog);
        schedule(() => {
          if (generation !== openGeneration) return;
          const target = elements.psalmEditor.hidden
            ? elements.textarea
            : elements.psalmSections.querySelector("textarea");
          target?.focus();
        });
      } catch (error) {
        if (generation !== openGeneration) return;
        logger.error(error);
        onStatus(error.message || "Could not load weekly lyrics.", "error");
      }
    }

    async function save(event) {
      event.preventDefault();
      elements.save.disabled = true;
      setError();
      try {
        const lyrics = editedValue();
        if (!lyrics) throw new Error("Keep at least one lyric section.");
        await requireCurrentSession().saveWeeklyLyrics(
          openedSunday,
          partKey,
          song.id,
          lyrics,
        );
        customizedParts.add(partKey);
        onSummaryChanged(customizedParts);
        onStatus("Weekly lyrics saved", "saved");
        close();
      } catch (error) {
        logger.error(error);
        setError(error.message || "Could not save weekly lyrics.");
      } finally {
        elements.save.disabled = false;
      }
    }

    async function reset() {
      elements.reset.disabled = true;
      setError();
      try {
        await requireCurrentSession().clearWeeklyLyrics(
          openedSunday,
          partKey,
          song.id,
        );
        customizedParts.delete(partKey);
        onSummaryChanged(customizedParts);
        onStatus("Using canonical lyrics", "saved");
        close();
      } catch (error) {
        logger.error(error);
        setError(error.message || "Could not reset weekly lyrics.");
      } finally {
        elements.reset.disabled = false;
      }
    }

    function close() {
      openGeneration += 1;
      openedSunday = "";
      if (elements.dialog.open) elements.dialog.close();
    }

    function start() {
      elements.musicList.addEventListener("click", event => {
        const button = event.target.closest('[data-song-action="lyrics"]');
        if (button && isEditor()) open(button.dataset.part);
      });
      elements.form.addEventListener("submit", save);
      elements.close.addEventListener("click", close);
      elements.cancel.addEventListener("click", close);
      elements.reset.addEventListener("click", reset);
      elements.previousButton.addEventListener("click", () => {
        if (!previous?.lyrics) return;
        renderEditor(previous.lyrics);
        elements.customNotice.hidden = false;
      });
      elements.psalmSections.addEventListener("change", event => {
        const index = event.target.dataset.weeklyInclude;
        if (index === undefined) return;
        const textarea = elements.psalmSections.querySelector(`[data-weekly-text="${index}"]`);
        if (textarea) textarea.disabled = !event.target.checked;
        const section = elements.psalmSections.querySelector(`[data-weekly-section="${index}"]`);
        section?.classList.toggle("omitted", !event.target.checked);
        const role = elements.psalmSections.querySelector(`[data-weekly-role="${index}"]`);
        if (role) role.textContent = `${event.target.checked ? "CANTOR" : "OMITTED"} · ${psalmSections[index].label}`;
      });
      elements.dialog.addEventListener("click", event => {
        if (event.target === elements.dialog) close();
      });
    }

    return Object.freeze({ close, open, refreshSummary, start });
  }

  const api = Object.freeze({ create });
  global.WeeklyLyricsController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
