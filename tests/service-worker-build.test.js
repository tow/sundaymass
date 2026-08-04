const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAssetVersions,
  versionShellAssets,
} = require("../scripts/asset-versions.js");

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function expectedVersion(template, assets) {
  const hash = crypto.createHash("sha256");
  hash.update(template.replace("@@CACHE_VERSION@@", ""));
  hash.update(JSON.stringify(assets));
  assets.forEach(asset => {
    const relativePath = asset === "./"
      ? "index.html"
      : asset.replace(/^\.\//, "").replace(/\?v=[^&]+$/, "");
    hash.update(asset);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(ROOT, relativePath)));
    hash.update("\0");
  });
  return hash.digest("hex").slice(0, 12);
}

test("the generated service-worker cache version represents its complete app shell", () => {
  const template = read("src/service-worker.js");
  const assets = versionShellAssets(
    JSON.parse(read("src/service-worker-assets.json")),
    buildAssetVersions(),
  );
  const generated = read("service-worker.js");
  const version = expectedVersion(template, assets);

  assert.match(template, /@@CACHE_VERSION@@/);
  assert.match(template, /@@APP_SHELL@@/);
  assert.match(generated, new RegExp(`st-james-mass-planner-${version}`));
  assert.doesNotMatch(generated, /@@(?:CACHE_VERSION|APP_SHELL)@@/);
  assets.forEach(asset => assert.ok(
    generated.includes(JSON.stringify(asset)),
    `${asset} must be in the generated app shell`,
  ));
});

test("the offline shell uses the same versioned URLs as generated pages", () => {
  const generated = read("service-worker.js");
  const planner = read("index.html");
  const repertoire = read("repertoire.html");
  const scriptUrls = [...(planner + repertoire).matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map(match => match[1]);

  scriptUrls.forEach(url => assert.ok(
    generated.includes(JSON.stringify(url)),
    `${url} must be in the generated app shell`,
  ));
  ["vendor/supabase.js"].forEach(pathname => {
    assert.match(generated, new RegExp(`\\.\\/${pathname.replace(".", "\\.")}\\?v=[0-9a-f]{12}`));
  });
});

test("failed navigation responses never replace a cached app-shell document", () => {
  const template = read("src/service-worker.js");
  const navigationBranch = template.slice(
    template.indexOf('if (event.request.mode === "navigate")'),
    template.indexOf("return;\n  }", template.indexOf('if (event.request.mode === "navigate")')),
  );

  assert.match(navigationBranch, /if \(response\.ok\) \{[\s\S]*cache\.put\(cacheTarget, copy\)/);
});

test("the full reading catalogue is not downloaded in the offline app shell", () => {
  const assets = JSON.parse(read("src/service-worker-assets.json"));
  const template = read("src/service-worker.js");

  assert.equal(assets.includes("./data/generated/readings_text.json"), false);
  assert.match(template, /cache\.put\(event\.request, copy\)/);
});

test("authorized export and monitoring bundles are fetched only when requested", () => {
  const assets = JSON.parse(read("src/service-worker-assets.json"));

  [
    "./vendor/pptxgenjs.js",
    "./vendor/jspdf.js",
    "./vendor/sentry.js",
  ].forEach(asset => assert.equal(assets.includes(asset), false));
});
