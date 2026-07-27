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
  };
}

function fixture(queue) {
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
    createQueueButton(item, index, select) {
      return { item, index, select };
    },
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
  assert.equal(elements.availability.textContent, "1 of 2 available");
  elements.launch.dispatch("click");
  assert.deepEqual(opened, [elements.dialog]);
  assert.equal(elements.summary.textContent, "1 of 2 selected songs available. 1 will be skipped.");
  assert.equal(elements.player.src, "https://embed.test/queue");
  assert.equal(elements.list.children.length, 1);
  assert.equal(elements.list.children[0].item, item);
});

test("disables practice when no selected song has a playable link", () => {
  const { elements, opened } = fixture({
    items: [],
    assignedCount: 2,
    playableCount: 0,
    missingCount: 2,
  });

  assert.equal(elements.launch.disabled, true);
  assert.equal(elements.availability.textContent, "No videos available");
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
