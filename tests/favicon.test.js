const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath));
const readText = relativePath => read(relativePath).toString("utf8");

function pngDimensions(buffer) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("every public page declares browser and Apple icons", () => {
  ["src/planner.html", "src/repertoire.html", "about.html"].forEach(relativePath => {
    const html = readText(relativePath);
    assert.match(html, /rel="icon" href="favicon\.ico"/);
    assert.match(html, /rel="icon" type="image\/png" sizes="32x32" href="icons\/favicon-32\.png"/);
    assert.match(html, /rel="icon" type="image\/png" sizes="16x16" href="icons\/favicon-16\.png"/);
    assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon\.png"/);
  });
});

test("generated favicon files contain the declared image sizes", () => {
  assert.deepEqual(pngDimensions(read("icons/favicon-16.png")), {
    width: 16,
    height: 16,
  });
  assert.deepEqual(pngDimensions(read("icons/favicon-32.png")), {
    width: 32,
    height: 32,
  });

  const ico = read("favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  const sizes = [];
  for (let index = 0; index < 2; index += 1) {
    const entry = 6 + index * 16;
    const size = ico[entry] || 256;
    const bytes = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + bytes <= ico.length);
    assert.deepEqual(pngDimensions(ico.subarray(offset, offset + bytes)), {
      width: size,
      height: size,
    });
    sizes.push(size);
  }
  assert.deepEqual(sizes, [16, 32]);
});

test("favicon assets are part of both the offline shell and Pages artifact", () => {
  const expected = [
    "./favicon.ico",
    "./icons/favicon-16.png",
    "./icons/favicon-32.png",
  ];
  const shell = JSON.parse(readText("src/service-worker-assets.json"));
  expected.forEach(asset => assert.equal(shell.includes(asset), true));

  const { PAGES_FILES } = require("../scripts/stage-pages.js");
  expected
    .map(asset => asset.replace(/^\.\//, ""))
    .forEach(asset => assert.equal(PAGES_FILES.includes(asset), true));
});
