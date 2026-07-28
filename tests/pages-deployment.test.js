const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "verify.yml"),
  "utf8",
);

test("Pages deployment waits for verification and the production backend contract", () => {
  assert.match(
    workflow,
    /build-pages:\s*\n\s+if: github\.ref == 'refs\/heads\/main'.*push/s,
  );
  assert.match(
    workflow,
    /production-backend-contract:[\s\S]*needs: \[check, supabase-integration\]/,
  );
  assert.match(
    workflow,
    /production-backend-contract:[\s\S]*run: npm run smoke:backend/,
  );
  assert.doesNotMatch(workflow, /secrets\.SUPABASE|supabase db push --linked/);
  assert.match(workflow, /build-pages:[\s\S]*needs: production-backend-contract/);
  assert.match(workflow, /deploy-pages:[\s\S]*needs: build-pages/);
  assert.match(workflow, /production-smoke:[\s\S]*needs: deploy-pages/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: actions\/setup-node@v7/);
  assert.match(workflow, /uses: actions\/configure-pages@v6/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /uses: actions\/deploy-pages@v5/);
});

test("the Pages artifact contains only the explicit deployable surface", () => {
  const { PAGES_FILES } = require("../scripts/stage-pages.js");
  assert.deepEqual(PAGES_FILES, [
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
    "data/generated/readings_text.json",
    "icons/favicon-16.png",
    "icons/favicon-32.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
  ]);
  PAGES_FILES.forEach(file => {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  });
});
