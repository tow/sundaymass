const assert = require("node:assert/strict");
const test = require("node:test");

const ReadingTextStore = require("../src/services/reading-text-store.js");

test("reading text store fetches only requested citations and caches their text", async () => {
  const requests = [];
  const store = ReadingTextStore.create({
    assets: {
      "Genesis 1:1": "first.json",
      "John 1:1": "second.json",
    },
    assetUrl: path => `/mass/${path}`,
    fetchImpl: async url => {
      requests.push(url);
      return {
        ok: true,
        json: async () => url.includes("first") ? "In the beginning" : "The Word",
      };
    },
  });

  assert.equal(store.get("Genesis 1:1"), "");
  assert.deepEqual(
    await store.loadMany(["Genesis 1:1", "Genesis 1:1"]),
    { "Genesis 1:1": "In the beginning" },
  );
  assert.equal(await store.load("Genesis 1:1"), "In the beginning");
  assert.deepEqual(requests, ["/mass/data/readings/first.json"]);
  assert.equal(store.get("John 1:1"), "");
});

test("reading text store deduplicates concurrent requests", async () => {
  let resolveResponse;
  let requestCount = 0;
  const store = ReadingTextStore.create({
    assets: { "Luke 1:1": "luke.json" },
    assetUrl: path => path,
    fetchImpl: async () => {
      requestCount += 1;
      return new Promise(resolve => {
        resolveResponse = () => resolve({ ok: true, json: async () => "An orderly account" });
      });
    },
  });

  const first = store.load("Luke 1:1");
  const second = store.load("Luke 1:1");
  resolveResponse();

  assert.equal(await first, "An orderly account");
  assert.equal(await second, "An orderly account");
  assert.equal(requestCount, 1);
});

test("reading text store loads the full catalogue only when explicitly requested", async () => {
  const requests = [];
  const store = ReadingTextStore.create({
    assets: { "Luke 1:1": "luke.json" },
    assetUrl: path => `/mass/${path}?v=123`,
    fetchImpl: async url => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({ "Luke 1:1": "An orderly account" }),
      };
    },
  });

  assert.deepEqual(await store.loadAll(), { "Luke 1:1": "An orderly account" });
  assert.deepEqual(requests, ["/mass/data/generated/readings_text.json?v=123"]);
});
