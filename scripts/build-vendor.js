const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const outputDirectory = path.join(ROOT, "vendor");
const outputFile = path.join(outputDirectory, "supabase.js");

fs.mkdirSync(outputDirectory, { recursive: true });
esbuild.buildSync({
  stdin: {
    contents: 'export { createClient } from "@supabase/supabase-js";',
    loader: "js",
    resolveDir: ROOT,
    sourcefile: "supabase-entry.js",
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
console.log(`written ${size} KB local Supabase client`);
