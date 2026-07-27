const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUTS = [
  "index.html",
  "StJames_Mass_Planner.html",
  "repertoire.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

function hashes() {
  return Object.fromEntries(OUTPUTS.map(relativePath => {
    const contents = fs.readFileSync(path.join(ROOT, relativePath));
    return [relativePath, crypto.createHash("sha256").update(contents).digest("hex")];
  }));
}

const before = hashes();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", "build"], { cwd: ROOT, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);

const after = hashes();
const changed = OUTPUTS.filter(relativePath => before[relativePath] !== after[relativePath]);
if (changed.length) {
  console.error(
    "Generated outputs were stale and have been rebuilt:\n"
      + changed.map(relativePath => `- ${relativePath}`).join("\n")
      + "\nReview the changes, then run npm run check again.",
  );
  process.exit(1);
}

console.log("Generated outputs are current and deterministic.");
