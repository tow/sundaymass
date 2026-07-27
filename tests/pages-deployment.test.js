const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "verify.yml"),
  "utf8",
);

test("Pages deployment waits for both verification jobs", () => {
  assert.match(
    workflow,
    /build-pages:\s*\n\s+if: github\.ref == 'refs\/heads\/main'.*push/s,
  );
  assert.match(workflow, /build-pages:[\s\S]*needs: \[check, supabase-integration\]/);
  assert.match(workflow, /deploy-pages:[\s\S]*needs: build-pages/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /uses: actions\/deploy-pages@v4/);
});

test("the Pages artifact contains only the explicit deployable surface", () => {
  const { PAGES_FILES } = require("../scripts/stage-pages.js");
  assert.deepEqual(PAGES_FILES, [
    "index.html",
    "StJames_Mass_Planner.html",
    "repertoire.html",
    "about.html",
    "manifest.webmanifest",
    "service-worker.js",
    "supabase-config.js",
    "src/services/plan-store.js",
    "src/services/repertoire-store.js",
    "vendor/supabase.js",
    "data/generated/readings_text.json",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
  ]);
  PAGES_FILES.forEach(file => {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  });
});
