const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("the planner has a dedicated A4 print document with reliable break rules", () => {
  const html = read("src/planner.html");
  const styles = read("src/styles/planner.css");
  const app = read("src/app/planner.js");

  assert.match(html, /id="printSheet"/);
  assert.match(styles, /@media print/);
  assert.match(styles, /@page\{ size:A4;/);
  assert.match(styles, /body > :not\(#printSheet\)\{ display:none!important;/);
  assert.match(styles, /\.print-music-row\{[^}]*break-inside:avoid/);
  assert.match(styles, /\.print-reading-pages\{[^}]*break-before:page/);
  assert.match(app, /PrintController\.create/);
  assert.match(app, /printController\.print\("music"\)/);
  assert.match(app, /printController\.print\("music-readings"\)/);
});

test("DOCX generation and its build dependency are removed", () => {
  const packageJson = JSON.parse(read("package.json"));
  const build = read("scripts/build-app.js");
  const app = read("src/app/planner.js");

  assert.equal(packageJson.dependencies.docx, undefined);
  assert.doesNotMatch(packageJson.scripts.build, /make_template/);
  assert.doesNotMatch(build, /DOCX|PARTS2|embeddedTemplateParts/);
  assert.doesNotMatch(app, /createDocxExporter|downloadWord/);
  assert.equal(fs.existsSync(path.join(ROOT, "src/export/docx.js")), false);
});
