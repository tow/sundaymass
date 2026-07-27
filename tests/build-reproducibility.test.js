const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

test("embedded DOCX core metadata is deterministic", () => {
  const { normalizeCoreProperties } = require(path.resolve(
    __dirname,
    "../scripts/docx-metadata.js",
  ));
  const first = [
    "<cp:coreProperties>",
    '<dcterms:created xsi:type="dcterms:W3CDTF">2026-07-27T12:00:00.000Z</dcterms:created>',
    '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-27T12:00:00.100Z</dcterms:modified>',
    "</cp:coreProperties>",
  ].join("");
  const second = first
    .replace("12:00:00.000Z", "13:45:10.500Z")
    .replace("12:00:00.100Z", "13:45:10.700Z");

  assert.equal(normalizeCoreProperties(first), normalizeCoreProperties(second));
  assert.match(normalizeCoreProperties(first), /2000-01-01T00:00:00\.000Z/);
});
