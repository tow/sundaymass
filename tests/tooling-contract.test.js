const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

test("the deployment gate includes source linting and Edge type-checking", () => {
  assert.equal(packageJson.scripts.lint, "node scripts/lint.js");
  assert.equal(
    packageJson.scripts["check:edge"],
    "deno check supabase/functions/semantic-songs/index.ts",
  );
  assert.match(packageJson.scripts.check, /npm run lint/);
  assert.match(packageJson.scripts.check, /npm run check:edge/);
  assert.match(packageJson.devDependencies.deno, /^\d+\.\d+\.\d+$/);
  assert.equal(
    fs.existsSync(path.join(root, "scripts", "lint.js")),
    true,
  );
  assert.equal(fs.existsSync(path.join(root, "deno.lock")), true);
});
