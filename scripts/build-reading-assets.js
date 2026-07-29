const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "data", "generated", "readings_text.json");
const OUTPUT = path.join(ROOT, "data", "readings");

function buildReadingAssets() {
  const readings = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });

  const manifest = {};
  Object.entries(readings).forEach(([citation, text]) => {
    const payload = JSON.stringify(text);
    const digest = crypto.createHash("sha256")
      .update(citation)
      .update("\0")
      .update(payload)
      .digest("hex")
      .slice(0, 16);
    const filename = `${digest}.json`;
    if (manifest[citation]) throw new Error(`Duplicate reading citation: ${citation}`);
    if (fs.existsSync(path.join(OUTPUT, filename))) {
      throw new Error(`Reading asset hash collision for ${citation}`);
    }
    fs.writeFileSync(path.join(OUTPUT, filename), payload);
    manifest[citation] = filename;
  });
  fs.writeFileSync(
    path.join(OUTPUT, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`written ${Object.keys(manifest).length} lazy reading assets`);
}

if (require.main === module) buildReadingAssets();

module.exports = { buildReadingAssets };
