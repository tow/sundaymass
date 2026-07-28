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

function parseArguments(argv) {
  const baseIndex = argv.indexOf("--base");
  return {
    base: argv.includes("--working-tree")
      ? "WORKTREE"
      : (baseIndex >= 0 ? argv[baseIndex + 1] : "HEAD^"),
    rejectContract: argv.includes("--reject-contract"),
  };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const migrations = changedMigrations(options.base);
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
  console.log(
    migrations.length
      ? `validated rollout phase for ${migrations.length} changed migration(s)`
      : "no changed migrations require rollout validation",
  );
}

if (require.main === module) main();

module.exports = {
  destructiveOperations,
  rolloutPhase,
  validateMigration,
};
