// The MASS_PLANNER_BUILD each generated application script sets for its page. The service worker announces these
// to open pages, and each Sentry release is named after one (`planner@<build>`), because
// that is what the page itself reports. Run directly, prints `surface=build` lines for
// $GITHUB_OUTPUT.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PAGES = Object.freeze({ planner: "app/planner.js", repertoire: "app/repertoire.js" });

function pageBuilds(root = ROOT) {
  return Object.fromEntries(Object.entries(PAGES).map(([surface, relativePath]) => {
    const script = fs.readFileSync(path.join(root, relativePath), "utf8");
    const build = script.match(/MASS_PLANNER_BUILD\s*=\s*"([0-9a-f]+)"/)?.[1];
    if (!build) throw new Error(`${relativePath} has no MASS_PLANNER_BUILD`);
    return [surface, build];
  }));
}

if (require.main === module) {
  Object.entries(pageBuilds()).forEach(([surface, build]) => console.log(`${surface}=${build}`));
}

module.exports = { pageBuilds };
