const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("both generated planner entry points are identical", () => {
  assert.equal(read("index.html"), read("StJames_Mass_Planner.html"));
});

test("the assembled inline application script parses", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(script => script.trim());
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
});

test("the generated planner contains no unresolved build tokens", () => {
  const html = read("index.html");
  [
    "@@STYLES@@",
    "@@APP_SCRIPT@@",
    "@@MODAL_CONTROLLER_JS@@",
    "@@PWA_CONTROLLER_JS@@",
    "@@CALENDAR_NAVIGATION_JS@@",
    "@@AUTH_CONTROLLER_JS@@",
    "@@SONG_FORM_JS@@",
    "@@MUSIC_PARTS_JS@@",
    "@@SONG_PRESENTATION_JS@@",
    "@@SONG_CATALOG_JS@@",
    "@@PLAN_MUSIC_DATA_JS@@",
    "@@LECTIONARY_CATALOG_JS@@",
    "@@CALENDAR@@",
    "@@SUNDAY_LECTIONARY@@",
    "@@CELEBRATIONS@@",
    "@@COMMONS@@",
    "@@PARTS@@",
    "@@PARTS2@@",
    "@@READINGS@@",
    "@@DOCX_EXPORT_JS@@",
  ].forEach(token => assert.ok(!html.includes(token), `${token} must be resolved by the build`));
});

test("external application assets referenced by the planner exist", () => {
  const html = read("index.html");
  const localScripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(localScripts, ["supabase-config.js", "src/services/plan-store.js"]);
  localScripts.forEach(relativePath => {
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `${relativePath} must exist`);
  });
});

test("the generated repertoire application parses and has no unresolved build tokens", () => {
  const html = read("repertoire.html");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(script => script.trim());

  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
  [
    "@@STYLES@@",
    "@@APP_SCRIPT@@",
    "@@MUSIC_PARTS_JS@@",
    "@@PWA_CONTROLLER_JS@@",
    "@@AUTH_CONTROLLER_JS@@",
    "@@SONG_FORM_JS@@",
    "@@SONG_PRESENTATION_JS@@",
    "@@SONG_CATALOG_JS@@",
  ]
    .forEach(token => assert.ok(!html.includes(token), `${token} must be resolved by the build`));
});

test("external application assets referenced by the repertoire exist", () => {
  const html = read("repertoire.html");
  const localScripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(localScripts, ["supabase-config.js", "src/services/repertoire-store.js"]);
  localScripts.forEach(relativePath => {
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `${relativePath} must exist`);
  });
});
