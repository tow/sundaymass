// Owns persistence for individual reading overrides and their restoration.
(function (global) {
  "use strict";

  function create({
    getStore,
    isEditor,
    getDate,
    confirmAll,
    onStatus,
    onOverrideChanged,
    onAllRestored,
    logger = console,
  }) {
    let saving = false;

    function available() {
      return Boolean(isEditor() && getStore() && !saving);
    }

    async function run(work, onSuccess) {
      if (!available()) return false;
      saving = true;
      onStatus("Saving…", "");
      try {
        await work(getStore());
        onSuccess();
        onStatus("Saved", "saved");
        return true;
      } catch (error) {
        logger.error(error);
        onStatus("Save failed", "error");
        return false;
      } finally {
        saving = false;
      }
    }

    function overrideFor(selection, confirmed) {
      return Object.freeze({
        citation: selection.citation,
        book: selection.book,
        segments: Object.freeze(
          (selection.segments || []).map(segment => Object.freeze({ ...segment })),
        ),
        origin: selection.origin,
        translation: selection.translation,
        textVersion: selection.textVersion,
        checkedAgainstOrdo: selection.requiresConfirmation ? Boolean(confirmed) : true,
      });
    }

    async function save(selection, confirmed) {
      if (!selection?.slot) return false;
      if (selection.requiresConfirmation && !confirmed) return false;
      if (selection.isDefault) {
        return run(
          store => store.clearReadingOverride(getDate(), selection.slot),
          () => onOverrideChanged(selection.slot, null),
        );
      }
      const value = overrideFor(selection, confirmed);
      return run(
        store => store.saveReadingOverride(getDate(), selection.slot, value),
        () => onOverrideChanged(selection.slot, value),
      );
    }

    async function restore(slot) {
      if (!slot) return false;
      return run(
        store => store.clearReadingOverride(getDate(), slot),
        () => onOverrideChanged(slot, null),
      );
    }

    async function restoreAll() {
      if (!available()) return false;
      if (!confirmAll(
        "Restore all individual readings to the selected celebration?",
      )) return false;
      return run(
        store => store.clearReadingOverride(getDate(), null),
        onAllRestored,
      );
    }

    return Object.freeze({ restore, restoreAll, save });
  }

  const api = Object.freeze({ create });
  global.ReadingOverrideController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
