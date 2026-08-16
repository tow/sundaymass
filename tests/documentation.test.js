const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const requiredDocs = [
  "LICENSE.md",
  "README.md",
  "docs/architecture.md",
  "docs/data-model.md",
  "docs/lectionary.md",
  "docs/booklet-layout.md",
  "docs/testing.md",
  "docs/operations.md",
  "docs/decisions/README.md",
  "docs/decisions/001-private-song-lyrics.md",
  "docs/decisions/002-live-canonical-song-edits.md",
  "docs/decisions/003-soft-suggestion-parts.md",
  "docs/decisions/004-resolved-celebration-snapshots.md",
  "docs/decisions/005-offline-public-online-editing.md",
];

test("the repository states its proprietary source-code status", () => {
  const notice = fs.readFileSync(path.join(root, "LICENSE.md"), "utf8");
  assert.match(notice, /Copyright © 2026 \[Datamediate Oy\]\(https:\/\/www\.datamediate\.com\)/);
  assert.match(notice, /All rights reserved/);
  assert.match(notice, /does not grant/i);
});

test("the developer documentation inventory is complete", () => {
  requiredDocs.forEach(relativePath => {
    assert.equal(
      fs.existsSync(path.join(root, relativePath)),
      true,
      `${relativePath} must exist`,
    );
  });
});

test("relative Markdown links in developer documentation resolve", () => {
  requiredDocs.forEach(relativePath => {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const resolved = path.resolve(root, path.dirname(relativePath), target);
      assert.equal(
        fs.existsSync(resolved),
        true,
        `${relativePath} links to missing ${target}`,
      );
    }
  });
});

test("accepted decisions retain their rationale and consequences", () => {
  requiredDocs.filter(file => /\/\d{3}-/.test(file)).forEach(relativePath => {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(source, /^Status: Accepted$/m, relativePath);
    assert.match(source, /^## Context$/m, relativePath);
    assert.match(source, /^## Decision$/m, relativePath);
    assert.match(source, /^## Consequences$/m, relativePath);
  });
});
