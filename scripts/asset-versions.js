const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const VENDOR_BUNDLE_PATHS = Object.freeze([
  "vendor/supabase.js",
  "vendor/pptxgenjs.js",
  "vendor/jspdf.js",
  "vendor/sentry.js",
]);
const VERSIONED_ASSET_PATHS = Object.freeze([
  "supabase-config.js",
  "src/services/monitoring.js",
  "src/services/supabase-client.js",
  "src/services/plan-store.js",
  "src/services/repertoire-store.js",
  ...VENDOR_BUNDLE_PATHS,
  "data/generated/readings_text.json",
]);

// Each vendor bundle opens with the deployment guard, which stamp-vendor-builds.js fills
// with this deployment's page builds after the application scripts are written. The
// builds change with every deployment while the bundle does not, so an asset version
// is taken over the bundle as build-vendor.js wrote it, with the token still in place.
const DEPLOYED_BUILDS_TOKEN = "@@APP_BUILDS@@";
const STAMPED_BUILDS = /reloadIfBehind\(\{ builds: \[[^\]]*\] \}\)/;

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function unstamped(contents) {
  return contents.replace(STAMPED_BUILDS, `reloadIfBehind({ builds: ${DEPLOYED_BUILDS_TOKEN} })`);
}

function assetVersion(relativePath) {
  const file = path.join(ROOT, relativePath);
  return VENDOR_BUNDLE_PATHS.includes(relativePath)
    ? digest(unstamped(fs.readFileSync(file, "utf8")))
    : digest(fs.readFileSync(file));
}

function buildAssetVersions() {
  return Object.fromEntries(VERSIONED_ASSET_PATHS.map(relativePath => [
    relativePath,
    assetVersion(relativePath),
  ]));
}

// The application scripts are generated from everything above, so they are versioned
// after the build writes them rather than embedded in themselves.
const APP_SCRIPT_PATHS = Object.freeze(["app/planner.js", "app/repertoire.js"]);

function buildShellVersions() {
  return {
    ...buildAssetVersions(),
    ...Object.fromEntries(APP_SCRIPT_PATHS.map(relativePath => [
      relativePath,
      digest(fs.readFileSync(path.join(ROOT, relativePath))),
    ])),
  };
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
  APP_SCRIPT_PATHS,
  DEPLOYED_BUILDS_TOKEN,
  VENDOR_BUNDLE_PATHS,
  VERSIONED_ASSET_PATHS,
  buildAssetVersions,
  buildShellVersions,
  digest,
  versionedUrl,
  versionShellAssets,
};
