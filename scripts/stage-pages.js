const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, ".pages-site");
const PAGES_FILES = Object.freeze([
  "index.html",
  "repertoire.html",
  "about.html",
  "manifest.webmanifest",
  "service-worker.js",
  "favicon.ico",
  "supabase-config.js",
  "src/services/supabase-client.js",
  "src/services/plan-store.js",
  "src/services/repertoire-store.js",
  "vendor/supabase.js",
  "vendor/pptxgenjs.js",
  "vendor/jspdf.js",
  "data/generated/readings_text.json",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
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
  console.log(`staged ${PAGES_FILES.length} Pages assets`);
}

if (require.main === module) stagePages();

module.exports = { PAGES_FILES, stagePages };
