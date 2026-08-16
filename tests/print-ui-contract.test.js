const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("the planner no longer offers music-plan print actions", () => {
  const html = read("src/planner.html");
  const styles = read("src/styles/planner.css");
  const app = read("src/app/planner.js");

  assert.doesNotMatch(html, /id="printMusic(?:Readings)?"/);
  assert.doesNotMatch(html, /id="printSheet"/);
  assert.doesNotMatch(styles, /@media print/);
  assert.doesNotMatch(app, /PrintController|@@PRINT_CONTROLLER_JS@@/);
});

test("authorized choir members can download an imposed folded lyrics booklet PDF", () => {
  const html = read("src/planner.html");
  const styles = read("src/styles/planner.css");
  const app = read("src/app/planner.js");

  assert.match(html, /id="printLyricsBooklet">Download folded lyrics booklet \(PDF\)/);
  // The booklet is a generated PDF now — no print stylesheet may remain for it.
  assert.doesNotMatch(styles, /@page booklet|booklet-sheet|data-print-mode/);
  assert.match(app, /LyricsBookletController\.create/);
  assert.match(app, /LyricsBooklet,/);
  assert.match(app, /canReadLyrics:\(\)=>canReadLyrics/);
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
  assert.equal(
    fs.readdirSync(ROOT).some(file => file.toLowerCase().endsWith(".docx")),
    false,
  );
  assert.match(read(".gitignore"), /^\*\.docx$/m);
});
