const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_DATA = path.join("data", "generated");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function replaceOnce(source, token, value) {
  const first = source.indexOf(token);
  if (first < 0) throw new Error(`Missing build token ${token}`);
  if (source.indexOf(token, first + token.length) >= 0) {
    throw new Error(`Build token ${token} occurs more than once`);
  }
  return source.replace(token, () => value);
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(resolved) : [resolved];
  });
}

function embeddedTemplateParts(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  const parts = {};
  filesBelow(directory).forEach(file => {
    parts[path.relative(directory, file)] = fs.readFileSync(file).toString("base64");
  });
  return JSON.stringify(parts);
}

const appValues = {
  // Keep the source file's trailing newline: the historical single-file build
  // intentionally leaves a blank line between the domain module and embedded data.
  "@@SONG_CATALOG_JS@@": read("src/domain/songs.js"),
  "@@PLAN_MUSIC_DATA_JS@@": read("src/domain/plan-music-data.js"),
  "@@LECTIONARY_CATALOG_JS@@": read("src/domain/lectionary.js"),
  "@@CALENDAR@@": read(path.join(GENERATED_DATA, "sunday-calendar.json")),
  "@@SUNDAY_LECTIONARY@@": read(path.join(GENERATED_DATA, "sunday-lectionary.json")),
  "@@CELEBRATIONS@@": read(path.join(GENERATED_DATA, "celebrations.json")),
  "@@COMMONS@@": read(path.join(GENERATED_DATA, "commons.json")),
  "@@PARTS@@": embeddedTemplateParts("tpl"),
  "@@PARTS2@@": embeddedTemplateParts("tpl2"),
  "@@READINGS@@": read(path.join(GENERATED_DATA, "readings_text.json")),
  "@@DOCX_EXPORT_JS@@": read("src/export/docx.js").trimEnd(),
};

let appScript = read("src/app/planner.js").trimEnd();
Object.entries(appValues).forEach(([token, value]) => {
  appScript = replaceOnce(appScript, token, value);
});

let html = read("src/planner.html").trimEnd();
html = replaceOnce(html, "@@STYLES@@", read("src/styles/planner.css").trimEnd());
html = replaceOnce(html, "@@APP_SCRIPT@@", appScript);

["StJames_Mass_Planner.html", "index.html"].forEach(output => {
  fs.writeFileSync(path.join(ROOT, output), html);
});

let repertoireScript = read("src/app/repertoire.js").trimEnd();
repertoireScript = replaceOnce(repertoireScript, "@@SONG_CATALOG_JS@@", read("src/domain/songs.js"));
repertoireScript = replaceOnce(
  repertoireScript,
  "@@EMBEDDING_REPAIR_JS@@",
  read("src/domain/embedding-repair.js"),
);
let repertoireHtml = read("src/repertoire.html").trimEnd();
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@STYLES@@",
  read("src/styles/repertoire.css").trimEnd(),
);
repertoireHtml = replaceOnce(repertoireHtml, "@@APP_SCRIPT@@", repertoireScript);
fs.writeFileSync(path.join(ROOT, "repertoire.html"), repertoireHtml);

console.log(
  "written",
  Math.round(html.length / 1024),
  "KB planner and",
  Math.round(repertoireHtml.length / 1024),
  "KB repertoire",
);
