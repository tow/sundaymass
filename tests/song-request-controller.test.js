const test = require("node:test");
const assert = require("node:assert/strict");

const SongRequestController = require("../src/app/song-request-controller.js");
const SongRequests = require("../src/domain/song-requests.js");

function fakeNode(tag = "div") {
  const listeners = new Map();
  return {
    tag,
    type: "",
    className: "",
    textContent: "",
    value: "",
    disabled: false,
    children: [],
    attributes: {},
    append(...values) {
      this.children.push(...values);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    dispatch(type, event = {}) {
      return listeners.get(type)?.(event);
    },
    replaceChildren(...values) {
      this.children = values;
    },
  };
}

function fixture(overrides = {}) {
  const elements = {
    musicList: fakeNode(),
    dialog: fakeNode(),
    form: fakeNode(),
    context: fakeNode(),
    close: fakeNode(),
    cancel: fakeNode(),
    search: fakeNode(),
    results: fakeNode(),
    title: fakeNode(),
    youtube: fakeNode(),
    note: fakeNode(),
    error: fakeNode(),
    submit: fakeNode(),
  };
  elements.results.ownerDocument = { createElement: fakeNode };
  elements.dialog.open = false;
  elements.dialog.close = function close() {
    this.open = false;
  };
  elements.form.reset = () => {
    ["search", "title", "youtube", "note"].forEach(key => {
      elements[key].value = "";
    });
  };
  const opened = [];
  const statuses = [];
  const created = [];
  const createdEvents = [];
  const store = {
    async searchPublicSongs() {
      return [{ id: "song-9", title: "Gather Us In", authors: "Marty Haugen" }];
    },
    async createSongRequest(value) {
      created.push(value);
      return "request-1";
    },
  };
  const controller = SongRequestController.create({
    elements,
    parts: [{ key: "offertory", label: "Offertory" }],
    songRequests: SongRequests,
    getStore: () => store,
    canSuggest: () => true,
    isOnline: () => true,
    getDate: () => "2026-08-09",
    formatDate: iso => `Sunday ${iso}`,
    openModal: dialog => {
      dialog.open = true;
      opened.push(dialog);
    },
    onStatus: (text, state) => statuses.push([text, state]),
    onCreated: () => createdEvents.push(true),
    logger: { warn() {}, error() {} },
    ...overrides,
  });
  controller.start();
  return { controller, elements, opened, statuses, created, createdEvents, store };
}

function openFromRow(elements, part = "offertory") {
  elements.musicList.dispatch("click", {
    target: { closest: () => ({ dataset: { part } }) },
  });
}

test("a request button on a plan row opens the dialog with its target", () => {
  const { elements, opened } = fixture();
  openFromRow(elements);
  assert.deepEqual(opened, [elements.dialog]);
  assert.match(elements.context.textContent, /Offertory/);
  assert.match(elements.context.textContent, /Sunday 2026-08-09/);
});

test("without choir access the dialog never opens", () => {
  const { elements, opened } = fixture({ canSuggest: () => false });
  openFromRow(elements);
  assert.deepEqual(opened, []);
});

test("an empty submission reports validation instead of sending", async () => {
  const { elements, created } = fixture();
  openFromRow(elements);
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.match(elements.error.textContent, /Choose a song/);
  assert.deepEqual(created, []);
});

test("selecting a search result sends an existing-song request", async () => {
  const { elements, created, statuses, createdEvents } = fixture();
  openFromRow(elements);
  elements.search.value = "gather";
  await elements.search.dispatch("input");
  assert.equal(elements.results.children.length, 1);
  const result = elements.results.children[0];
  assert.equal(result.children[0].textContent, "Gather Us In");

  result.dispatch("click");
  assert.equal(elements.title.disabled, true);
  assert.equal(elements.youtube.disabled, true);

  elements.note.value = "  For the feast  ";
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.deepEqual(created, [{
    songId: "song-9",
    title: "",
    youtubeVideoId: "",
    note: "For the feast",
    sunday: "2026-08-09",
    part: "offertory",
  }]);
  assert.equal(elements.dialog.open, false);
  assert.deepEqual(statuses, [["Suggestion sent", "saved"]]);
  assert.equal(createdEvents.length, 1);
});

test("a free-text request validates its link before sending the video ID", async () => {
  const { elements, created } = fixture();
  openFromRow(elements);
  elements.title.value = "New Hymn";
  elements.youtube.value = "https://example.com/not-youtube";
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.match(elements.error.textContent, /YouTube/);
  assert.deepEqual(created, []);

  elements.youtube.value = "https://www.youtube.com/watch?v=AAAAAAAAAAA";
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.equal(created.length, 1);
  assert.equal(created[0].songId, null);
  assert.equal(created[0].title, "New Hymn");
  assert.equal(created[0].youtubeVideoId, "AAAAAAAAAAA");
});

test("offline submissions are refused before any request", async () => {
  const { elements, created } = fixture({ isOnline: () => false });
  openFromRow(elements);
  elements.title.value = "New Hymn";
  await elements.form.dispatch("submit", { preventDefault() {} });
  assert.match(elements.error.textContent, /internet connection/);
  assert.deepEqual(created, []);
});

test("reopening clears the previous selection and errors", async () => {
  const { elements } = fixture();
  openFromRow(elements);
  elements.search.value = "gather";
  await elements.search.dispatch("input");
  elements.results.children[0].dispatch("click");
  assert.equal(elements.title.disabled, true);

  openFromRow(elements);
  assert.equal(elements.title.disabled, false);
  assert.equal(elements.results.children.length, 0);
  assert.equal(elements.error.textContent, "");
});
