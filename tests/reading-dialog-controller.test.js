const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingDialogController = require("../src/app/reading-dialog-controller.js");

function harness() {
  let editor = true;
  const states = [];
  const slots = [
    { key: "first", label: "First Reading" },
    { key: "gospel", label: "Gospel" },
  ];
  const policy = {
    suggestions(computed) {
      return [
        { citation: computed, label: computed, note: "Computed", isDefault: true },
        { citation: "Isaiah 55:1-3", label: "Isaiah 55:1-3", note: "Alternative", isDefault: false },
      ];
    },
    validate({ slotKey, raw, computed }) {
      if (raw === "bad") {
        return { valid: false, message: "Invalid passage", state: "error" };
      }
      const citation = raw === "acts" ? "Acts 4:32-35" : raw;
      const requiresConfirmation = citation === "Acts 4:32-35";
      return {
        valid: true,
        message: requiresConfirmation ? "Confirm this selection" : "Valid reading",
        state: "valid",
        previewText: `Text for ${citation}`,
        canonicalCitation: citation,
        requiresConfirmation,
        buttonLabel: citation === computed ? "Use computed reading" : "Use reading",
        selection: {
          slot: slotKey,
          citation,
          isDefault: citation === computed,
          requiresConfirmation,
        },
      };
    },
  };
  const controller = ReadingDialogController.create({
    readingSlots: slots,
    roleCitations: {
      first: new Map([
        ["acts", "Acts 4:32-35"],
        ["isaiah", "Isaiah 55:1-3"],
      ]),
      gospel: new Map([["john", "John 6:1-15"]]),
    },
    selectionPolicy: policy,
    normalizedCitation: value => String(value || "").toLowerCase().replace(/\s/g, ""),
    isEditor: () => editor,
    getComputedCitation: slot => slot.key === "first" ? "Genesis 18:20-32" : "Luke 11:1-13",
    getExistingCitation: slot => slot.key === "first" ? "Isaiah 55:1-3" : "",
    onChange: state => states.push(state),
  });
  return {
    controller,
    states,
    setEditor(value) { editor = value; },
  };
}

test("opening owns slot options, existing value, and initial validation", () => {
  const state = harness();

  assert.equal(state.controller.open("first"), true);
  const value = state.controller.state();

  assert.equal(value.open, true);
  assert.equal(value.slotKey, "first");
  assert.equal(value.slotLabel, "First Reading");
  assert.equal(value.input, "Isaiah 55:1-3");
  assert.equal(value.selectedSuggestion, "Isaiah 55:1-3");
  assert.deepEqual(value.citationOptions, ["Acts 4:32-35", "Isaiah 55:1-3"]);
  assert.equal(value.validation.previewText, "Text for Isaiah 55:1-3");
  assert.equal(value.validation.useDisabled, false);
  assert.equal(value.pendingSelection.citation, "Isaiah 55:1-3");
});

test("unknown slots and non-editors cannot open the dialog", () => {
  const state = harness();
  state.setEditor(false);
  assert.equal(state.controller.open("first"), false);
  assert.equal(state.states.length, 0);

  state.setEditor(true);
  assert.equal(state.controller.open("unknown"), false);
  assert.equal(state.states.length, 0);
});

test("invalid input clears the pending selection but preserves the typed value", () => {
  const state = harness();
  state.controller.open("first");

  state.controller.setInput("bad");
  const value = state.controller.state();

  assert.equal(value.input, "bad");
  assert.equal(value.pendingSelection, null);
  assert.equal(value.validation.message, "Invalid passage");
  assert.equal(value.validation.previewHidden, true);
  assert.equal(value.validation.useDisabled, true);
});

test("non-standard input remains gated until explicit confirmation", () => {
  const state = harness();
  state.controller.open("first");

  state.controller.setInput("acts");
  let value = state.controller.state();
  assert.equal(value.input, "Acts 4:32-35");
  assert.equal(value.confirmed, false);
  assert.equal(value.validation.confirmHidden, false);
  assert.equal(value.validation.useDisabled, true);

  state.controller.setConfirmed(true);
  value = state.controller.state();
  assert.equal(value.confirmed, true);
  assert.equal(value.validation.useDisabled, false);
});

test("choosing a suggested reading resets prior confirmation", () => {
  const state = harness();
  state.controller.open("first");
  state.controller.setInput("acts");
  state.controller.setConfirmed(true);

  state.controller.chooseSuggestion("Genesis 18:20-32");
  const value = state.controller.state();

  assert.equal(value.input, "Genesis 18:20-32");
  assert.equal(value.confirmed, false);
  assert.equal(value.selectedSuggestion, "Genesis 18:20-32");
  assert.equal(value.validation.buttonLabel, "Use computed reading");
});

test("closing clears dialog-specific state", () => {
  const state = harness();
  state.controller.open("first");

  state.controller.close();

  assert.deepEqual(state.controller.state(), {
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
  });
});
