const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const generatedOutputs = [
  "index.html",
  "StJames_Mass_Planner.html",
  "repertoire.html",
  "service-worker.js",
  "vendor/supabase.js",
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
    "/StJames_Mass_Planner.html",
    "/repertoire.html",
    "/service-worker.js",
    "/vendor/",
    "/icons/",
  ].forEach(pattern => assert.match(ignore, new RegExp(`^${pattern.replaceAll("/", "\\/")}$`, "m")));
});

test("reviewed generated lectionary data remains versioned build input", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files", "data/generated"],
    { cwd: root, encoding: "utf8" },
  ).trim().split("\n");
  assert.equal(tracked.includes("data/generated/readings_text.json"), true);
  assert.equal(tracked.includes("data/generated/sunday-calendar.json"), true);
});
