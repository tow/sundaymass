const test = require("node:test");
const assert = require("node:assert/strict");

const PracticeQueueController = require("../src/app/practice-queue-controller.js");

function element() {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    innerHTML: "",
    src: "",
    dataset: {},
    children: [],
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    dispatch(type, event = {}) {
      listeners.get(type)?.(event);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    removeAttribute(name) {
      if (name === "src") this.src = "";
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

function fixture(queue, overrides = {}) {
  const elements = {
    launch: element(),
    availability: element(),
    dialog: element(),
    close: element(),
    summary: element(),
    player: element(),
    list: element(),
  };
  elements.dialog.close = () => {
    elements.dialog.dispatch("close");
  };
  const opened = [];
  const controller = PracticeQueueController.create({
    elements,
    parts: [{ key: "entrance", label: "Entrance" }],
    getSongs: () => ({ entrance: { title: "Opening" } }),
    queueBuilder: { build: () => queue, embedUrl: () => "https://embed.test/queue" },
    openModal: dialog => opened.push(dialog),
    loadPlayerApi: () => new Promise(() => {}),
    createQueueButton(item, index, select) {
      const current = new Set();
      return {
        item,
        index,
        select,
        classList: {
          toggle(name, enabled) {
            if (enabled) current.add(name);
            else current.delete(name);
          },
          contains: name => current.has(name),
        },
        setAttribute(name, value) {
          this[name] = value;
        },
        removeAttribute(name) {
          delete this[name];
        },
      };
    },
    ...overrides,
  });
  controller.start();
  return { controller, elements, opened };
}

test("renders availability and opens a playable queue", () => {
  const item = {
    part: "entrance",
    label: "Entrance",
    title: "Opening",
    videoId: "AAAAAAAAAAA",
  };
  const { elements, opened } = fixture({
    items: [item],
    assignedCount: 2,
    playableCount: 1,
    missingCount: 1,
  });

  assert.equal(elements.launch.disabled, false);
  assert.equal(elements.availability.textContent, "1/2");
  assert.equal(
    elements.launch["aria-label"],
    "Listen to all: 1 of 2 selected songs have videos",
  );
  elements.launch.dispatch("click");
  assert.deepEqual(opened, [elements.dialog]);
  assert.equal(elements.summary.textContent, "1 of 2 selected songs available. 1 will be skipped.");
  assert.equal(elements.player.src, "https://embed.test/queue");
  assert.equal(elements.list.children.length, 1);
  assert.equal(elements.list.children[0].item, item);
});

test("disables listening when no selected song has a playable link", () => {
  const { elements, opened } = fixture({
    items: [],
    assignedCount: 2,
    playableCount: 0,
    missingCount: 2,
  });

  assert.equal(elements.launch.disabled, true);
  assert.equal(elements.availability.textContent, "0/2");
  elements.launch.dispatch("click");
  assert.deepEqual(opened, []);
});

test("closing the player removes its source so playback stops", () => {
  const { elements } = fixture({
    items: [{
      part: "entrance",
      label: "Entrance",
      title: "Opening",
      videoId: "AAAAAAAAAAA",
    }],
    assignedCount: 1,
    playableCount: 1,
    missingCount: 0,
  });

  elements.launch.dispatch("click");
  assert.notEqual(elements.player.src, "");
  elements.close.dispatch("click");
  assert.equal(elements.player.src, "");
});

test("loads the full ordered playlist at index zero and follows player advances", async () => {
  let events;
  let playlistIndex = 0;
  const loads = [];
  const player = {
    getPlaylistIndex: () => playlistIndex,
    loadPlaylist(options) {
      loads.push(options);
      playlistIndex = options.index;
    },
    stopVideo() {},
  };
  class Player {
    constructor(element, options) {
      events = options.events;
      queueMicrotask(() => events.onReady({ target: player }));
    }
  }
  const queue = {
    items: [
      { title: "Opening", videoId: "AAAAAAAAAAA" },
      { title: "Kyrie", videoId: "BBBBBBBBBBB" },
      { title: "Gloria", videoId: "CCCCCCCCCCC" },
    ],
    assignedCount: 3,
    playableCount: 3,
    missingCount: 0,
  };
  const { elements } = fixture(queue, {
    loadPlayerApi: () => Promise.resolve({ Player }),
  });

  elements.launch.dispatch("click");
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(loads, [{
    playlist: ["AAAAAAAAAAA", "BBBBBBBBBBB", "CCCCCCCCCCC"],
    index: 0,
    startSeconds: 0,
  }]);
  assert.equal(elements.list.children[0].classList.contains("current"), true);

  playlistIndex = 1;
  events.onStateChange({ target: player });
  assert.equal(elements.list.children[0].classList.contains("current"), false);
  assert.equal(elements.list.children[1].classList.contains("current"), true);
});
