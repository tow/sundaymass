// Owns reading-dialog slot, validation, suggestion, and confirmation state.
(function (global) {
  "use strict";

  function create({
    readingSlots,
    roleCitations,
    selectionPolicy,
    normalizedCitation,
    isEditor,
    getComputedCitation,
    getExistingCitation,
    onChange,
  }) {
    const slots = new Map(readingSlots.map(slot => [slot.key, slot]));
    let value = initialState();

    function initialValidation() {
      return {
        message: "",
        state: "",
        previewText: "",
        previewHidden: true,
        confirmHidden: true,
        buttonLabel: "Use reading",
        useDisabled: true,
      };
    }

    function initialState() {
      return {
        open: false,
        slotKey: null,
        slotLabel: "",
        suggestions: [],
        citationOptions: [],
        input: "",
        selectedSuggestion: "",
        confirmed: false,
        pendingSelection: null,
        validation: initialValidation(),
      };
    }

    function snapshot() {
      return Object.freeze({
        ...value,
        suggestions: Object.freeze(value.suggestions.map(option =>
          Object.freeze({ ...option }),
        )),
        citationOptions: Object.freeze(value.citationOptions.slice()),
        pendingSelection: value.pendingSelection
          ? Object.freeze({ ...value.pendingSelection })
          : null,
        validation: Object.freeze({ ...value.validation }),
      });
    }

    function emit() {
      onChange(snapshot());
    }

    function state() {
      return snapshot();
    }

    function updateSelectedSuggestion() {
      const normalized = normalizedCitation(value.input);
      const selected = value.suggestions.find(option =>
        normalizedCitation(option.citation) === normalized,
      );
      value.selectedSuggestion = selected?.citation || "";
    }

    function validate() {
      const slot = slots.get(value.slotKey);
      if (!slot) return;
      const result = selectionPolicy.validate({
        slotKey: slot.key,
        raw: value.input,
        computed: getComputedCitation(slot),
      });
      if (!result.valid) {
        value.pendingSelection = null;
        value.validation = {
          ...initialValidation(),
          message: result.message,
          state: result.state || "",
        };
        updateSelectedSuggestion();
        emit();
        return;
      }

      value.input = result.canonicalCitation;
      value.pendingSelection = result.selection;
      value.validation = {
        message: result.message,
        state: result.state || "",
        previewText: result.previewText,
        previewHidden: false,
        confirmHidden: !result.requiresConfirmation,
        buttonLabel: result.buttonLabel,
        useDisabled: Boolean(result.requiresConfirmation && !value.confirmed),
      };
      updateSelectedSuggestion();
      emit();
    }

    function open(slotKey) {
      const slot = slots.get(slotKey);
      if (!slot || !isEditor()) return false;
      const computed = getComputedCitation(slot);
      const suggestions = selectionPolicy.suggestions(computed);
      value = {
        ...initialState(),
        open: true,
        slotKey: slot.key,
        slotLabel: slot.label,
        suggestions,
        citationOptions: Array.from(roleCitations[slot.key].values())
          .sort((left, right) => left.localeCompare(right)),
        input: getExistingCitation(slot)
          || suggestions[0]?.citation
          || computed,
      };
      validate();
      return true;
    }

    function setInput(input) {
      if (!value.open) return false;
      value.input = String(input || "");
      value.confirmed = false;
      validate();
      return true;
    }

    function chooseSuggestion(citation) {
      return setInput(citation);
    }

    function setConfirmed(confirmed) {
      if (!value.open) return false;
      value.confirmed = Boolean(confirmed);
      validate();
      return true;
    }

    function close() {
      value = initialState();
      emit();
    }

    return Object.freeze({
      chooseSuggestion,
      close,
      open,
      setConfirmed,
      setInput,
      state,
    });
  }

  const api = Object.freeze({ create });
  global.ReadingDialogController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
