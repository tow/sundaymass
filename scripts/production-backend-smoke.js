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

// PostgREST resolves an RPC by its parameter names, so a renamed parameter makes
// the function vanish (PGRST202) or turn ambiguous (PGRST203) for the client even
// though a same-named function still exists. Anything else — including the RPC's
// own access guard rejecting the anonymous call — proves the signature is live.
async function requireRpcSignature(fetchImpl, baseUrl, headers, name, body) {
  const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let code = "";
  try {
    code = JSON.parse(text)?.code || "";
  } catch {
    // a non-JSON body cannot be a PostgREST schema error
  }
  if (response.status === 404 || /^PGRST20[23]$/.test(code)) {
    throw new Error(
      `editor RPC contract: ${name}(${Object.keys(body).join(", ")}) `
      + `is not in the production schema: ${text.slice(0, 300)}`,
    );
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
    "responsorial_book",
    "responsorial_number",
    "responsorial_citations",
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

  const psalmSuggestions = await requestJson(
    fetchImpl,
    `${baseUrl}/rest/v1/rpc/suggest_psalms_for_reading`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_citation: "Psalm 85:9, 10, 11-12, 13-14",
        p_limit: 1,
      }),
    },
    "public Psalm-suggestion RPC contract",
  );
  if (!Array.isArray(psalmSuggestions)) {
    throw new Error("public Psalm-suggestion RPC did not return an array");
  }

  // The planner's public plan read and every editor write key on plan_date, and it reads
  // each plan's occasion label. Reading the columns by the names the frontend uses
  // refuses a deploy ahead of the schema.
  const plans = await requestJson(
    fetchImpl,
    `${baseUrl}/rest/v1/plans?select=${encodeURIComponent("plan_date,reading_overrides,celebration_override,occasion_label")}&limit=1`,
    { headers },
    "public plan contract",
  );
  if (!Array.isArray(plans)) {
    throw new Error("public plan contract did not return an array");
  }
  const planSongs = await requestJson(
    fetchImpl,
    `${baseUrl}/rest/v1/plan_songs?select=${encodeURIComponent("plan_date,part,song_id")}&limit=1`,
    { headers },
    "public plan song contract",
  );
  if (!Array.isArray(planSongs)) {
    throw new Error("public plan song contract did not return an array");
  }
  await requireRpcSignature(fetchImpl, baseUrl, headers, "assign_plan_song", {
    p_plan_date: "2000-01-02",
    p_part: "entrance",
    p_song_id: "00000000-0000-0000-0000-000000000000",
  });

  // The Psalm RPC and the private weekly-lyric schema ship in the same transactional
  // migration. Exercising it therefore catches a frontend deploy ahead of that schema.
  const publicValues = { songs, suggestions, psalmSuggestions, plans, planSongs };
  const privateFields = privateFieldPaths(publicValues);
  if (privateFields.length) {
    throw new Error(`public backend exposed private lyric fields: ${privateFields.join(", ")}`);
  }
  const obsoleteFields = Object.entries(publicValues).flatMap(([collection, values]) =>
    values.flatMap((song, index) =>
      Object.hasOwn(song || {}, "youtube_url")
        ? [`${collection}[${index}].youtube_url`]
        : [],
    ),
  );
  if (obsoleteFields.length) {
    throw new Error(`public backend returned obsolete fields: ${obsoleteFields.join(", ")}`);
  }
  console.log(
    `production backend contract passed (${songs.length} song sample, `
    + `${suggestions.length} suggestion sample, `
    + `${psalmSuggestions.length} Psalm suggestion sample, `
    + `${plans.length} plan sample, assign_plan_song signature present)`,
  );
}

if (require.main === module) {
  smokeBackend().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { privateFieldPaths, requestJson, smokeBackend };
