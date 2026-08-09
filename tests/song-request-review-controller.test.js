const test = require("node:test");
const assert = require("node:assert/strict");

const SongRequestReviewController = require("../src/app/song-request-review-controller.js");
const SongPresentation = require("../src/domain/song-presentation.js");

function fakeNode(tag = "div") {
  const listeners = new Map();
  return {
    tag,
    type: "",
    className: "",
    textContent: "",
    hidden: false,
    children: [],
    append(...values) {
      this.children.push(...values);
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

function requests() {
  return [
    {
      id: "request-1",
      songId: "song-9",
      songTitle: "Gather Us In",
      songAuthors: "Marty Haugen",
      title: "",
      youtubeVideoId: "",
      note: "For the feast",
      sunday: "2026-08-09",
      part: "entrance",
      status: "pending",
    },
    {
      id: "request-2",
      songId: null,
      songTitle: "",
      songAuthors: "",
      title: "New Hymn",
      youtubeVideoId: "AAAAAAAAAAA",
      note: "",
      sunday: null,
      part: null,
      status: "pending",
    },
  ];
}

function fixture(overrides = {}) {
  const elements = {
    launch: fakeNode(),
    dialog: fakeNode(),
    close: fakeNode(),
    list: fakeNode(),
    empty: fakeNode(),
    error: fakeNode(),
  };
  elements.list.ownerDocument = { createElement: fakeNode };
  elements.dialog.open = false;
  elements.dialog.close = function close() {
    this.open = false;
  };
  const state = { pending: requests() };
  const assigned = [];
  const resolved = [];
  const statuses = [];
  const watchers = new Set();
  const store = {
    subscribeSongRequests(onChange) {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    async listSongRequests() {
      return state.pending;
    },
    async assignSong(date, part, songId) {
      assigned.push([date, part, songId]);
    },
    async resolveSongRequest(id, status) {
      resolved.push([id, status]);
      state.pending = state.pending.filter(request => request.id !== id);
    },
  };
  const controller = SongRequestReviewController.create({
    elements,
    parts: [{ key: "entrance", label: "Entrance" }],
    getStore: () => store,
    isEditor: () => true,
    isOnline: () => true,
    openModal: dialog => {
      dialog.open = true;
    },
    onStatus: (text, value) => statuses.push([text, value]),
    formatDate: iso => `Sunday ${iso}`,
    youtubeWatchUrl: SongPresentation.youtubeWatchUrl,
    logger: { warn() {}, error() {} },
    ...overrides,
  });
  controller.start();
  // Stands in for a Realtime song_requests event raised by somebody else's change.
  async function notifyWatchers() {
    watchers.forEach(callback => callback());
    await new Promise(resolve => setImmediate(resolve));
  }
  return { controller, elements, state, assigned, resolved, statuses, watchers, notifyWatchers };
}

function actionsOf(item) {
  return item.children.find(child => child.className === "song-request-actions");
}

test("everyone sees the pending queue read-only; only empty hides it from non-editors", async () => {
  const { controller, elements } = fixture({ isEditor: () => false });
  await controller.refresh();
  assert.equal(elements.launch.hidden, false);
  assert.equal(elements.launch.textContent, "Song requests (2)");
  await controller.open();
  assert.equal(elements.list.children.length, 2);
  assert.equal(elements.list.children[0].children[0].textContent, "Gather Us In");
  elements.list.children.forEach(item => {
    assert.equal(actionsOf(item), undefined);
  });
});

test("an empty public queue hides the launch button, but editors keep it", async () => {
  const publicView = fixture({
    isEditor: () => false,
    getStore: () => ({ async listSongRequests() { return []; } }),
  });
  await publicView.controller.refresh();
  assert.equal(publicView.elements.launch.hidden, true);

  const editorView = fixture({
    getStore: () => ({ async listSongRequests() { return []; } }),
  });
  await editorView.controller.refresh();
  assert.equal(editorView.elements.launch.hidden, false);
  assert.equal(editorView.elements.launch.textContent, "Song requests (0)");
});

test("refresh counts pending requests on the launch button", async () => {
  const { controller, elements } = fixture();
  await controller.refresh();
  assert.equal(elements.launch.hidden, false);
  assert.equal(elements.launch.textContent, "Song requests (2)");
});

test("another member's suggestion reaches an open planner without a reload", async () => {
  const { controller, elements, state, notifyWatchers } = fixture({ isEditor: () => false });
  await controller.refresh();
  assert.equal(elements.launch.textContent, "Song requests (2)");

  state.pending = [{
    id: "request-3",
    songId: null,
    songTitle: "",
    songAuthors: "",
    title: "Be Thou My Vision",
    youtubeVideoId: "",
    note: "Suggested by another choir member",
    sunday: null,
    part: null,
    status: "pending",
  }, ...state.pending];
  await notifyWatchers();

  assert.equal(elements.launch.textContent, "Song requests (3)");
  assert.equal(elements.list.children.length, 0);
});

test("an open queue dialog re-renders when somebody else changes the queue", async () => {
  const { controller, elements, state, notifyWatchers } = fixture({ isEditor: () => false });
  await controller.open();
  assert.equal(elements.list.children.length, 2);

  state.pending = state.pending.slice(1);
  await notifyWatchers();

  assert.equal(elements.launch.textContent, "Song requests (1)");
  assert.equal(elements.list.children.length, 1);
  assert.equal(elements.list.children[0].children[0].textContent, "New Hymn");
});

test("the queue subscribes once and releases the subscription on stop", async () => {
  const { controller, watchers } = fixture();
  await controller.refresh();
  await controller.refresh();
  assert.equal(watchers.size, 1);

  controller.stop();
  assert.equal(watchers.size, 0);
});

test("reconnecting to another store moves the live subscription across", async () => {
  const watchersOf = new Map();
  const makeStore = key => {
    const watchers = new Set();
    watchersOf.set(key, watchers);
    return {
      subscribeSongRequests(onChange) {
        watchers.add(onChange);
        return () => watchers.delete(onChange);
      },
      async listSongRequests() {
        return requests();
      },
    };
  };
  let store = makeStore("first");
  const { controller } = fixture({ getStore: () => store });
  await controller.refresh();
  assert.equal(watchersOf.get("first").size, 1);

  store = makeStore("second");
  await controller.refresh();
  assert.equal(watchersOf.get("first").size, 0);
  assert.equal(watchersOf.get("second").size, 1);
});

test("a store without live song requests still refreshes on demand", async () => {
  const { controller, elements } = fixture({
    getStore: () => ({ async listSongRequests() { return requests(); } }),
  });
  await controller.refresh();
  assert.equal(elements.launch.textContent, "Song requests (2)");
  assert.doesNotThrow(() => controller.stop());
});

test("opening lists requests with target, source, and link details", async () => {
  const { controller, elements } = fixture();
  await controller.open();
  assert.equal(elements.dialog.open, true);
  assert.equal(elements.empty.hidden, true);
  assert.equal(elements.list.children.length, 2);

  const [assignable, freeText] = elements.list.children;
  assert.equal(assignable.children[0].textContent, "Gather Us In");
  assert.match(assignable.children[1].textContent, /Entrance · Sunday 2026-08-09 · In the song library/);
  assert.match(
    assignable.children.find(child => child.className === "song-request-note").textContent,
    /For the feast/,
  );
  assert.equal(actionsOf(assignable).children[0].textContent, "Accept and assign");

  assert.equal(freeText.children[0].textContent, "New Hymn");
  assert.match(freeText.children[1].textContent, /New song/);
  const listen = freeText.children.find(child => child.className === "listen-link");
  assert.equal(listen.href, "https://www.youtube.com/watch?v=AAAAAAAAAAA");
  assert.equal(actionsOf(freeText).children[0].textContent, "Mark accepted");
});

test("accepting a library request with a target assigns the song", async () => {
  const { controller, elements, assigned, resolved, statuses } = fixture();
  await controller.open();
  await actionsOf(elements.list.children[0]).children[0].dispatch("click");
  assert.deepEqual(assigned, [["2026-08-09", "entrance", "song-9"]]);
  assert.deepEqual(resolved, [["request-1", "accepted"]]);
  assert.deepEqual(statuses, [["Request accepted", "saved"]]);
  assert.equal(elements.launch.textContent, "Song requests (1)");
  assert.equal(elements.list.children.length, 1);
});

test("free-text requests resolve without touching the plan", async () => {
  const { controller, elements, assigned, resolved } = fixture();
  await controller.open();
  const actions = actionsOf(elements.list.children[1]);
  await actions.children[0].dispatch("click");
  assert.deepEqual(assigned, []);
  assert.deepEqual(resolved, [["request-2", "accepted"]]);
});

test("declining resolves without assigning and empties the list", async () => {
  const { controller, elements, assigned, resolved } = fixture();
  await controller.open();
  await actionsOf(elements.list.children[0]).children[1].dispatch("click");
  await actionsOf(elements.list.children[0]).children[1].dispatch("click");
  assert.deepEqual(assigned, []);
  assert.deepEqual(resolved, [["request-1", "declined"], ["request-2", "declined"]]);
  assert.equal(elements.empty.hidden, false);
  assert.equal(elements.list.children.length, 0);
});

test("offline resolution is refused before any request", async () => {
  const { controller, elements, resolved } = fixture({ isOnline: () => false });
  await controller.open();
  await actionsOf(elements.list.children[0]).children[0].dispatch("click");
  assert.match(elements.error.textContent, /internet connection/);
  assert.deepEqual(resolved, []);
});
