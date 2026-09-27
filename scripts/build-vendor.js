const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const { DEPLOYED_BUILDS_TOKEN } = require("./asset-versions.js");

const ROOT = path.resolve(__dirname, "..");
const outputDirectory = path.join(ROOT, "vendor");
fs.mkdirSync(outputDirectory, { recursive: true });

// Every bundle opens with the deployment guard, so that an old page still fetching our
// bundles reloads onto the current deployment. stamp-vendor-builds.js fills the token
// once the application scripts, and so the builds, exist.
const guard = fs.readFileSync(path.join(ROOT, "src/services/deployment-guard.js"), "utf8");
const banner = `${guard}DeploymentGuard.reloadIfBehind({ builds: ${DEPLOYED_BUILDS_TOKEN} });\n`;

function buildBundle({ name, contents, sourcefile }) {
  const outputFile = path.join(outputDirectory, `${name}.js`);
  esbuild.buildSync({
    stdin: {
      contents,
      loader: "js",
      resolveDir: ROOT,
      sourcefile,
    },
    outfile: outputFile,
    banner: { js: banner },
    bundle: true,
    charset: "utf8",
    format: "esm",
    legalComments: "eof",
    minify: true,
    platform: "browser",
    sourcemap: true,
    target: ["es2020"],
  });
  const size = Math.round(fs.statSync(outputFile).size / 1024);
  console.log(`written ${size} KB local ${name} bundle`);
}

buildBundle({
  name: "supabase",
  contents: 'export { createClient } from "@supabase/supabase-js";',
  sourcefile: "supabase-entry.js",
});
buildBundle({
  name: "pptxgenjs",
  contents: 'export { default } from "pptxgenjs";',
  sourcefile: "pptxgenjs-entry.js",
});
buildBundle({
  name: "jspdf",
  contents: 'export { jsPDF } from "jspdf";',
  sourcefile: "jspdf-entry.js",
});
buildBundle({
  name: "sentry",
  contents: `export {
    init,
    captureException,
    inboundFiltersIntegration,
    browserApiErrorsIntegration,
    globalHandlersIntegration,
    linkedErrorsIntegration,
    dedupeIntegration,
    logger,
    setUser
  } from "@sentry/browser";`,
  sourcefile: "sentry-entry.js",
});
