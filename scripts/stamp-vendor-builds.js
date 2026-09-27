// Stamps the page builds of this deployment into the deployment guard that heads each
// vendor bundle (see src/services/deployment-guard.js). Runs after build-app.js, which
// is what writes the builds; build-vendor.js leaves the token for it.
const fs = require("node:fs");
const path = require("node:path");
const { DEPLOYED_BUILDS_TOKEN, VENDOR_BUNDLE_PATHS } = require("./asset-versions.js");
const { pageBuilds } = require("./page-builds.js");

const ROOT = path.resolve(__dirname, "..");
const builds = JSON.stringify(Object.values(pageBuilds()));

VENDOR_BUNDLE_PATHS.forEach(relativePath => {
  const file = path.join(ROOT, relativePath);
  const contents = fs.readFileSync(file, "utf8");
  const first = contents.indexOf(DEPLOYED_BUILDS_TOKEN);
  if (first < 0) throw new Error(`${relativePath} has no ${DEPLOYED_BUILDS_TOKEN}`);
  if (contents.indexOf(DEPLOYED_BUILDS_TOKEN, first + DEPLOYED_BUILDS_TOKEN.length) >= 0) {
    throw new Error(`${relativePath} has more than one ${DEPLOYED_BUILDS_TOKEN}`);
  }
  fs.writeFileSync(file, contents.replace(DEPLOYED_BUILDS_TOKEN, () => builds));
});

console.log(`stamped ${builds} into ${VENDOR_BUNDLE_PATHS.length} vendor bundles`);
