const test = require("node:test");
const assert = require("node:assert/strict");

const SongForm = require("../src/app/song-form.js");

function harness() {
  const suggestionInputs = [
    { value: "entrance", checked: false },
    { value: "memorial", checked: false },
    { value: "communion", checked: false },
  ];
  const elements = {
    title: { value: "" },
    youtubeUrl: { value: "" },
    authors: { value: "" },
    copyrightOwner: { value: "" },
    copyrightYear: { value: "" },
    source: { value: "" },
    responsorialBook: { value: "" },
    responsorialNumber: { value: "" },
    responsorialCitations: { value: "" },
    responsorialFields: { hidden: true },
    lyrics: { value: "" },
    inRepertoire: { checked: true },
    suggestionParts: {
      querySelectorAll(selector) {
        assert.equal(selector, 'input[type="checkbox"]');
        return suggestionInputs;
      },
    },
  };
  return { form: SongForm.create(elements), elements, suggestionInputs };
}

test("reading a song form returns every canonical field and checked suggestion part", () => {
  const { form, elements, suggestionInputs } = harness();
  Object.assign(elements.title, { value: "A title" });
  Object.assign(elements.youtubeUrl, { value: "https://youtu.be/example" });
  Object.assign(elements.authors, { value: "An author" });
  Object.assign(elements.copyrightOwner, { value: "A publisher" });
  Object.assign(elements.copyrightYear, { value: "1975, 2016" });
  Object.assign(elements.source, { value: "A hymnal" });
  Object.assign(elements.lyrics, { value: "Private lyrics" });
  elements.inRepertoire.checked = false;
  suggestionInputs[0].checked = true;
  suggestionInputs[2].checked = true;

  assert.deepEqual(form.read(), {
    title: "A title",
    youtubeUrl: "https://youtu.be/example",
    authors: "An author",
    copyrightOwner: "A publisher",
    copyrightYear: "1975, 2016",
    source: "A hymnal",
    responsorialBook: "",
    responsorialNumber: "",
    responsorialCitations: "",
    lyrics: "Private lyrics",
    inRepertoire: false,
    suggestionParts: ["entrance", "communion"],
  });
});

test("writing an existing song populates fields and replaces checkbox state", () => {
  const { form, elements, suggestionInputs } = harness();
  suggestionInputs.forEach(input => { input.checked = true; });
  form.write({
    title: "Mass setting",
    youtubeUrl: "https://youtube.com/watch?v=example",
    authors: "Composer",
    copyrightOwner: "Publisher",
    copyrightYear: "2026",
    source: "Book",
    lyrics: "Words",
    inRepertoire: false,
    suggestionParts: ["memorial"],
  });

  assert.equal(elements.title.value, "Mass setting");
  assert.equal(elements.copyrightYear.value, "2026");
  assert.equal(elements.lyrics.value, "Words");
  assert.equal(elements.inRepertoire.checked, false);
  assert.deepEqual(
    suggestionInputs.map(input => input.checked),
    [false, true, false],
  );
});

test("writing a new song accepts contextual title and suggestion defaults", () => {
  const { form, elements, suggestionInputs } = harness();
  form.write(null, {
    fallbackTitle: "Search text",
    defaultSuggestionParts: ["communion"],
  });

  assert.equal(elements.title.value, "Search text");
  assert.equal(elements.youtubeUrl.value, "");
  assert.equal(elements.lyrics.value, "");
  assert.equal(elements.inRepertoire.checked, true);
  assert.deepEqual(
    suggestionInputs.map(input => input.checked),
    [false, false, true],
  );
});

test("missing optional song values become empty form values", () => {
  const { form, elements } = harness();
  form.write({ title: "Title" });

  assert.equal(elements.authors.value, "");
  assert.equal(elements.copyrightOwner.value, "");
  assert.equal(elements.source.value, "");
  assert.equal(elements.inRepertoire.checked, true);
});
