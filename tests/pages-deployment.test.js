const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "verify.yml"),
  "utf8",
);

test("Pages deployment skips database integration when database files are unchanged", () => {
  assert.match(
    workflow,
    /changes:[\s\S]*git diff --quiet "\$BASE_SHA" "\$GITHUB_SHA" -- supabase\/ tests\/integration\//,
  );
  assert.match(
    workflow,
    /supabase-integration:\s*\n\s+needs: changes\s*\n\s+if: needs\.changes\.outputs\.database == 'true'/,
  );
  assert.match(
    workflow,
    /build-pages:\s*\n\s+if: github\.ref == 'refs\/heads\/main'.*push/s,
  );
  assert.match(
    workflow,
    /production-backend-contract:[\s\S]*needs: \[check, supabase-integration, migrate-production\]/,
  );
  assert.match(
    workflow,
    /production-backend-contract:[\s\S]*run: npm run smoke:backend/,
  );
  assert.match(
    workflow,
    /needs\.supabase-integration\.result == 'skipped'/,
  );
  assert.match(
    workflow,
    /production-backend-contract:[\s\S]*needs\.migrate-production\.result == 'skipped'/,
  );
});

test("production migrations run from CI only for a passing database change on main", () => {
  const job = workflow.match(/migrate-production:[\s\S]*?\n  production-backend-contract:/)?.[0];
  assert.ok(job, "migrate-production job precedes production-backend-contract");
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /needs\.changes\.outputs\.database == 'true'/);
  assert.match(job, /needs\.check\.result == 'success'/);
  assert.match(job, /needs\.supabase-integration\.result == 'success'/);
  assert.match(job, /needs: \[changes, check, supabase-integration, production-preflight\]/);
  assert.match(job, /needs\.production-preflight\.result == 'success'/);
  assert.match(job, /environment: production-database/);
  assert.match(job, /concurrency:\s*\n\s+group: production-database\s*\n\s+cancel-in-progress: false/);
  assert.match(job, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  // The access token is the only credential: the CLI mints its own short-lived login
  // role from it, so no database password is needed or held.
  assert.doesNotMatch(job, /SUPABASE_DB_PASSWORD|SUPABASE_DB_URL/);
  assert.match(job, /supabase link --project-ref igeeigohcupcxakmlxno/);
  assert.match(job, /supabase db push --linked --dry-run[\s\S]*supabase db push --linked\s*\n/);
  assert.doesNotMatch(job, /--include-seed|db reset/);
  // Destructive (contract) migrations pending in production are refused before
  // db push unless a manual release opted in; the guard fails closed.
  assert.match(
    workflow,
    /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+allow_contract_migrations:[\s\S]*?type: boolean\s*\n\s+default: false/,
  );
  const guard = job.match(/- name: Refuse to apply contract migrations[\s\S]*?- name: Preview pending migrations/)?.[0];
  assert.ok(guard, "the contract guard runs before the migration preview");
  assert.match(guard, /if: \$\{\{ !inputs\.allow_contract_migrations \}\}/);
  assert.match(
    guard,
    /node scripts\/check-migration-rollout\.js --pending --reject-contract\s*\n?\s*< migration-list\.txt/,
  );
  // The listing is captured and printed before anything parses it, so a parsing
  // failure names its own cause instead of costing another CI round trip.
  assert.match(job, /supabase migration list --linked > migration-list\.txt 2>&1/);
  assert.match(job, /cat migration-list\.txt/);
  assert.match(job, /uses: actions\/setup-node@v7/);
  // Only migrate-production may push migrations. The read-only preflight also holds the
  // credential, so credentials are allowed in exactly those two jobs — both gated on the
  // production-database environment — and nowhere else.
  const preflight = workflow.match(/production-preflight:[\s\S]*?(?=\n  migrate-production:)/)?.[0];
  assert.ok(preflight, "production-preflight job precedes migrate-production");
  assert.match(preflight, /environment: production-database/);
  assert.match(preflight, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.doesNotMatch(preflight, /supabase db push|--include-seed|db reset/);
  const elsewhere = workflow.replace(job, "").replace(preflight, "");
  assert.doesNotMatch(elsewhere, /secrets\.SUPABASE|supabase db push/);
  assert.match(workflow, /build-pages:[\s\S]*needs: check/);
  assert.match(
    workflow,
    /deploy-pages:[\s\S]*needs: \[build-pages, production-backend-contract\]/,
  );
  assert.match(
    workflow,
    /deploy-pages:[\s\S]*always\(\)[\s\S]*needs\.build-pages\.result == 'success'[\s\S]*needs\.production-backend-contract\.result == 'success'/,
  );
  assert.match(
    workflow,
    /production-smoke:[\s\S]*needs: deploy-pages[\s\S]*always\(\) && needs\.deploy-pages\.result == 'success'/,
  );
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
  assert.match(workflow, /uses: actions\/checkout@v7/);
  assert.match(workflow, /uses: actions\/setup-node@v7/);
  assert.match(workflow, /uses: actions\/configure-pages@v6/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /uses: actions\/deploy-pages@v5/);
});

test("the Pages artifact contains only the explicit deployable surface", () => {
  const { PAGES_DIRECTORIES, PAGES_FILES } = require("../scripts/stage-pages.js");
  assert.deepEqual(PAGES_FILES, [
    "index.html",
    "repertoire.html",
    "about.html",
    "september-music.html",
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
  PAGES_FILES.forEach(file => {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  });
  assert.deepEqual(PAGES_DIRECTORIES, ["data/readings"]);
  PAGES_DIRECTORIES.forEach(directory => {
    assert.equal(fs.existsSync(path.join(root, directory)), true, `${directory} must exist`);
  });
});

test("every service-worker precache asset is part of the deployed Pages surface", () => {
  const { PAGES_DIRECTORIES, PAGES_FILES } = require("../scripts/stage-pages.js");
  const assets = JSON.parse(
    fs.readFileSync(path.join(root, "src", "service-worker-assets.json"), "utf8"),
  );
  assets
    .filter(asset => asset !== "./")
    .forEach(asset => {
      assert.equal(
        PAGES_FILES.includes(asset.replace(/^\.\//, ""))
          || PAGES_DIRECTORIES.some(directory =>
            asset.replace(/^\.\//, "").startsWith(`${directory}/`)),
        true,
        `${asset} is precached by the service worker but not staged for Pages`,
      );
    });
});
