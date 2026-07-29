const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const VERSIONED_ASSET_PATHS = Object.freeze([
  "supabase-config.js",
  "src/services/monitoring.js",
  "src/services/supabase-client.js",
  "src/services/plan-store.js",
  "src/services/repertoire-store.js",
  "vendor/supabase.js",
  "vendor/pptxgenjs.js",
  "vendor/jspdf.js",
  "vendor/sentry.js",
  "data/generated/readings_text.json",
]);

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildAssetVersions() {
  return Object.fromEntries(VERSIONED_ASSET_PATHS.map(relativePath => [
    relativePath,
    digest(fs.readFileSync(path.join(ROOT, relativePath))),
  ]));
}

function versionedUrl(relativePath, versions) {
  return `./${relativePath}?v=${versions[relativePath]}`;
}

function versionShellAssets(assets, versions) {
  return assets.map(asset => {
    const relativePath = asset.replace(/^\.\//, "");
    return versions[relativePath] ? `${asset}?v=${versions[relativePath]}` : asset;
  });
}

module.exports = {
  VERSIONED_ASSET_PATHS,
  buildAssetVersions,
  digest,
  versionedUrl,
  versionShellAssets,
};
