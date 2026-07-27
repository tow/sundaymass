const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("the build has one canonical planner entry point", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "index.html")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "StJames_Mass_Planner.html")), false);
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
    "@@PLAN_SESSION_CONTROLLER_JS@@",
    "@@PLANNER_STATE_JS@@",
    "@@SONG_FORM_JS@@",
    "@@PRINT_CONTROLLER_JS@@",
    "@@MUSIC_PARTS_JS@@",
    "@@SONG_PRESENTATION_JS@@",
    "@@MUSIC_PLAN_VIEW_JS@@",
    "@@READING_PLAN_VIEW_JS@@",
    "@@READING_EDITOR_VIEW_JS@@",
    "@@SONG_PICKER_VIEW_JS@@",
    "@@SONG_PICKER_CONTROLLER_JS@@",
    "@@SONG_MUTATION_CONTROLLER_JS@@",
    "@@SONG_WORKFLOW_JS@@",
    "@@CELEBRATION_PICKER_VIEW_JS@@",
    "@@CELEBRATION_CONTROLLER_JS@@",
    "@@READING_OVERRIDE_CONTROLLER_JS@@",
    "@@READING_DIALOG_CONTROLLER_JS@@",
    "@@READING_WORKFLOW_JS@@",
    "@@SONG_CATALOG_JS@@",
    "@@PLAN_MUSIC_DATA_JS@@",
    "@@LECTIONARY_CATALOG_JS@@",
    "@@READING_SELECTION_JS@@",
    "@@CALENDAR@@",
    "@@SUNDAY_LECTIONARY@@",
    "@@CELEBRATIONS@@",
    "@@COMMONS@@",
    "@@READINGS@@",
  ].forEach(token => assert.ok(!html.includes(token), `${token} must be resolved by the build`));
});

test("external application assets referenced by the planner exist", () => {
  const html = read("index.html");
  const localScripts = [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(localScripts, [
    "supabase-config.js",
    "src/services/supabase-client.js",
    "src/services/plan-store.js",
  ]);
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
  assert.deepEqual(localScripts, [
    "supabase-config.js",
    "src/services/supabase-client.js",
    "src/services/repertoire-store.js",
  ]);
  localScripts.forEach(relativePath => {
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `${relativePath} must exist`);
  });
});

test("the Supabase browser client is pinned, built locally, and cached for offline startup", () => {
  const packageJson = JSON.parse(read("package.json"));
  const planStore = read("src/services/plan-store.js");
  const repertoireStore = read("src/services/repertoire-store.js");
  const sharedClient = read("src/services/supabase-client.js");
  const serviceWorker = read("service-worker.js");
  const bundlePath = path.join(ROOT, "vendor/supabase.js");

  assert.match(packageJson.dependencies["@supabase/supabase-js"], /^\d+\.\d+\.\d+$/);
  assert.ok(fs.existsSync(bundlePath));
  const importCheck = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--eval",
      `import(${JSON.stringify(bundlePath)}).then(module => {`
        + `if (typeof module.createClient !== "function") process.exit(1);`
        + `});`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(importCheck.status, 0, importCheck.stderr);
  assert.doesNotMatch(planStore, /https?:\/\/|cdn\.jsdelivr/);
  assert.doesNotMatch(repertoireStore, /https?:\/\/|cdn\.jsdelivr/);
  assert.doesNotMatch(planStore, /vendor\/supabase\.js/);
  assert.doesNotMatch(repertoireStore, /vendor\/supabase\.js/);
  assert.match(sharedClient, /vendor\/supabase\.js/);
  assert.match(sharedClient, /document\.baseURI/);
  assert.doesNotMatch(planStore, /document\.baseURI|document\.currentScript/);
  assert.doesNotMatch(repertoireStore, /document\.baseURI|document\.currentScript/);
  assert.match(serviceWorker, /"\.\/vendor\/supabase\.js"/);
});
