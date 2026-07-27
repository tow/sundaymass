const test = require("node:test");
const assert = require("node:assert/strict");

const ReadingPlanView = require("../src/app/reading-plan-view.js");

const escapeHtml = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const view = ReadingPlanView.create({
  escapeHtml,
  formatLong: iso => `Long ${iso}`,
  cycleName: cycle => `Year ${cycle}`,
});

const slots = [
  { key: "first", label: "First Reading" },
  { key: "psalm", label: "Responsorial Psalm" },
  { key: "second", label: "Second Reading" },
  { key: "gospel", label: "Gospel" },
];

const sunday = {
  d: "2026-08-02",
  n: "18th Sunday in Ordinary Time",
  s: "Ordinary Time",
  c: "A",
};

const celebration = {
  name: "18th Sunday in Ordinary Time",
  readings: {
    first: "Isaiah 55:1-3",
    psalm: "Psalm 145:8-9",
    second: "Romans 8:35",
    gospel: "Matthew 14:13-21",
  },
};

const values = {
  day: celebration.name,
  meta: "Long 2026-08-02 · Ordinary Time · Year A",
  first: "Isaiah 55:1-3",
  psalm: "Psalm 145:8-9",
  second: "Romans 8:35",
  gospel: "Matthew 14:13-21",
};

test("render builds the linked reading summary and all four full-text anchors", () => {
  const result = view.render({
    sunday,
    celebration,
    celebrationOverride: null,
    readingOverrides: {},
    readingSlots: slots,
    values,
    textFor: citation => citation === "Psalm 145:8-9" ? "" : `Text for <${citation}>`,
  });

  assert.match(result.resolvedHtml, /Long 2026-08-02/);
  assert.match(result.resolvedHtml, /18th Sunday in Ordinary Time/);
  assert.match(result.resolvedHtml, /Ordinary Time · Year A/);
  assert.equal((result.summaryHtml.match(/href="#reading-/g) || []).length, 4);
  assert.match(result.summaryHtml, /href="#reading-gospel"/);
  assert.equal((result.fullReadingsHtml.match(/class="rblock reading-anchor"/g) || []).length, 4);
  assert.match(result.fullReadingsHtml, /id="reading-first"/);
  assert.match(result.fullReadingsHtml, /Text for &lt;Isaiah 55:1-3&gt;/);
  assert.match(result.fullReadingsHtml, /\(sung — see citation\)/);
  assert.match(result.fullReadingsHtml, /World English Bible \(public domain\)/);
  assert.equal(result.readingsIntro, `${values.day} · ${values.meta}`);
  assert.doesNotMatch(result.summaryHtml + result.fullReadingsHtml, /reading-adjusted-note/);
});

test("celebration and reading overrides are marked in every relevant public view", () => {
  const selectedCelebration = {
    ...celebration,
    name: "Saint James the Apostle",
    rank: "Feast",
    sourceDate: "2026-07-25",
  };
  const result = view.render({
    sunday,
    celebration: selectedCelebration,
    celebrationOverride: selectedCelebration,
    readingOverrides: {
      first: { citation: "Acts 4:33; 5:12" },
    },
    readingSlots: slots,
    values: {
      ...values,
      day: selectedCelebration.name,
      first: "Acts 4:33; 5:12",
    },
    textFor: () => "Reading text",
  });

  assert.match(result.resolvedHtml, /Changed celebration/);
  assert.match(result.resolvedHtml, /Feast · normally Long 2026-07-25/);
  assert.match(result.summaryHtml, /Readings for this Mass<span class="reading-adjusted-note">Adjusted/);
  assert.match(
    result.summaryHtml,
    /reading-item changed" href="#reading-first"[\s\S]*First Reading<span class="reading-adjusted-note">Adjusted/,
  );
  assert.match(
    result.fullReadingsHtml,
    /id="reading-first"[\s\S]*Acts 4:33; 5:12[\s\S]*reading-adjusted-note">Adjusted/,
  );
  assert.equal((result.fullReadingsHtml.match(/reading-adjusted-note/g) || []).length, 4);
});
