// Composes editor-only celebration selection and individual reading overrides.
(function (global) {
  "use strict";

  function create({
    elements,
    readingSlots,
    roleCitations,
    normalizedCitation,
    selectionPolicy,
    pickerView,
    editorView,
    getStore,
    isEditor,
    getDate,
    getCurrentSunday,
    getBaseCelebration,
    getCelebrationOverride,
    getReadingOverrides,
    getComputedCitation,
    getDisplayedCitation,
    getCandidates,
    onCelebrationSaved,
    onCelebrationRestored,
    onReadingOverrideChanged,
    onAllReadingsRestored,
    openModal,
    formatLong,
    escapeHtml,
    confirmAction,
    schedule = callback => setTimeout(callback, 0),
    logger = console,
  }) {
    let celebrationState = {
      open: false,
      query: "",
      selectedCelebration: null,
      results: { heading: "", candidates: [], html: "" },
      preview: { hidden: true, useDisabled: true, html: "" },
      saving: false,
    };
    let readingState = {
      open: false,
      slotKey: null,
      slotLabel: "",
      suggestions: [],
      citationOptions: [],
      input: "",
      selectedSuggestion: "",
      confirmed: false,
      pendingSelection: null,
      validation: {
        message: "",
        state: "",
        previewText: "",
        previewHidden: true,
        confirmHidden: true,
        buttonLabel: "Use reading",
        useDisabled: true,
      },
    };

    function setStatus(text, state) {
      elements.saveStatus.textContent = text || "";
      elements.saveStatus.dataset.state = state || "";
    }

    function renderEditor() {
      const readingOverrides = getReadingOverrides();
      const view = editorView.render({
        isEditor: isEditor(),
        celebration: getBaseCelebration(),
        celebrationOverride: getCelebrationOverride(),
        sunday: getCurrentSunday(),
        readingOverrides,
        readingSlots,
        citations: Object.fromEntries(readingSlots.map(slot => [
          slot.key,
          getDisplayedCitation(slot),
        ])),
      });
      elements.launch.hidden = view.launchHidden;
      if (!view.editorVisible) return;
      elements.celebrationCurrent.classList.toggle(
        "changed",
        view.celebrationChanged,
      );
      elements.celebrationCurrent.innerHTML = view.celebrationHtml;
      elements.restoreCelebration.hidden = view.restoreCelebrationHidden;
      elements.editorList.innerHTML = view.readingsHtml;
      elements.editorFooter.hidden = view.footerHidden;
    }

    function renderCelebrationPreview() {
      const view = celebrationState.preview;
      elements.celebrationPreview.innerHTML = view.html;
      elements.celebrationPreview.hidden = view.hidden;
      elements.celebrationUse.disabled = view.useDisabled || celebrationState.saving;
      elements.celebrationUse.textContent = celebrationState.saving
        ? "Saving…"
        : "Use this celebration";
    }

    function renderCelebrationResults() {
      const view = celebrationState.results;
      elements.celebrationResultsHeading.textContent = view.heading;
      elements.celebrationResults.innerHTML = view.html;
    }

    function renderReadingDialog() {
      elements.readingTitle.textContent = readingState.slotLabel;
      elements.readingSuggested.innerHTML = readingState.suggestions.map(option =>
        '<label class="suggested-reading">'
        + `<input type="radio" name="suggestedReading" value="${escapeHtml(option.citation)}" `
        + `data-default="${option.isDefault ? "true" : "false"}">`
        + `<span><strong>${escapeHtml(option.label)}</strong>`
        + `<small>${escapeHtml(option.note)}</small></span></label>`,
      ).join("");
      elements.citationOptions.innerHTML = readingState.citationOptions
        .map(citation => `<option value="${escapeHtml(citation)}"></option>`)
        .join("");
      elements.searchHelp.textContent = readingState.slotLabel
        ? `Only ${readingState.slotLabel.toLowerCase()} passages contained in this app’s lectionary data can be selected.`
        : "";
      elements.citationInput.value = readingState.input;
      elements.readingSuggested
        .querySelectorAll('input[name="suggestedReading"]')
        .forEach(input => {
          input.checked = normalizedCitation(input.value)
            === normalizedCitation(readingState.selectedSuggestion);
        });
      elements.confirm.checked = readingState.confirmed;
      elements.validation.textContent = readingState.validation.message;
      elements.validation.className = "reading-validation"
        + (readingState.validation.state ? ` ${readingState.validation.state}` : "");
      elements.textPreview.innerHTML = "<strong>Full text preview</strong>"
        + escapeHtml(readingState.validation.previewText);
      elements.textPreview.hidden = readingState.validation.previewHidden;
      elements.confirmWrap.hidden = readingState.validation.confirmHidden;
      elements.readingUse.textContent = readingState.validation.buttonLabel;
      elements.readingUse.disabled = readingState.validation.useDisabled;
    }

    const celebrationController = global.CelebrationController.create({
      getStore,
      isEditor,
      getDate,
      getCurrentSunday,
      getCandidates,
      pickerView,
      confirmRestore: confirmAction,
      onChange: state => {
        celebrationState = state;
        renderCelebrationResults();
        renderCelebrationPreview();
        if (!state.open && elements.celebrationDialog.open) {
          elements.celebrationDialog.close();
        }
      },
      onStatus: setStatus,
      onSaved: onCelebrationSaved,
      onRestored: onCelebrationRestored,
      logger,
    });
    const overrideController = global.ReadingOverrideController.create({
      getStore,
      isEditor,
      getDate,
      confirmAll: confirmAction,
      onStatus: setStatus,
      onOverrideChanged: onReadingOverrideChanged,
      onAllRestored: onAllReadingsRestored,
      logger,
    });
    const dialogController = global.ReadingDialogController.create({
      readingSlots,
      roleCitations,
      selectionPolicy,
      normalizedCitation,
      isEditor,
      getComputedCitation,
      getExistingCitation: slot => getReadingOverrides()[slot.key]?.citation || "",
      onChange: state => {
        readingState = state;
        renderReadingDialog();
        if (!state.open && elements.readingDialog.open) {
          elements.readingDialog.close();
        }
      },
    });

    function openCelebrationDialog() {
      if (!celebrationController.open()) return;
      elements.celebrationSearch.value = "";
      elements.celebrationContext.textContent = `For the Mass on ${formatLong(getDate())}`;
      openModal(elements.celebrationDialog);
      schedule(() => elements.celebrationSearch.focus());
    }

    function openReadingDialog(key) {
      if (!dialogController.open(key)) return;
      elements.readingContext.textContent = `${getBaseCelebration().name} · ${formatLong(getDate())}`;
      openModal(elements.readingDialog);
      schedule(() => elements.citationInput.focus());
    }

    function closeLiturgicalDialog() {
      if (elements.liturgicalDialog.open) elements.liturgicalDialog.close();
    }

    function closeCelebrationDialog() {
      celebrationController.close();
    }

    function closeReadingDialog() {
      dialogController.close();
    }

    function closeAll() {
      closeLiturgicalDialog();
      closeCelebrationDialog();
      closeReadingDialog();
    }

    function start() {
      elements.launchButton.addEventListener("click", () => {
        if (!isEditor()) return;
        renderEditor();
        openModal(elements.liturgicalDialog);
      });
      elements.liturgicalClose.addEventListener("click", closeLiturgicalDialog);
      elements.liturgicalDialog.addEventListener("click", event => {
        if (event.target === elements.liturgicalDialog) closeLiturgicalDialog();
      });
      elements.chooseCelebration.addEventListener("click", openCelebrationDialog);
      elements.celebrationSearch.addEventListener("input", () => {
        celebrationController.search(elements.celebrationSearch.value);
      });
      elements.celebrationResults.addEventListener("click", event => {
        const button = event.target.closest("button[data-celebration-index]");
        if (!button) return;
        celebrationController.select(button.dataset.celebrationIndex);
        elements.celebrationPreview.scrollIntoView({ block: "nearest" });
      });
      elements.celebrationPreview.addEventListener("change", event => {
        const select = event.target.closest("select[data-celebration-reading]");
        if (select) {
          celebrationController.setReading(
            select.dataset.celebrationReading,
            select.value,
          );
        }
      });
      elements.celebrationClose.addEventListener("click", closeCelebrationDialog);
      elements.celebrationCancel.addEventListener("click", closeCelebrationDialog);
      elements.celebrationDialog.addEventListener("click", event => {
        if (event.target === elements.celebrationDialog) closeCelebrationDialog();
      });
      elements.celebrationForm.addEventListener("submit", async event => {
        event.preventDefault();
        await celebrationController.save();
      });
      elements.restoreCelebration.addEventListener("click", async () => {
        await celebrationController.restore();
      });
      elements.editorList.addEventListener("click", event => {
        const button = event.target.closest("button[data-reading-action]");
        if (!button || !isEditor()) return;
        if (button.dataset.readingAction === "change") {
          openReadingDialog(button.dataset.readingSlot);
        }
        if (button.dataset.readingAction === "restore") {
          overrideController.restore(button.dataset.readingSlot);
        }
      });
      elements.restoreAll.addEventListener("click", async () => {
        await overrideController.restoreAll();
      });
      elements.readingSuggested.addEventListener("change", event => {
        const input = event.target.closest('input[name="suggestedReading"]');
        if (input) dialogController.chooseSuggestion(input.value);
      });
      elements.citationInput.addEventListener("input", () => {
        dialogController.setInput(elements.citationInput.value);
      });
      elements.confirm.addEventListener("change", () => {
        dialogController.setConfirmed(elements.confirm.checked);
      });
      elements.readingClose.addEventListener("click", closeReadingDialog);
      elements.readingCancel.addEventListener("click", closeReadingDialog);
      elements.readingDialog.addEventListener("click", event => {
        if (event.target === elements.readingDialog) closeReadingDialog();
      });
      elements.readingForm.addEventListener("submit", async event => {
        event.preventDefault();
        const selection = readingState.pendingSelection;
        if (!selection || !isEditor() || !getStore() || elements.readingUse.disabled) {
          return;
        }
        elements.readingUse.disabled = true;
        elements.readingUse.textContent = "Saving…";
        const saved = await overrideController.save(
          selection,
          readingState.confirmed,
        );
        if (saved) {
          closeReadingDialog();
          return;
        }
        elements.validation.textContent = "The reading could not be saved. Please try again.";
        elements.validation.className = "reading-validation error";
        elements.readingUse.textContent = selection.isDefault
          ? "Use computed reading"
          : "Use reading";
        elements.readingUse.disabled = false;
      });
    }

    return Object.freeze({ closeAll, renderEditor, start });
  }

  const api = Object.freeze({ create });
  global.ReadingWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
