const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingEditorView = require("../src/app/reading-editor-view.js");

const escapeHtml = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const view = ReadingEditorView.create({
  escapeHtml,
  formatLong: value => `Long ${value}`,
  cycleName: value => `Year ${value}`,
});

const slots = [
  { key: "first", label: "First Reading" },
  { key: "psalm", label: "Psalm" },
  { key: "second", label: "Second Reading" },
  { key: "gospel", label: "Gospel" },
];

const sunday = {
  d: "2026-08-02",
  s: "Ordinary Time",
  c: "A",
};

test("non-editors receive no private editing presentation", () => {
  assert.deepEqual(view.render({
    isEditor: false,
    celebration: {},
    celebrationOverride: null,
    sunday,
    readingOverrides: {},
    readingSlots: slots,
    citations: {},
  }), {
    launchHidden: true,
    editorVisible: false,
    celebrationChanged: false,
    celebrationHtml: "",
    restoreCelebrationHidden: true,
    readingsHtml: "",
    footerHidden: true,
  });
});

test("computed celebrations render all slots without restore actions", () => {
  const result = view.render({
    isEditor: true,
    celebration: { name: "18th Sunday <Ordinary>" },
    celebrationOverride: null,
    sunday,
    readingOverrides: {},
    readingSlots: slots,
    citations: {
      first: "Isaiah 55:1-3",
      psalm: "Psalm 145:8-9",
      second: "Romans 8:35-39",
      gospel: "Matthew 14:13-21",
    },
  });

  assert.equal(result.launchHidden, false);
  assert.equal(result.celebrationChanged, false);
  assert.equal(result.restoreCelebrationHidden, true);
  assert.equal(result.footerHidden, true);
  assert.match(result.celebrationHtml, /18th Sunday &lt;Ordinary&gt;/);
  assert.match(result.celebrationHtml, /Long 2026-08-02 · Ordinary Time · Year A/);
  assert.equal((result.readingsHtml.match(/data-reading-action="change"/g) || []).length, 4);
  assert.equal((result.readingsHtml.match(/data-reading-action="restore"/g) || []).length, 0);
  assert.equal((result.readingsHtml.match(/>Computed</g) || []).length, 4);
});

test("celebration and individual overrides have distinct badges and actions", () => {
  const override = {
    name: "Saint James & Apostles",
    rank: "Solemnity",
    sourceDate: "2026-07-25",
  };
  const result = view.render({
    isEditor: true,
    celebration: override,
    celebrationOverride: override,
    sunday,
    readingOverrides: {
      first: { citation: "Acts 4:32-35" },
    },
    readingSlots: slots,
    citations: {
      first: "Acts 4:32-35",
      psalm: "Psalm 126:1-6",
      second: "2 Corinthians 4:7-15",
      gospel: "Matthew 20:20-28",
    },
  });

  assert.equal(result.celebrationChanged, true);
  assert.equal(result.restoreCelebrationHidden, false);
  assert.equal(result.footerHidden, false);
  assert.match(result.celebrationHtml, /Saint James &amp; Apostles/);
  assert.match(result.celebrationHtml, /Solemnity · normally Long 2026-07-25/);
  assert.equal((result.readingsHtml.match(/>Changed</g) || []).length, 1);
  assert.equal((result.readingsHtml.match(/>Selected Mass</g) || []).length, 3);
  assert.match(result.readingsHtml, /data-reading-action="restore" data-reading-slot="first"/);
});
