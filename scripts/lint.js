const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const files = execFileSync(
  "git",
  ["ls-files", "-z", "*.js", "*.mjs"],
  { cwd: ROOT, encoding: "utf8" },
).split("\0").filter(Boolean);
const buildTemplates = new Set([
  "src/app/planner.js",
  "src/app/repertoire.js",
  "src/service-worker.js",
]);

const failures = [];
files.filter(file => !buildTemplates.has(file)).forEach(file => {
  const result = spawnSync(
    process.execPath,
    ["--check", file],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    failures.push(`${file}\n${result.stderr || result.stdout}`.trim());
  }
});

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(
  `syntax checked ${files.length - buildTemplates.size} modules; `
  + `${buildTemplates.size} tokenized templates are checked after assembly`,
);
