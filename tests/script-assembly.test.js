const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decodes the line-level mappings the assembler writes: one segment per generated line.
function originalLines(map) {
  let source = 0;
  let line = 0;
  return map.mappings.split(";").map(segment => {
    const values = [];
    let value = 0;
    let shift = 0;
    for (const character of segment) {
      const digit = BASE64.indexOf(character);
      value += (digit & 31) << shift;
      if (digit & 32) {
        shift += 5;
      } else {
        values.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = 0;
        shift = 0;
      }
    }
    source += values[1];
    line += values[2];
    return { source, line };
  });
}

// A stack frame is only as good as this correspondence: every generated line must be the
// line it claims to come from, in every module, or monitoring names the wrong code.
for (const page of ["planner", "repertoire"]) {
  test(`every line of the ${page} script maps to the identical line of its source`, () => {
    const script = fs.readFileSync(path.join(ROOT, `app/${page}.js`), "utf8");
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, `app/${page}.js.map`), "utf8"));
    const generated = script.split("\n");
    const origins = originalLines(map);
    const sourceLines = map.sourcesContent.map(content => content.split("\n"));
    let substituted = 0;

    assert.equal(map.sources[0], `../src/app/${page}.js`);
    map.sources.forEach((source, index) => assert.equal(
      map.sourcesContent[index],
      fs.readFileSync(path.join(ROOT, "app", source), "utf8"),
      `${source} must be embedded as it is in the repository`,
    ));
    origins.forEach(({ source, line }, index) => {
      const original = sourceLines[source][line];
      if (original === generated[index]) return;
      // Only the entry template's value tokens (data, versions) differ from their source.
      assert.equal(source, 0, `line ${index + 1} must match ${map.sources[source]}:${line + 1}`);
      assert.match(original, /@@[A-Z_]+@@/);
      substituted += 1;
    });
    assert.ok(substituted > 0);
    assert.ok(origins.length >= generated.length - 2, "the map covers the whole script");
  });
}
