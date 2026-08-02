const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, ".pages-site");
const PAGES_FILES = Object.freeze([
  "index.html",
  "repertoire.html",
  "about.html",
  "august-music.html",
  "manifest.webmanifest",
  "service-worker.js",
  "favicon.ico",
  "supabase-config.js",
  "src/services/monitoring.js",
  "src/services/supabase-client.js",
  "src/services/plan-store.js",
  "src/services/repertoire-store.js",
  "vendor/supabase.js",
  "vendor/supabase.js.map",
  "vendor/pptxgenjs.js",
  "vendor/pptxgenjs.js.map",
  "vendor/jspdf.js",
  "vendor/jspdf.js.map",
  "vendor/sentry.js",
  "vendor/sentry.js.map",
  "data/generated/readings_text.json",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
]);
const PAGES_DIRECTORIES = Object.freeze([
  "data/readings",
]);

function stagePages() {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  PAGES_FILES.forEach(relativePath => {
    const source = path.join(ROOT, relativePath);
    const target = path.join(OUTPUT, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing Pages asset: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  });
  PAGES_DIRECTORIES.forEach(relativePath => {
    const source = path.join(ROOT, relativePath);
    const target = path.join(OUTPUT, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing Pages asset directory: ${relativePath}`);
    }
    fs.cpSync(source, target, { recursive: true });
  });
  console.log(
    `staged ${PAGES_FILES.length} Pages assets and ${PAGES_DIRECTORIES.length} asset directory`,
  );
}

if (require.main === module) stagePages();

module.exports = { PAGES_DIRECTORIES, PAGES_FILES, stagePages };
