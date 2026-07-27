const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

test("automatic embedding repair makes one bounded pass", async () => {
  const helperPath = path.resolve(__dirname, "../src/domain/embedding-repair.js");
  const { repairStaleSongsOnce } = require(helperPath);
  const batches = [];
  let statusReads = 0;

  const result = await repairStaleSongsOnce(
    { staleSongIds: ["a", "b", "c", "d", "e"] },
    async ids => batches.push(ids),
    async () => {
      statusReads++;
      return { staleSongIds: ["e"] };
    },
    2,
  );

  assert.deepEqual(batches, [["a", "b"], ["c", "d"], ["e"]]);
  assert.equal(statusReads, 1);
  assert.deepEqual(result.staleSongIds, ["e"]);
});

test("automatic embedding repair does nothing when the index is current", async () => {
  const helperPath = path.resolve(__dirname, "../src/domain/embedding-repair.js");
  const { repairStaleSongsOnce } = require(helperPath);
  let syncCalls = 0;
  let statusReads = 0;

  const initial = { staleSongIds: [] };
  const result = await repairStaleSongsOnce(
    initial,
    async () => { syncCalls++; },
    async () => { statusReads++; return {}; },
  );

  assert.equal(result, initial);
  assert.equal(syncCalls, 0);
  assert.equal(statusReads, 0);
});
