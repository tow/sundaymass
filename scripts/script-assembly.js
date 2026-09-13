// Assembles a page's application script from its entry template and emits a source map
// back to the original files, so an error report can name src/app/weekly-lyrics-controller.js
// line 207 rather than line 9,412 of one generated file.
//
// An entry template names each module on a line of its own (`@@FAILURES_JS@@`); those lines
// are replaced by the module's text. Other tokens are values (generated data, versions)
// substituted in place. Every generated line keeps the source and line it came from, which
// is all a stack trace needs: columns within a line are unchanged.
const fs = require("node:fs");
const path = require("node:path");

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq(value) {
  let remaining = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = "";
  do {
    let digit = remaining & 31;
    remaining >>>= 5;
    if (remaining > 0) digit |= 32;
    encoded += BASE64[digit];
  } while (remaining > 0);
  return encoded;
}

function assembleScript({ root, entry, output, modules, values }) {
  const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
  const sources = [];
  const sourcesContent = [];
  const lines = [];
  const used = new Set();

  function sourceIndex(relativePath) {
    if (!sources.includes(relativePath)) {
      sources.push(relativePath);
      sourcesContent.push(read(relativePath));
    }
    return sources.indexOf(relativePath);
  }

  function use(token) {
    if (used.has(token)) throw new Error(`Build token ${token} occurs more than once`);
    used.add(token);
  }

  const entryIndex = sourceIndex(entry);
  read(entry).trimEnd().split("\n").forEach((text, line) => {
    const token = text.trim();
    if (Object.hasOwn(modules, token)) {
      use(token);
      const moduleIndex = sourceIndex(modules[token]);
      sourcesContent[moduleIndex].trimEnd().split("\n").forEach((moduleText, moduleLine) => {
        lines.push({ text: moduleText, source: moduleIndex, line: moduleLine });
      });
      return;
    }
    const substituted = text.replace(/@@[A-Z_]+@@/g, match => {
      if (!Object.hasOwn(values, match)) throw new Error(`Unknown build token ${match}`);
      use(match);
      return values[match];
    });
    // A substituted value can span lines; all of them come from the template's line.
    substituted.split("\n").forEach(part => lines.push({ text: part, source: entryIndex, line }));
  });
  [...Object.keys(modules), ...Object.keys(values)].forEach(token => {
    if (!used.has(token)) throw new Error(`Missing build token ${token}`);
  });

  let previous = { source: 0, line: 0 };
  const mappings = lines.map(({ source, line }) => {
    const segment = `A${vlq(source - previous.source)}${vlq(line - previous.line)}A`;
    previous = { source, line };
    return segment;
  }).join(";");

  const outputDirectory = path.dirname(output);
  return {
    code: lines.map(({ text }) => text).join("\n"),
    map: {
      version: 3,
      file: path.basename(output),
      sources: sources.map(source => path.relative(outputDirectory, source).split(path.sep).join("/")),
      sourcesContent,
      names: [],
      mappings,
    },
  };
}

module.exports = { assembleScript, vlq };
