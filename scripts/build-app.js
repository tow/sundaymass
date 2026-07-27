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

const appValues = {
  // Keep the source file's trailing newline: the historical single-file build
  // intentionally leaves a blank line between the domain module and embedded data.
  "@@MODAL_CONTROLLER_JS@@": read("src/app/modal-controller.js"),
  "@@PWA_CONTROLLER_JS@@": read("src/app/pwa-controller.js"),
  "@@CALENDAR_NAVIGATION_JS@@": read("src/app/calendar-navigation.js"),
  "@@AUTH_CONTROLLER_JS@@": read("src/app/auth-controller.js"),
  "@@PLAN_SESSION_CONTROLLER_JS@@": read("src/app/plan-session-controller.js"),
  "@@SONG_FORM_JS@@": read("src/app/song-form.js"),
  "@@PRINT_CONTROLLER_JS@@": read("src/app/print-controller.js"),
  "@@MUSIC_PARTS_JS@@": read("src/domain/music-parts.js"),
  "@@SONG_PRESENTATION_JS@@": read("src/domain/song-presentation.js"),
  "@@MUSIC_PLAN_VIEW_JS@@": read("src/app/music-plan-view.js"),
  "@@READING_PLAN_VIEW_JS@@": read("src/app/reading-plan-view.js"),
  "@@READING_EDITOR_VIEW_JS@@": read("src/app/reading-editor-view.js"),
  "@@SONG_PICKER_VIEW_JS@@": read("src/app/song-picker-view.js"),
  "@@SONG_PICKER_CONTROLLER_JS@@": read("src/app/song-picker-controller.js"),
  "@@SONG_MUTATION_CONTROLLER_JS@@": read("src/app/song-mutation-controller.js"),
  "@@CELEBRATION_PICKER_VIEW_JS@@": read("src/app/celebration-picker-view.js"),
  "@@CELEBRATION_CONTROLLER_JS@@": read("src/app/celebration-controller.js"),
  "@@READING_OVERRIDE_CONTROLLER_JS@@": read("src/app/reading-override-controller.js"),
  "@@READING_DIALOG_CONTROLLER_JS@@": read("src/app/reading-dialog-controller.js"),
  "@@SONG_CATALOG_JS@@": read("src/domain/songs.js"),
  "@@PLAN_MUSIC_DATA_JS@@": read("src/domain/plan-music-data.js"),
  "@@LECTIONARY_CATALOG_JS@@": read("src/domain/lectionary.js"),
  "@@READING_SELECTION_JS@@": read("src/domain/reading-selection.js"),
  "@@CALENDAR@@": read(path.join(GENERATED_DATA, "sunday-calendar.json")),
  "@@SUNDAY_LECTIONARY@@": read(path.join(GENERATED_DATA, "sunday-lectionary.json")),
  "@@CELEBRATIONS@@": read(path.join(GENERATED_DATA, "celebrations.json")),
  "@@COMMONS@@": read(path.join(GENERATED_DATA, "commons.json")),
  "@@READINGS@@": read(path.join(GENERATED_DATA, "readings_text.json")),
};

let appScript = read("src/app/planner.js").trimEnd();
Object.entries(appValues).forEach(([token, value]) => {
  appScript = replaceOnce(appScript, token, value);
});

let html = read("src/planner.html").trimEnd();
html = replaceOnce(html, "@@STYLES@@", read("src/styles/planner.css").trimEnd());
html = replaceOnce(html, "@@APP_SCRIPT@@", appScript);

fs.writeFileSync(path.join(ROOT, "index.html"), html);
fs.rmSync(path.join(ROOT, "StJames_Mass_Planner.html"), { force: true });

let repertoireScript = read("src/app/repertoire.js").trimEnd();
repertoireScript = replaceOnce(
  repertoireScript,
  "@@MUSIC_PARTS_JS@@",
  read("src/domain/music-parts.js"),
);
repertoireScript = replaceOnce(
  repertoireScript,
  "@@PWA_CONTROLLER_JS@@",
  read("src/app/pwa-controller.js"),
);
repertoireScript = replaceOnce(
  repertoireScript,
  "@@AUTH_CONTROLLER_JS@@",
  read("src/app/auth-controller.js"),
);
repertoireScript = replaceOnce(
  repertoireScript,
  "@@SONG_FORM_JS@@",
  read("src/app/song-form.js"),
);
repertoireScript = replaceOnce(
  repertoireScript,
  "@@SONG_PRESENTATION_JS@@",
  read("src/domain/song-presentation.js"),
);
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
