const fs = require("fs");
const path = require("path");
const {
  buildAssetVersions,
  digest,
  versionedUrl,
} = require("./asset-versions.js");
const { assembleScript } = require("./script-assembly.js");

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

const assetVersions = buildAssetVersions();
const appAssetUrl = relativePath => versionedUrl(relativePath, assetVersions);

// Each page's application is a separate script with a source map, rather than inline in
// its HTML, so error monitoring can resolve a stack frame against the code of the release
// that raised it. MASS_PLANNER_BUILD is a digest of the script with that value left out;
// the script is written, then referenced by the digest of its own contents.
function writeAppScript({ entry, output, modules, values }) {
  const { code, map } = assembleScript({
    root: ROOT,
    entry,
    output,
    modules,
    values: { ...values, "@@BUILD_VERSION@@": "@@BUILD_VERSION@@" },
  });
  const build = digest(code.replace("@@BUILD_VERSION@@", ""));
  const script = `${replaceOnce(code, "@@BUILD_VERSION@@", build)}\n//# sourceMappingURL=${path.basename(output)}.map\n`;
  fs.mkdirSync(path.join(ROOT, path.dirname(output)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, output), script);
  fs.writeFileSync(path.join(ROOT, `${output}.map`), `${JSON.stringify(map)}\n`);
  return `./${output}?v=${digest(script)}`;
}

const plannerScriptUrl = writeAppScript({
  entry: "src/app/planner.js",
  output: "app/planner.js",
  modules: {
  "@@FAILURES_JS@@": "src/domain/failures.js",
  "@@APP_LOGGER_JS@@": "src/services/app-logger.js",
  "@@ASSET_URL_JS@@": "src/domain/asset-url.js",
  "@@READING_TEXT_STORE_JS@@": "src/services/reading-text-store.js",
  "@@MODAL_CONTROLLER_JS@@": "src/app/modal-controller.js",
  "@@PWA_CONTROLLER_JS@@": "src/app/pwa-controller.js",
  "@@LITURGICAL_CALENDAR_JS@@": "src/domain/liturgical-calendar.js",
  "@@CALENDAR_NAVIGATION_JS@@": "src/app/calendar-navigation.js",
  "@@DATE_URL_STATE_JS@@": "src/app/date-url-state.js",
  "@@AUTH_CONTROLLER_JS@@": "src/app/auth-controller.js",
  "@@PLAN_SESSION_CONTROLLER_JS@@": "src/app/plan-session-controller.js",
  "@@PLANNER_STATE_JS@@": "src/app/planner-state.js",
  "@@SONG_FORM_JS@@": "src/app/song-form.js",
  "@@LYRICS_PRESENTATION_JS@@": "src/domain/lyrics-presentation.js",
  "@@LYRICS_BOOKLET_JS@@": "src/domain/lyrics-booklet.js",
  "@@LYRICS_EXPORT_CONTROLLER_JS@@": "src/app/lyrics-export-controller.js",
  "@@LYRICS_PPTX_CONTROLLER_JS@@": "src/app/lyrics-pptx-controller.js",
  "@@LYRICS_SLIDES_CONTROLLER_JS@@": "src/app/lyrics-slides-controller.js",
  "@@LYRICS_BOOKLET_CONTROLLER_JS@@": "src/app/lyrics-booklet-controller.js",
  "@@WEEKLY_LYRICS_JS@@": "src/domain/weekly-lyrics.js",
  "@@WEEKLY_LYRICS_CONTROLLER_JS@@": "src/app/weekly-lyrics-controller.js",
  "@@MUSIC_PARTS_JS@@": "src/domain/music-parts.js",
  "@@SONG_PRESENTATION_JS@@": "src/domain/song-presentation.js",
  "@@SONG_REQUESTS_JS@@": "src/domain/song-requests.js",
  "@@SONG_REQUEST_CONTROLLER_JS@@": "src/app/song-request-controller.js",
  "@@SONG_REQUEST_REVIEW_CONTROLLER_JS@@": "src/app/song-request-review-controller.js",
  "@@PRACTICE_QUEUE_JS@@": "src/domain/practice-queue.js",
  "@@PRACTICE_QUEUE_CONTROLLER_JS@@": "src/app/practice-queue-controller.js",
  "@@MUSIC_PLAN_VIEW_JS@@": "src/app/music-plan-view.js",
  "@@READING_PLAN_VIEW_JS@@": "src/app/reading-plan-view.js",
  "@@READING_EDITOR_VIEW_JS@@": "src/app/reading-editor-view.js",
  "@@SONG_PICKER_VIEW_JS@@": "src/app/song-picker-view.js",
  "@@SONG_PICKER_CONTROLLER_JS@@": "src/app/song-picker-controller.js",
  "@@SONG_MUTATION_CONTROLLER_JS@@": "src/app/song-mutation-controller.js",
  "@@SONG_WORKFLOW_JS@@": "src/app/song-workflow.js",
  "@@CELEBRATION_PICKER_VIEW_JS@@": "src/app/celebration-picker-view.js",
  "@@CELEBRATION_CONTROLLER_JS@@": "src/app/celebration-controller.js",
  "@@READING_OVERRIDE_CONTROLLER_JS@@": "src/app/reading-override-controller.js",
  "@@READING_DIALOG_CONTROLLER_JS@@": "src/app/reading-dialog-controller.js",
  "@@READING_WORKFLOW_JS@@": "src/app/reading-workflow.js",
  "@@OCCASION_LABEL_CONTROLLER_JS@@": "src/app/occasion-label-controller.js",
  "@@SONG_CATALOG_JS@@": "src/domain/songs.js",
  "@@PLAN_MUSIC_DATA_JS@@": "src/domain/plan-music-data.js",
  "@@LECTIONARY_CATALOG_JS@@": "src/domain/lectionary.js",
  "@@READING_SELECTION_JS@@": "src/domain/reading-selection.js",
  },
  values: {
    "@@SUNDAY_LECTIONARY@@": read(path.join(GENERATED_DATA, "sunday-lectionary.json")).trimEnd(),
    "@@WEEKDAY_LECTIONARY@@": read(path.join(GENERATED_DATA, "weekday-lectionary.json")).trimEnd(),
    "@@CELEBRATIONS@@": read(path.join(GENERATED_DATA, "celebrations.json")).trimEnd(),
    "@@COMMONS@@": read(path.join(GENERATED_DATA, "commons.json")).trimEnd(),
    "@@READING_ASSETS@@": read("data/readings/manifest.json").trimEnd(),
    "@@ASSET_VERSIONS@@": JSON.stringify(assetVersions),
  },
});

