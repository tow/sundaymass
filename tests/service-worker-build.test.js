const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function expectedVersion(template, assets) {
  const hash = crypto.createHash("sha256");
  hash.update(template.replace("@@CACHE_VERSION@@", ""));
  hash.update(JSON.stringify(assets));
  assets.forEach(asset => {
    const relativePath = asset === "./" ? "index.html" : asset.replace(/^\.\//, "");
    hash.update(asset);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(ROOT, relativePath)));
    hash.update("\0");
  });
  return hash.digest("hex").slice(0, 12);
}

test("the generated service-worker cache version represents its complete app shell", () => {
  const template = read("src/service-worker.js");
  const assets = JSON.parse(read("src/service-worker-assets.json"));
  const generated = read("service-worker.js");
  const version = expectedVersion(template, assets);

  assert.match(template, /@@CACHE_VERSION@@/);
  assert.match(template, /@@APP_SHELL@@/);
  assert.match(generated, new RegExp(`st-james-mass-planner-${version}`));
  assert.doesNotMatch(generated, /@@(?:CACHE_VERSION|APP_SHELL)@@/);
  assets.forEach(asset => assert.match(generated, new RegExp(JSON.stringify(asset))));
});

test("failed navigation responses never replace a cached app-shell document", () => {
  const template = read("src/service-worker.js");
  const navigationBranch = template.slice(
    template.indexOf('if (event.request.mode === "navigate")'),
    template.indexOf("return;\n  }", template.indexOf('if (event.request.mode === "navigate")')),
  );

  assert.match(navigationBranch, /if \(response\.ok\) \{[\s\S]*cache\.put\(cacheTarget, copy\)/);
});
