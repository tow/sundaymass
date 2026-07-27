const test = require("node:test");
const assert = require("node:assert/strict");

const CelebrationPickerView = require("../src/app/celebration-picker-view.js");

const escapeHtml = value => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const dayDistance = (left, right) =>
  (Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / 86400000;

const view = CelebrationPickerView.create({
  escapeHtml,
  formatLong: iso => `Long ${iso}`,
  cycleName: cycle => `Year ${cycle}`,
  dayDistance,
});

const currentSunday = {
  d: "2026-07-26",
  n: "17th Sunday in Ordinary Time",
};

const candidates = [
  {
    id: "computed",
    name: currentSunday.n,
    sourceDate: currentSunday.d,
    rank: "Sunday",
    cycle: "A",
    lectionary: "111",
  },
  {
    id: "james",
    name: "Saint James the Apostle",
    sourceDate: "2026-07-25",
    rank: "Feast",
    lectionary: "605",
    commonNames: ["Common of Apostles"],
  },
  {
    id: "anne",
    name: "Saints Joachim and Anne",
    sourceDate: "2026-07-27",
    rank: "Memorial",
    lectionary: "",
  },
  {
    id: "far",
    name: "Dedication of the Lateran Basilica",
    sourceDate: "2026-11-09",
    rank: "Feast",
    lectionary: "671",
  },
];

test("empty search shows nearby celebrations and excludes the computed Sunday", () => {
  const result = view.search({
    candidates,
    currentSunday,
    query: "",
    selectedId: "james",
  });

  assert.equal(result.heading, "Nearby celebrations");
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ["james", "anne"]);
  assert.match(result.html, /data-celebration-index="0"/);
  assert.match(result.html, /class="celebration-result selected"/);
  assert.match(result.html, /Feast · Long 2026-07-25 · Lectionary 605/);
  assert.doesNotMatch(result.html, /17th Sunday in Ordinary Time|Lateran/);
});

test("text search uses all words, includes distant matches, and escapes names", () => {
  const result = view.search({
    candidates: [
      ...candidates,
      {
        id: "escaped",
        name: "Dedication <Church>",
        sourceDate: "2027-01-01",
        rank: "Feast",
        commonNames: ["Lateran Basilica"],
      },
    ],
    currentSunday,
    query: "dedication church",
    selectedId: "",
  });

  assert.equal(result.heading, "Matching celebrations");
  assert.deepEqual(result.candidates.map(candidate => candidate.id), ["escaped"]);
  assert.match(result.html, /Dedication &lt;Church&gt;/);
});

test("preview renders fixed and selectable readings including an optional second reading", () => {
  const candidate = {
    id: "james",
    name: "Saint <James>",
    sourceDate: "2026-07-25",
    rank: "Feast",
    lectionary: "605",
    requiresSecondReading: false,
    readings: {
      first: "2 Corinthians 4:7-15",
      psalm: "Psalm 126:1-2",
      second: "",
      gospel: "Matthew 20:20-28",
    },
    readingOptions: {
      first: ["2 Corinthians 4:7-15"],
      psalm: ["Psalm 126:1-2", "Psalm 116:10-11"],
      second: [],
      gospel: ["Matthew 20:20-28"],
    },
    commonNames: ["Common of Apostles", "Common <Martyrs>"],
  };

  const result = view.renderPreview(candidate);

  assert.equal(result.hidden, false);
  assert.equal(result.useDisabled, false);
  assert.match(result.html, /<h3>Saint &lt;James&gt;<\/h3>/);
  assert.match(result.html, /<dt>First Reading<\/dt><dd>2 Corinthians 4:7-15<\/dd>/);
  assert.match(result.html, /data-celebration-reading="psalm"/);
  assert.match(result.html, /value="Psalm 126:1-2" selected/);
  assert.match(result.html, /data-celebration-reading="second"/);
  assert.match(result.html, /<option value="">No second reading<\/option>/);
  assert.match(result.html, /Common of Apostles and Common &lt;Martyrs&gt;/);
});

test("missing selection hides the preview and disables its action", () => {
  assert.deepEqual(view.renderPreview(null), {
    hidden: true,
    useDisabled: true,
    html: "",
  });
});
