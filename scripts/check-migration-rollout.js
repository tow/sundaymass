const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_DIRECTORY = "supabase/migrations/";
const DESTRUCTIVE_PATTERNS = Object.freeze([
  ["DROP TABLE", /\bdrop\s+table\b/i],
  ["DROP COLUMN", /\bdrop\s+column\b/i],
  ["DROP FUNCTION", /\bdrop\s+function\b/i],
  ["DROP VIEW", /\bdrop\s+(?:materialized\s+)?view\b/i],
  ["DROP TYPE", /\bdrop\s+type\b/i],
  ["RENAME", /\balter\s+(?:table|type)\b[\s\S]*?\brename\b/i],
  ["ALTER COLUMN TYPE", /\balter\s+column\b[\s\S]*?\btype\b/i],
  ["TRUNCATE", /\btruncate\b/i],
  ["DELETE FROM", /\bdelete\s+from\b/i],
  ["REVOKE", /\brevoke\b/i],
]);

function rolloutPhase(sql) {
  return sql.match(/^\s*--\s*rollout:\s*(expand|contract)\s*$/im)?.[1] || "";
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function destructiveOperations(sql) {
  const executableSql = sqlWithoutComments(sql);
  return DESTRUCTIVE_PATTERNS
    .filter(([, pattern]) => pattern.test(executableSql))
    .map(([label]) => label);
}

function validateMigration(filename, sql, { rejectContract = false } = {}) {
  const phase = rolloutPhase(sql);
  const destructive = destructiveOperations(sql);
  const problems = [];
  if (!phase) {
    problems.push("add `-- rollout: expand` or `-- rollout: contract`");
  }
  if (destructive.length && phase !== "contract") {
    problems.push(
      `destructive operations (${destructive.join(", ")}) require \`-- rollout: contract\``,
    );
  }
  if (rejectContract && phase === "contract") {
    problems.push(
      "contract migrations require a manual production release with "
      + "`allow_contract_migrations=true` after the compatibility window",
    );
  }
  return problems.map(problem => `${filename}: ${problem}`);
}

function changedMigrations(base) {
  if (base === "WORKTREE") {
    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", MIGRATION_DIRECTORY],
      { cwd: ROOT, encoding: "utf8" },
    );
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard", MIGRATION_DIRECTORY],
      { cwd: ROOT, encoding: "utf8" },
    );
    return [...new Set(`${changed}\n${untracked}`.split("\n"))]
      .filter(filename => filename.endsWith(".sql"));
  }
  const args = base && !/^0+$/.test(base)
    ? ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`, "--", MIGRATION_DIRECTORY]
    : ["ls-files", MIGRATION_DIRECTORY];
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(filename => filename.endsWith(".sql"));
}

// `supabase migration list` reports one row per migration, with a local version, a
// remote version, or both. A row with a local version and no remote one is what
// `db push` would apply. The CLI prints a LOCAL │ REMOTE │ TIME table to a terminal
// but JSON whenever its output is redirected, which is always the case in CI, so both
// shapes are read here. Anything that parses as neither is treated as "unknown", which
// the guard must fail closed on rather than silently apply.
function migrationRows(listOutput) {
  const text = String(listOutput || "");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.migrations)) {
      return parsed.migrations.map(row => ({
        local: String(row?.local || ""),
        remote: String(row?.remote || ""),
      }));
    }
  } catch {
    // Not the JSON form; fall through to the table below.
  }
  return text
    .split("\n")
    .map(line => line.match(/^\s*(\d{14})?\s*[│|]\s*(\d{14})?\s*[│|]/))
    .filter(Boolean)
    .map(([, local, remote]) => ({ local: local || "", remote: remote || "" }));
}

function pendingMigrationVersions(listOutput) {
  const rows = migrationRows(listOutput).filter(row => row.local || row.remote);
  if (!rows.length) {
    throw new Error("could not read any migration rows from `supabase migration list` output");
  }
  return rows.filter(row => row.local && !row.remote).map(row => row.local);
}

function migrationFilesForVersions(versions, directory = path.join(ROOT, MIGRATION_DIRECTORY)) {
  const files = fs.readdirSync(directory).filter(filename => filename.endsWith(".sql"));
  return versions.map(version => {
    const filename = files.find(candidate => candidate.startsWith(`${version}_`));
    if (!filename) throw new Error(`pending migration ${version} has no local file`);
    return MIGRATION_DIRECTORY + filename;
  });
}

function parseArguments(argv) {
  const baseIndex = argv.indexOf("--base");
  return {
    base: argv.includes("--working-tree")
      ? "WORKTREE"
      : (baseIndex >= 0 ? argv[baseIndex + 1] : "HEAD^"),
    pending: argv.includes("--pending"),
    rejectContract: argv.includes("--reject-contract"),
  };
}

function main(argv = process.argv.slice(2), readStdin = () => fs.readFileSync(0, "utf8")) {
  const options = parseArguments(argv);
  let migrations;
  try {
    migrations = options.pending
      ? migrationFilesForVersions(pendingMigrationVersions(readStdin()))
      : changedMigrations(options.base);
  } catch (error) {
    console.error(`Migration rollout check failed:\n- ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const failures = migrations.flatMap(filename => validateMigration(
    filename,
    fs.readFileSync(path.join(ROOT, filename), "utf8"),
    options,
  ));
  if (failures.length) {
    console.error(`Migration rollout check failed:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  const scope = options.pending ? "pending" : "changed";
  console.log(
    migrations.length
      ? `validated rollout phase for ${migrations.length} ${scope} migration(s): ${migrations.join(", ")}`
      : `no ${scope} migrations require rollout validation`,
  );
}

if (require.main === module) main();

module.exports = {
  destructiveOperations,
  migrationFilesForVersions,
  pendingMigrationVersions,
  rolloutPhase,
  validateMigration,
};
