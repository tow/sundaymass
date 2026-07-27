const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const generatedOutputs = [
  "index.html",
  "repertoire.html",
  "service-worker.js",
  "favicon.ico",
  "vendor/supabase.js",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

test("deployable build outputs are generated and ignored rather than versioned", () => {
  const tracked = new Set(
    execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
      .trim()
      .split("\n"),
  );
  generatedOutputs.forEach(relativePath => {
    assert.equal(
      tracked.has(relativePath),
      false,
      `${relativePath} must be built by CI, not tracked`,
    );
    assert.equal(
      fs.existsSync(path.join(root, relativePath)),
      true,
      `${relativePath} must exist after npm run build`,
    );
  });

  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  [
    "/index.html",
    "/repertoire.html",
    "/service-worker.js",
    "/favicon.ico",
    "/vendor/",
    "/icons/",
  ].forEach(pattern => assert.match(ignore, new RegExp(`^${pattern.replaceAll("/", "\\/")}$`, "m")));
});

test("the retired planner alias is neither generated nor silently ignored", () => {
  assert.equal(fs.existsSync(path.join(root, "StJames_Mass_Planner.html")), false);
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.doesNotMatch(ignore, /^\/StJames_Mass_Planner\.html$/m);
});

test("reviewed generated lectionary data remains versioned build input", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "data/generated"],
    { cwd: root, encoding: "utf8" },
  ).trim().split("\n");
  assert.equal(tracked.includes("data/generated/readings_text.json"), true);
  assert.equal(tracked.includes("data/generated/sunday-lectionary.json"), true);
  assert.equal(fs.existsSync(path.join(root, "data/generated/sunday-calendar.json")), false);
});
