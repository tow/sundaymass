const test = require("node:test");
const assert = require("node:assert/strict");

const PrintController = require("../src/app/print-controller.js");

const musicParts = [
  { key: "entrance", label: "Entrance Hymn", note: "" },
  { key: "communion", label: "Communion Hymn 1", note: "" },
];
const readings = [
  { key: "first", label: "First Reading", citation: "Isaiah 55:1-3", text: "Full first text" },
  { key: "psalm", label: "Responsorial Psalm", citation: "Psalm 145:8-9", text: "Full psalm text" },
  { key: "second", label: "Second Reading", citation: "Romans 8:35", text: "Full second text" },
  { key: "gospel", label: "Gospel", citation: "Matthew 14:13-21", text: "Full gospel text" },
];
const songs = {
  entrance: {
    song: "Table & Plenty",
    authors: "Dan Schutte",
    copyrightYear: "1992",
    copyrightOwner: "OCP",
    source: "",
    lyrics: "PRIVATE LYRICS MUST NOT PRINT",
  },
  communion: {
    song: "",
    authors: "",
    copyrightYear: "",
    copyrightOwner: "",
    source: "",
  },
};

function sheet(mode) {
  return PrintController.renderSheet({
    mode,
    celebration: "18th Sunday in Ordinary Time",
    meta: "Sunday, 2 August 2026 · Ordinary Time · Year A",
    musicParts,
    readings,
    choiceFor: key => songs[key],
    attributionLine: song => song.authors
      ? `Authors: ${song.authors} · © ${song.copyrightYear} ${song.copyrightOwner}`
      : "",
    copyrightComplete: song => !song.song || Boolean(song.authors && song.copyrightYear),
  });
}

test("music print markup includes citations and every music slot but not full readings", () => {
  const markup = sheet("music");

  assert.match(markup, /St James the Apostle — 6pm Mass/);
  assert.match(markup, /18th Sunday in Ordinary Time/);
  assert.match(markup, /Isaiah 55:1-3/);
  assert.match(markup, /Entrance Hymn/);
  assert.match(markup, /Table &amp; Plenty/);
  assert.match(markup, /Not yet chosen/);
  assert.doesNotMatch(markup, /Full first text/);
  assert.doesNotMatch(markup, /PRIVATE LYRICS MUST NOT PRINT/);
});

test("music plus readings adds full texts on a separate print section", () => {
  const markup = sheet("music-readings");

  assert.match(markup, /class="print-reading-pages"/);
  readings.forEach(reading => {
    assert.match(markup, new RegExp(reading.label));
    assert.match(markup, new RegExp(reading.text));
  });
  assert.match(markup, /World English Bible \(public domain\)/);
});

test("print lifecycle prepares the requested mode and cleans up after printing", () => {
  const listeners = new Map();
  const rendered = [];
  let printCalls = 0;
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    print() { printCalls += 1; },
  };
  const root = {
    innerHTML: "",
    attributes: new Map([["aria-hidden", "true"]]),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  };
  const controller = PrintController.create({
    window,
    root,
    render: mode => {
      rendered.push(mode);
      return `<p>${mode}</p>`;
    },
  });
  controller.start();
  controller.print("music-readings");

  assert.deepEqual(rendered, ["music-readings"]);
  assert.equal(root.innerHTML, "<p>music-readings</p>");
  assert.equal(root.attributes.get("aria-hidden"), "false");
  assert.equal(printCalls, 1);

  listeners.get("afterprint")();
  assert.equal(root.attributes.get("aria-hidden"), "true");
});

test("browser-initiated printing defaults to the music sheet", () => {
  const listeners = new Map();
  const rendered = [];
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
    print() {},
  };
  const root = {
    innerHTML: "",
    setAttribute() {},
  };
  const controller = PrintController.create({
    window,
    root,
    render: mode => {
      rendered.push(mode);
      return mode;
    },
  });
  controller.start();
  listeners.get("beforeprint")();

  assert.deepEqual(rendered, ["music"]);
  assert.equal(root.innerHTML, "music");
  assert.throws(() => controller.print("unknown"), /Unknown print mode/);
});