let html = read("src/planner.html").trimEnd();
html = replaceOnce(html, "@@STYLES@@", read("src/styles/planner.css").trimEnd());
html = replaceOnce(html, "@@APP_SCRIPT_URL@@", plannerScriptUrl);
html = replaceOnce(html, "@@SUPABASE_CONFIG_URL@@", appAssetUrl("supabase-config.js"));
html = replaceOnce(html, "@@MONITORING_URL@@", appAssetUrl("src/services/monitoring.js"));
html = replaceOnce(html, "@@SUPABASE_CLIENT_URL@@", appAssetUrl("src/services/supabase-client.js"));
html = replaceOnce(html, "@@PLAN_STORE_URL@@", appAssetUrl("src/services/plan-store.js"));

fs.writeFileSync(path.join(ROOT, "index.html"), html);
fs.rmSync(path.join(ROOT, "StJames_Mass_Planner.html"), { force: true });

const repertoireScriptUrl = writeAppScript({
  entry: "src/app/repertoire.js",
  output: "app/repertoire.js",
  // The failures module comes ahead of the logger, which reads the mark it defines.
  modules: {
  "@@FAILURES_JS@@": "src/domain/failures.js",
  "@@APP_LOGGER_JS@@": "src/services/app-logger.js",
  "@@ASSET_URL_JS@@": "src/domain/asset-url.js",
  "@@REPERTOIRE_URL_STATE_JS@@": "src/app/repertoire-url-state.js",
  "@@MUSIC_PARTS_JS@@": "src/domain/music-parts.js",
  "@@PWA_CONTROLLER_JS@@": "src/app/pwa-controller.js",
  "@@AUTH_CONTROLLER_JS@@": "src/app/auth-controller.js",
  "@@SONG_FORM_JS@@": "src/app/song-form.js",
  "@@SONG_PRESENTATION_JS@@": "src/domain/song-presentation.js",
  "@@SONG_CATALOG_JS@@": "src/domain/songs.js",
  "@@EMBEDDING_REPAIR_JS@@": "src/domain/embedding-repair.js",
  },
  values: {
    "@@ASSET_VERSIONS@@": JSON.stringify(assetVersions),
  },
});

let repertoireHtml = read("src/repertoire.html").trimEnd();
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@STYLES@@",
  read("src/styles/repertoire.css").trimEnd(),
);
repertoireHtml = replaceOnce(repertoireHtml, "@@APP_SCRIPT_URL@@", repertoireScriptUrl);
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@SUPABASE_CONFIG_URL@@",
  appAssetUrl("supabase-config.js"),
);
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@MONITORING_URL@@",
  appAssetUrl("src/services/monitoring.js"),
);
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@SUPABASE_CLIENT_URL@@",
  appAssetUrl("src/services/supabase-client.js"),
);
repertoireHtml = replaceOnce(
  repertoireHtml,
  "@@REPERTOIRE_STORE_URL@@",
  appAssetUrl("src/services/repertoire-store.js"),
);
fs.writeFileSync(path.join(ROOT, "repertoire.html"), repertoireHtml);

console.log(
  "written",
  Math.round(html.length / 1024),
  "KB planner and",
  Math.round(repertoireHtml.length / 1024),
  "KB repertoire pages with their application scripts",
);
