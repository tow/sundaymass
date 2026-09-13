// Lets an editor name the Mass planned for a date ("Filipino Mass"), shown above its
// readings and used as the title of its lyric exports.
(function (global) {
  "use strict";

  // Matches plans_occasion_label_shape in the database.
  const MAX_LENGTH = 80;

  function create({
    elements,
    getStore,
    isEditor,
    isOnline,
    getDate,
    getLabel,
    formatDate,
    openModal,
    onSaved,
    onStatus,
    logger,
  }) {
    let editingDate = "";

    function render() {
      elements.launch.hidden = !isEditor();
      elements.launchButton.textContent = getLabel() ? "Rename this Mass" : "Name this Mass";
    }

    function close() {
      if (elements.dialog.open) elements.dialog.close();
    }

    function open() {
      if (!isEditor()) return;
      editingDate = getDate();
      elements.input.value = getLabel();
      elements.error.textContent = "";
      elements.clear.hidden = !getLabel();
      elements.context.textContent =
        `Shown above the readings for ${formatDate(editingDate)}, for example “Filipino Mass”.`;
      openModal(elements.dialog);
    }

    async function save(label) {
      elements.error.textContent = "";
      if (!isOnline()) {
        elements.error.textContent = "Naming a Mass requires an internet connection.";
        return;
      }
      const value = label.trim();
      if (value.length > MAX_LENGTH) {
        elements.error.textContent = `Keep the name to ${MAX_LENGTH} characters or fewer.`;
        return;
      }
      const date = editingDate;
      elements.save.disabled = true;
      elements.clear.disabled = true;
      try {
        await getStore().saveOccasionLabel(date, value);
        close();
        if (date === getDate()) {
          onSaved(value);
          onStatus(value ? "Name saved" : "Name removed", "saved");
        } else {
          onStatus("Saved for the previously selected date", "saved");
        }
      } catch (error) {
        logger.error("Could not save the Mass name", error);
        elements.error.textContent = error.message || "Could not save the name.";
      } finally {
        elements.save.disabled = false;
        elements.clear.disabled = false;
      }
    }

    function start() {
      elements.launchButton.addEventListener("click", open);
      elements.form.addEventListener("submit", event => {
        event?.preventDefault?.();
        return save(elements.input.value);
      });
      elements.clear.addEventListener("click", () => save(""));
      elements.close.addEventListener("click", close);
      elements.cancel.addEventListener("click", close);
    }

    return Object.freeze({ start, render, open, close, save });
  }

  const api = Object.freeze({ create, MAX_LENGTH });
  global.OccasionLabelController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
