const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingSelection = require("../src/domain/reading-selection.js");

const normalize = value => String(value || "")
  .replace(/[–—]/g, "-")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const slots = [
  { key: "first", label: "First Reading" },
  { key: "psalm", label: "Responsorial Psalm" },
  { key: "second", label: "Second Reading" },
  { key: "gospel", label: "Gospel" },
];

const roleCitations = {
  first: new Map([
    [normalize("Genesis 1:1-5"), "Genesis 1:1-5"],
    [normalize("Genesis 1:1-3"), "Genesis 1:1-3"],
    [normalize("Acts 4:32-35"), "Acts 4:32-35"],
  ]),
  psalm: new Map([[normalize("Psalm 23:1-3"), "Psalm 23:1-3"]]),
  second: new Map([[normalize("Romans 8:31-39"), "Romans 8:31-39"]]),
  gospel: new Map([[normalize("Matthew 20:20-28"), "Matthew 20:20-28"]]),
};

const citationRoles = {
  [normalize("Genesis 1:1-5")]: ["first"],
  [normalize("Genesis 1:1-3")]: ["first"],
  [normalize("Acts 4:32-35")]: ["first"],
  [normalize("Psalm 23:1-3")]: ["psalm"],
  [normalize("Romans 8:31-39")]: ["second"],
  [normalize("Matthew 20:20-28")]: ["gospel"],
};

const readings = {
  "Genesis 1:1-5": "Genesis long text",
  "Genesis 1:1-3": "Genesis short text",
  "Acts 4:32-35": "Acts text",
  "Psalm 23:1-3": "Psalm text",
  "Romans 8:31-39": "Romans text",
  "Matthew 20:20-28": "Gospel text",
};

const selection = ReadingSelection.create({
  readingSlots: slots,
  roleCitations,
  citationRoles,
  readings,
  normalizedCitation: normalize,
  citationAlternatives(value) {
    if (value === "Genesis 1:1-5 or 1:1-3") {
      return ["Genesis 1:1-5", "Genesis 1:1-3"];
    }
    return value ? [value] : [];
  },
  parseReadingCitation(citation) {
    const match = citation.match(/^(.+?)\s+(\d+):(.+)$/);
    return match
      ? { book: match[1], segments: [{ chapter: Number(match[2]), verses: match[3] }] }
      : null;
  },
});

test("suggestions distinguish a computed reading from long and short options", () => {
  assert.deepEqual(selection.suggestions("Genesis 1:1-5"), [{
    citation: "Genesis 1:1-5",
    label: "Genesis 1:1-5",
    note: "Computed for this celebration",
    isDefault: true,
  }]);
  assert.deepEqual(selection.suggestions("Genesis 1:1-5 or 1:1-3"), [
    {
      citation: "Genesis 1:1-5",
      label: "Genesis 1:1-5",
      note: "Longer form",
      isDefault: false,
    },
    {
      citation: "Genesis 1:1-3",
      label: "Genesis 1:1-3",
      note: "Shorter or alternative form",
      isDefault: false,
    },
  ]);
});

test("empty input and unknown citations are rejected with slot-specific guidance", () => {
  assert.deepEqual(
    selection.validate({ slotKey: "first", raw: "", computed: "Genesis 1:1-5" }),
    {
      valid: false,
      message: "Choose one of the options above or enter a citation.",
      state: "",
    },
  );
  assert.equal(
    selection.validate({
      slotKey: "first",
      raw: "Tobit 1:1",
      computed: "Genesis 1:1-5",
    }).message,
    "That citation is not in the available first reading lectionary passages.",
  );
});

test("a passage catalogued for another role is rejected explicitly", () => {
  const result = selection.validate({
    slotKey: "first",
    raw: "Matthew 20:20-28",
    computed: "Genesis 1:1-5",
  });

  assert.equal(result.valid, false);
  assert.equal(result.state, "error");
  assert.equal(result.message, "That passage is known as a gospel, not a first reading.");
});

test("the sole computed option restores the default instead of storing an override", () => {
  const result = selection.validate({
    slotKey: "first",
    raw: " genesis  1:1–5 ",
    computed: "Genesis 1:1-5",
  });

  assert.equal(result.valid, true);
  assert.equal(result.buttonLabel, "Use computed reading");
  assert.equal(result.previewText, "Genesis long text");
  assert.deepEqual(result.selection, {
    slot: "first",
    citation: "Genesis 1:1-5",
    isDefault: true,
    requiresConfirmation: false,
  });
});

test("an explicit long or short Ordo option needs no extra confirmation", () => {
  const result = selection.validate({
    slotKey: "first",
    raw: "Genesis 1:1-3",
    computed: "Genesis 1:1-5 or 1:1-3",
  });

  assert.equal(result.valid, true);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.message, "Valid option for this celebration.");
  assert.equal(result.selection.origin, "ordo-option");
  assert.equal(result.selection.citation, "Genesis 1:1-3");
});

test("another valid passage for the slot requires explicit non-standard confirmation", () => {
  const result = selection.validate({
    slotKey: "first",
    raw: "Acts 4:32-35",
    computed: "Genesis 1:1-5",
  });

  assert.equal(result.valid, true);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(
    result.message,
    "Valid for this reading slot. Confirm the non-standard selection below.",
  );
  assert.deepEqual(result.selection, {
    slot: "first",
    citation: "Acts 4:32-35",
    book: "Acts",
    segments: [{ chapter: 4, verses: "32-35" }],
    origin: "lectionary-catalog",
    translation: "World English Bible",
    textVersion: "embedded-2026-07",
    requiresConfirmation: true,
  });
});

test("a catalogued citation without usable full text cannot be selected", () => {
  const withoutText = ReadingSelection.create({
    readingSlots: slots,
    roleCitations,
    citationRoles,
    readings: {},
    normalizedCitation: normalize,
    citationAlternatives: value => [value],
    parseReadingCitation: () => ({ book: "Genesis", segments: [] }),
  });
  const result = withoutText.validate({
    slotKey: "first",
    raw: "Acts 4:32-35",
    computed: "Genesis 1:1-5",
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.message,
    "This passage is missing a valid citation or full text and cannot be selected.",
  );
});
