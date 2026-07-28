const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function publicConfig() {
  const sandbox = { window: {} };
  const source = fs.readFileSync(
    path.resolve(__dirname, "../supabase-config.js"),
    "utf8",
  );
  vm.runInNewContext(source, sandbox);
  return sandbox.window.MASS_PLANNER_SUPABASE_CONFIG;
}

function privateFieldPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => privateFieldPaths(item, `${prefix}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    return [
      ...(/lyrics/i.test(key) ? [fieldPath] : []),
      ...privateFieldPaths(item, fieldPath),
    ];
  });
}

async function requestJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${body.slice(0, 500)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

async function smokeBackend({
  fetchImpl = fetch,
  url,
  publishableKey,
} = {}) {
  const config = publicConfig();
  const baseUrl = (url || process.env.SUPABASE_URL || config.url).replace(/\/$/, "");
  const key = publishableKey
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || config.publishableKey;
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  const songFields = [
    "id",
    "title",
    "youtube_video_id",
    "authors",
    "copyright_owner",
    "copyright_year",
    "source",
    "in_repertoire",
    "suggestion_parts",
  ].join(",");
  const songs = await requestJson(
    fetchImpl,
    `${baseUrl}/rest/v1/songs?select=${encodeURIComponent(songFields)}&limit=1`,
    { headers },
    "public songs contract",
  );
  if (!Array.isArray(songs) || songs.length === 0) {
    throw new Error("public songs contract returned no songs");
  }

  const suggestions = await requestJson(
    fetchImpl,
    `${baseUrl}/rest/v1/rpc/suggest_songs_for_readings`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_citations: ["John 6:1-15"],
        p_part: "communion",
        p_limit: 1,
      }),
    },
    "public song-suggestion RPC contract",
  );
  if (!Array.isArray(suggestions)) {
    throw new Error("public song-suggestion RPC did not return an array");
  }

  const privateFields = privateFieldPaths({ songs, suggestions });
  if (privateFields.length) {
    throw new Error(`public backend exposed private lyric fields: ${privateFields.join(", ")}`);
  }
  const obsoleteFields = suggestions.flatMap((song, index) =>
    Object.hasOwn(song || {}, "youtube_url") ? [`suggestions[${index}].youtube_url`] : [],
  );
  if (obsoleteFields.length) {
    throw new Error(`public backend returned obsolete fields: ${obsoleteFields.join(", ")}`);
  }
  console.log(
    `production backend contract passed (${songs.length} song sample, `
    + `${suggestions.length} suggestion sample)`,
  );
}

if (require.main === module) {
  smokeBackend().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { privateFieldPaths, requestJson, smokeBackend };
