const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(ROOT, "src/service-worker.js"), "utf8");
const assets = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/service-worker-assets.json"), "utf8"),
);
const hash = crypto.createHash("sha256");

hash.update(template.replace("@@CACHE_VERSION@@", ""));
hash.update(JSON.stringify(assets));
assets.forEach(asset => {
  const relativePath = asset === "./" ? "index.html" : asset.replace(/^\.\//, "");
  const assetPath = path.join(ROOT, relativePath);
  hash.update(asset);
  hash.update("\0");
  hash.update(fs.readFileSync(assetPath));
  hash.update("\0");
});

const version = hash.digest("hex").slice(0, 12);
const output = template
  .replace("@@CACHE_VERSION@@", version)
  .replace("@@APP_SHELL@@", JSON.stringify(assets, null, 2));

fs.writeFileSync(path.join(ROOT, "service-worker.js"), output);
console.log(`written service worker cache ${version}`);
