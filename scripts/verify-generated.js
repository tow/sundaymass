const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUTS = [
  "index.html",
  "repertoire.html",
  "service-worker.js",
  "favicon.ico",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "vendor/supabase.js",
];

function hashes() {
  return Object.fromEntries(OUTPUTS.map(relativePath => {
    const contents = fs.readFileSync(path.join(ROOT, relativePath));
    return [relativePath, crypto.createHash("sha256").update(contents).digest("hex")];
  }));
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function build() {
  const result = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (OUTPUTS.some(relativePath => !fs.existsSync(path.join(ROOT, relativePath)))) {
  build();
}

const before = hashes();
build();
const after = hashes();
const changed = OUTPUTS.filter(relativePath => before[relativePath] !== after[relativePath]);
if (changed.length) {
  console.error(
    "Generated outputs are not deterministic:\n"
      + changed.map(relativePath => `- ${relativePath}`).join("\n")
      + "\nThe same inputs must produce identical deployment files.",
  );
  process.exit(1);
}

console.log("Generated deployment outputs are deterministic.");
