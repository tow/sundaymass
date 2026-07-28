const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const outputDirectory = path.join(ROOT, "vendor");
fs.mkdirSync(outputDirectory, { recursive: true });

function buildBundle({ name, contents, sourcefile }) {
  const outputFile = path.join(outputDirectory, `${name}.js`);
  esbuild.buildSync({
    stdin: {
      contents,
      loader: "js",
      resolveDir: ROOT,
      sourcefile,
    },
    outfile: outputFile,
    bundle: true,
    charset: "utf8",
    format: "esm",
    legalComments: "none",
    minify: true,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
  });
  const size = Math.round(fs.statSync(outputFile).size / 1024);
  console.log(`written ${size} KB local ${name} bundle`);
}

buildBundle({
  name: "supabase",
  contents: 'export { createClient } from "@supabase/supabase-js";',
  sourcefile: "supabase-entry.js",
});
buildBundle({
  name: "pptxgenjs",
  contents: 'export { default } from "pptxgenjs";',
  sourcefile: "pptxgenjs-entry.js",
});
