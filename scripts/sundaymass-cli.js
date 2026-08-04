#!/usr/bin/env node

// Production maintenance CLI. It uses the repository's already-linked Supabase
// project through `supabase db query --linked`; no browser session or service key
// is needed, and sensitive values are passed in a short-lived SQL file.
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

require("../src/domain/songs.js");

const ROOT = path.resolve(__dirname, "..");
const SUPABASE_VERSION = "2.109.1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MUSIC_PARTS = new Set([
  "entrance", "kyrie", "gloria", "psalm", "acclamation", "offertory",
  "sanctus", "memorial", "amen", "lordPrayer", "agnus", "communion",
  "communion2", "recessional",
]);
const SONG_VALUE_FLAGS = new Map([
  ["title", "title"],
  ["youtube-id", "youtubeVideoId"],
  ["authors", "authors"],
  ["copyright-owner", "copyrightOwner"],
  ["copyright-year", "copyrightYear"],
  ["source", "source"],
  ["responsorial-book", "responsorialBook"],
  ["responsorial-number", "responsorialNumber"],
]);
const BOOLEAN_FLAGS = new Set([
  "apply", "dry-run", "json", "lyrics", "repertoire", "non-repertoire", "local",
]);
const REPEATABLE_FLAGS = new Set(["suggestion-part", "responsorial-citation"]);

const HELP = `Sundaymass production maintenance

Usage:
  sundaymass list_songs [--query TEXT] [--limit N] [--json]
  sundaymass show_song SONG_ID [--lyrics] [--json]
  sundaymass booklet YYYY-MM-DD [--output PATH] [--json]
  sundaymass create_song --title TITLE [metadata options] [--apply]
  sundaymass update_song SONG_ID [metadata options] [--apply]
  sundaymass add_lyrics SONG_ID --file PATH [--apply]
  sundaymass clear_lyrics SONG_ID [--apply]
  sundaymass assign_song YYYY-MM-DD PART SONG_ID [--apply]
  sundaymass clear_song YYYY-MM-DD PART [--apply]
  sundaymass audit_psalms [--json]

Metadata options:
  --youtube-id ID
  --authors TEXT
  --copyright-owner TEXT
  --copyright-year TEXT
  --source TEXT
  --responsorial-book BOOK
  --responsorial-number NUMBER
  --responsorial-citation CITATION
                              Repeatable; include the exact lectionary verses
  --suggestion-part PART       Repeatable
  --repertoire | --non-repertoire

Safety:
  Mutations are dry-runs unless --apply is present.
  Mutation targets are UUIDs only; titles are never identifiers.
  Lyrics are accepted from --file only. Use --file - for stdin.
  The linked production project is used by default; --local targets local Supabase.
`;

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const flags = new Map();
  const positionals = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (BOOLEAN_FLAGS.has(rawName)) {
      if (inlineValue !== undefined) throw new Error(`--${rawName} does not take a value`);
      flags.set(rawName, true);
      continue;
    }
    const value = inlineValue === undefined ? tokens[++index] : inlineValue;
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${rawName} requires a value`);
    }
    if (REPEATABLE_FLAGS.has(rawName)) {
      flags.set(rawName, [...(flags.get(rawName) || []), value]);
    } else {
      if (flags.has(rawName)) throw new Error(`--${rawName} may only be provided once`);
      flags.set(rawName, value);
    }
  }
  return { command, positionals, flags };
}

function assertKnownFlags(flags, allowed) {
  for (const name of flags.keys()) {
    if (!allowed.has(name)) throw new Error(`Unknown option --${name}`);
  }
}

function assertUuid(value, label = "song ID") {
  if (!UUID_PATTERN.test(String(value || ""))) {
    throw new Error(`${label} must be a UUID`);
  }
  return value;
}

function assertDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) {
    throw new Error("Sunday must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Sunday is not a valid date");
  }
  return value;
}

function assertPart(value) {
  if (!MUSIC_PARTS.has(value)) {
    throw new Error(`Invalid music part: ${value || "(missing)"}`);
  }
  return value;
}

function intOption(value, { defaultValue, min, max, label }) {
  if (value === undefined) return defaultValue;
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be an integer`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function songPatch(flags, { requireTitle = false } = {}) {
  const patch = {};
  for (const [flag, field] of SONG_VALUE_FLAGS) {
    if (flags.has(flag)) patch[field] = flags.get(flag);
  }
  if (flags.has("suggestion-part")) {
    patch.suggestionParts = flags.get("suggestion-part");
  }
  if (flags.has("responsorial-citation")) {
    patch.responsorialCitations = flags.get("responsorial-citation");
  }
  if (patch.responsorialNumber !== undefined) {
    patch.responsorialNumber = intOption(patch.responsorialNumber, {
      min: 1, max: 999, label: "responsorial number",
    });
  }
  if (flags.has("repertoire") && flags.has("non-repertoire")) {
    throw new Error("Choose either --repertoire or --non-repertoire");
  }
  if (flags.has("repertoire")) patch.inRepertoire = true;
  if (flags.has("non-repertoire")) patch.inRepertoire = false;
  if (requireTitle && !patch.title) throw new Error("--title is required");
  if (!requireTitle && patch.title !== undefined && !String(patch.title).trim()) {
    throw new Error("Enter a song title.");
  }
  if (patch.youtubeVideoId !== undefined
    && !/^(?:[A-Za-z0-9_-]{11})?$/.test(patch.youtubeVideoId)) {
    throw new Error("Enter an 11-character YouTube video ID");
  }
  if (!requireTitle && !Object.keys(patch).length) {
    throw new Error("Provide at least one metadata option");
  }

  const base = requireTitle
    ? {
        title: "",
        youtubeVideoId: "",
        authors: "",
        copyrightOwner: "",
        copyrightYear: "",
        source: "",
        responsorialBook: "",
        responsorialNumber: null,
        responsorialCitations: [],
        lyrics: "",
        suggestionParts: [],
        inRepertoire: true,
      }
    : {};
  const value = { ...base, ...patch };
  const validated = global.SongCatalog.validateDraft(value);
  if (requireTitle && !validated.valid) throw new Error(validated.error);
  if (patch.youtubeVideoId !== undefined && validated.value.youtubeVideoId !== patch.youtubeVideoId) {
    throw new Error("Enter an 11-character YouTube video ID");
  }
  if (patch.suggestionParts
    && validated.value.suggestionParts.length !== new Set(patch.suggestionParts).size) {
    throw new Error("One or more suggestion parts are invalid");
  }
  if (requireTitle) {
    return {
      title: validated.value.title,
      youtubeVideoId: validated.value.youtubeVideoId,
      authors: validated.value.authors,
      copyrightOwner: validated.value.copyrightOwner,
      copyrightYear: validated.value.copyrightYear,
      source: validated.value.source,
      responsorialBook: validated.value.responsorialBook,
      responsorialNumber: validated.value.responsorialNumber,
      responsorialCitations: validated.value.responsorialCitations,
      suggestionParts: validated.value.suggestionParts,
      inRepertoire: validated.value.inRepertoire,
    };
  }
  return Object.fromEntries(Object.keys(patch).map(key => [key, validated.value[key]]));
}

function payloadSql(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `with input as (
  select convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb as p
)`;
}

function textArraySql(expression) {
  return `coalesce(array(
    select jsonb_array_elements_text(${expression})
  ), array[]::text[])`;
}

function createSongSql(song) {
  return `${payloadSql(song)},
created as (
  insert into public.songs (
    title, youtube_video_id, authors, copyright_owner, copyright_year, source,
    responsorial_book, responsorial_number, responsorial_citations,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  select
    btrim(p->>'title'),
    btrim(coalesce(p->>'youtubeVideoId', '')),
    btrim(coalesce(p->>'authors', '')),
    btrim(coalesce(p->>'copyrightOwner', '')),
    btrim(coalesce(p->>'copyrightYear', '')),
    btrim(coalesce(p->>'source', '')),
    btrim(coalesce(p->>'responsorialBook', '')),
    nullif(p->>'responsorialNumber', '')::integer,
    ${textArraySql("p->'responsorialCitations'")},
    ${textArraySql("p->'suggestionParts'")},
    coalesce((p->>'inRepertoire')::boolean, true),
    now(), null, now(), null
  from input
  returning id, title, youtube_video_id, authors, copyright_owner,
    copyright_year, source, responsorial_book, responsorial_number,
    responsorial_citations, suggestion_parts, in_repertoire
)
select id::text, title, youtube_video_id, authors, copyright_owner,
  copyright_year, source, responsorial_book, responsorial_number,
  responsorial_citations, suggestion_parts, in_repertoire, false as has_lyrics
from created;`;
}

function updateSongSql(songId, patch) {
  return `${payloadSql({ id: songId, ...patch })},
updated as (
  update public.songs s
  set
    title = case when p ? 'title' then btrim(p->>'title') else s.title end,
    youtube_video_id = case when p ? 'youtubeVideoId'
      then btrim(coalesce(p->>'youtubeVideoId', '')) else s.youtube_video_id end,
    authors = case when p ? 'authors'
      then btrim(coalesce(p->>'authors', '')) else s.authors end,
    copyright_owner = case when p ? 'copyrightOwner'
      then btrim(coalesce(p->>'copyrightOwner', '')) else s.copyright_owner end,
    copyright_year = case when p ? 'copyrightYear'
      then btrim(coalesce(p->>'copyrightYear', '')) else s.copyright_year end,
    source = case when p ? 'source'
      then btrim(coalesce(p->>'source', '')) else s.source end,
    responsorial_book = case when p ? 'responsorialBook'
      then btrim(coalesce(p->>'responsorialBook', '')) else s.responsorial_book end,
    responsorial_number = case when p ? 'responsorialNumber'
      then nullif(p->>'responsorialNumber', '')::integer else s.responsorial_number end,
    responsorial_citations = case when p ? 'responsorialCitations'
      then ${textArraySql("p->'responsorialCitations'")} else s.responsorial_citations end,
    suggestion_parts = case when p ? 'suggestionParts'
      then ${textArraySql("p->'suggestionParts'")} else s.suggestion_parts end,
    in_repertoire = case when p ? 'inRepertoire'
      then (p->>'inRepertoire')::boolean else s.in_repertoire end,
    updated_at = now(),
    updated_by = null
  from input
  where s.id = (p->>'id')::uuid
  returning s.id, s.title, s.youtube_video_id, s.authors, s.copyright_owner,
    s.copyright_year, s.source, s.responsorial_book, s.responsorial_number,
    s.responsorial_citations, s.suggestion_parts, s.in_repertoire
)
select u.id::text, u.title, u.youtube_video_id, u.authors, u.copyright_owner,
  u.copyright_year, u.source, u.responsorial_book, u.responsorial_number,
  u.responsorial_citations, u.suggestion_parts, u.in_repertoire,
  exists(select 1 from public.song_lyrics sl where sl.song_id = u.id) as has_lyrics
from updated u;`;
}

function addLyricsSql(songId, lyrics) {
  return `${payloadSql({ id: songId, lyrics })},
written as (
  insert into public.song_lyrics (song_id, lyrics, updated_at, updated_by)
  select (p->>'id')::uuid, btrim(p->>'lyrics'), now(), null
  from input
  on conflict (song_id) do update
  set lyrics = excluded.lyrics, updated_at = now(), updated_by = null
  returning song_id, length(lyrics) as lyric_characters
)
select song_id::text as id, true as has_lyrics, lyric_characters
from written;`;
}

function clearLyricsSql(songId) {
  return `${payloadSql({ id: songId })},
song as (
  select s.id from public.songs s cross join input
  where s.id = (p->>'id')::uuid
),
deleted as (
  delete from public.song_lyrics sl
  using song
  where sl.song_id = song.id
  returning sl.song_id
)
select (p->>'id') as id, false as has_lyrics,
  exists(select 1 from song) as song_exists,
  exists(select 1 from deleted) as changed
from input;`;
}

function showSongSql(songId, includeLyrics = false) {
  return `${payloadSql({ id: songId })},
selected as (
  select s.id, s.title, s.youtube_video_id, s.authors, s.copyright_owner,
    s.copyright_year, s.source, s.responsorial_book, s.responsorial_number,
    s.responsorial_citations, s.suggestion_parts, s.in_repertoire,
    sl.song_id is not null as has_lyrics,
    ${includeLyrics ? "sl.lyrics" : "null::text"} as lyrics
  from public.songs s
  left join public.song_lyrics sl on sl.song_id = s.id
  cross join input
  where s.id = (p->>'id')::uuid
)
select id::text, title, youtube_video_id, authors, copyright_owner,
  copyright_year, source, responsorial_book, responsorial_number,
  responsorial_citations, suggestion_parts, in_repertoire, has_lyrics, lyrics
from selected;`;
}

function listSongsSql(query, limit) {
  return `${payloadSql({ query, limit })},
selected as (
  select s.id, s.title, s.authors, s.in_repertoire, s.suggestion_parts,
    s.responsorial_book, s.responsorial_number, s.responsorial_citations,
    exists(select 1 from public.song_lyrics sl where sl.song_id = s.id) as has_lyrics
  from public.songs s
  cross join input
  where btrim(coalesce(p->>'query', '')) = ''
    or s.title ilike '%' || btrim(p->>'query') || '%'
  order by lower(s.title), lower(s.authors), s.id
  limit (select (p->>'limit')::integer from input)
)
select id::text, title, authors, in_repertoire, suggestion_parts,
  responsorial_book, responsorial_number, responsorial_citations, has_lyrics
from selected;`;
}

function bookletPlanSql(sunday) {
  return `${payloadSql({ sunday })},
selected as (
  select
    plan.sunday,
    plan.celebration_override,
    assignment.part,
    to_jsonb(song) as song,
    canonical.lyrics,
    weekly.lyrics as weekly_lyrics
  from public.plans plan
  join public.plan_songs assignment on assignment.sunday = plan.sunday
  join public.songs song on song.id = assignment.song_id
  left join public.song_lyrics canonical on canonical.song_id = song.id
  left join public.plan_song_lyrics weekly
    on weekly.sunday = assignment.sunday
   and weekly.part = assignment.part
   and weekly.song_id = assignment.song_id
  cross join input
  where plan.sunday = (p->>'sunday')::date
)
select
  sunday::text,
  celebration_override,
  part,
  song,
  lyrics,
  weekly_lyrics
from selected
order by array_position(
  array[
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus',
    'communion', 'communion2', 'recessional'
  ]::text[],
  part
);`;
}

function formatLong(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildBooklet({ sunday, rows, output }) {
  require("../src/domain/liturgical-calendar.js");
  require("../src/app/planner-state.js");
  require("../src/domain/plan-music-data.js");
  require("../src/domain/music-parts.js");
  require("../src/domain/weekly-lyrics.js");
  require("../src/domain/lyrics-presentation.js");
  require("../src/domain/lyrics-booklet.js");
  require("../src/app/lyrics-booklet-controller.js");
  const { jsPDF } = require("jspdf");

  const resolvedSunday = global.LiturgicalCalendar.resolveSunday(sunday);
  if (!resolvedSunday) throw new Error(`${sunday} is not a Sunday`);
  const celebrationOverride = rows[0].celebration_override || null;
  const values = global.PlannerState.summaryValues({
    sunday: resolvedSunday,
    celebration: celebrationOverride || { name: resolvedSunday.n },
    celebrationOverride: Boolean(celebrationOverride),
    formatLong,
    cycleName: cycle => `Year ${cycle}`,
  });

  const songs = {};
  const detailsById = new Map();
  const weeklyLyrics = {};
  rows.forEach(row => {
    const song = global.PlanMusicData.songFromRow({
      ...row.song,
      song_lyrics: { lyrics: row.lyrics },
    });
    songs[row.part] = song;
    detailsById.set(song.id, song);
    if (row.weekly_lyrics) {
      weeklyLyrics[row.part] = { songId: song.id, lyrics: row.weekly_lyrics };
    }
  });
  const prepared = global.LyricsPresentation.prepareAssignments(
    global.MassMusicParts.parts,
    songs,
    detailsById,
    weeklyLyrics,
  );
  if (prepared.missingTitles.length) {
    throw new Error(`Add lyrics for: ${prepared.missingTitles.join(", ")}`);
  }
  const doc = global.LyricsBookletController.buildDocument({
    JsPDF: jsPDF,
    booklet: global.LyricsBooklet,
    date: sunday,
    values,
    assignments: prepared.assignments,
  });
  const outputPath = path.resolve(output || path.join(
    ROOT,
    "output/pdf",
    global.LyricsBooklet.fileName(sunday),
  ));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")));
  const pagination = global.LyricsBooklet.paginateLyrics(prepared.assignments);
  return {
    sunday,
    output: outputPath,
    songs: prepared.assignments.length,
    logical_pages: global.LyricsBooklet.logicalPages({
      date: sunday,
      celebration: values.day,
      meta: values.meta,
      assignments: prepared.assignments,
    }).length,
    imposed_pdf_pages: doc.getNumberOfPages(),
    lyric_font_size: pagination.fontSize || 8.5,
  };
}

function auditPsalmsSql() {
  return `select
  id::text,
  title,
  source,
  suggestion_parts,
  responsorial_book,
  responsorial_number,
  responsorial_citations,
  case
    when nullif(btrim(responsorial_book), '') is null then 'missing book'
    when responsorial_number is null then 'missing number'
    when cardinality(responsorial_citations) = 0 then 'missing exact citation'
    when exists (
      select 1
      from unnest(responsorial_citations) citation
      where nullif(btrim(citation), '') is null
         or citation ~* 'Respond & Acclaim|[[:space:]]+·[[:space:]]+pp\\.'
    ) then 'invalid exact citation'
    else 'complete'
  end as status
from public.songs
where 'psalm' = any(suggestion_parts)
   or nullif(btrim(responsorial_book), '') is not null
order by status desc, lower(title), id;`;
}

function assignSongSql(sunday, part, songId) {
  return `${payloadSql({ sunday, part, id: songId })},
song as (
  select s.id, s.title from public.songs s cross join input
  where s.id = (p->>'id')::uuid
),
plan as (
  insert into public.plans (sunday, updated_at, updated_by)
  select (p->>'sunday')::date, now(), null from input
  where exists(select 1 from song)
  on conflict (sunday) do update
  set updated_at = now(), updated_by = null
  returning sunday
),
assigned as (
  insert into public.plan_songs (sunday, part, song_id, updated_at, updated_by)
  select plan.sunday, p->>'part', song.id, now(), null
  from input, plan, song
  on conflict (sunday, part) do update
  set song_id = excluded.song_id, updated_at = now(), updated_by = null
  returning sunday, part, song_id
)
select a.sunday::text, a.part, a.song_id::text as id, song.title
from assigned a join song on song.id = a.song_id;`;
}

function clearSongSql(sunday, part) {
  return `${payloadSql({ sunday, part })},
deleted as (
  delete from public.plan_songs ps
  using input
  where ps.sunday = (p->>'sunday')::date and ps.part = p->>'part'
  returning ps.sunday, ps.part, ps.song_id
),
touched as (
  update public.plans p0
  set updated_at = now(), updated_by = null
  from input
  where p0.sunday = (p->>'sunday')::date and exists(select 1 from deleted)
  returning p0.sunday
)
select (p->>'sunday') as sunday, p->>'part' as part,
  (select song_id::text from deleted) as previous_song_id,
  exists(select 1 from deleted) as changed
from input;`;
}

function parseSupabaseOutput(stdout) {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed.rows)) throw new Error("Supabase query returned no rows array");
  return parsed.rows;
}

function runQuery(sql, { local = false, runner = spawnSync } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sundaymass-cli-"));
  const file = path.join(directory, "query.sql");
  try {
    fs.writeFileSync(file, `${sql.trim()}\n`, { mode: 0o600 });
    const target = local ? "--local" : "--linked";
    const result = runner(
      "npx",
      [
        "--yes", `supabase@${SUPABASE_VERSION}`, "db", "query",
        target, "--output", "json", "--file", file,
      ],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "Supabase query failed").trim());
    }
    return parseSupabaseOutput(result.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function readLyrics(file, stdin = process.stdin) {
  let value;
  if (file === "-") {
    if (stdin.isTTY) throw new Error("Pipe lyrics to stdin when using --file -");
    value = fs.readFileSync(0, "utf8");
  } else {
    value = fs.readFileSync(path.resolve(file), "utf8");
  }
  const lyrics = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!lyrics) throw new Error("Lyrics file is empty");
  if (lyrics.length > 100000) throw new Error("Lyrics exceed the 100,000-character limit");
  return lyrics;
}

function mutationPreview(command, payload) {
  return [{ dry_run: true, command, ...payload }];
}

function formatRows(rows, { json = false } = {}) {
  if (json) return `${JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2)}\n`;
  if (!rows.length) return "No rows.\n";
  return `${rows.map(row => Object.entries(row)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join("\n")).join("\n\n")}\n`;
}

function requireRows(rows, message) {
  if (!rows.length) throw new Error(message);
  return rows;
}

function allowedMetadataFlags(extra = []) {
  return new Set([
    ...SONG_VALUE_FLAGS.keys(), ...REPEATABLE_FLAGS,
    "repertoire", "non-repertoire", "apply", "dry-run", "json", "local",
    ...extra,
  ]);
}

function execute(argv, dependencies = {}) {
  const parsed = parseArgs(argv);
  const local = parsed.flags.has("local");
  const json = parsed.flags.has("json");
  const apply = parsed.flags.has("apply");
  if (parsed.flags.has("dry-run") && apply) {
    throw new Error("Choose either --dry-run or --apply");
  }
  const query = dependencies.runQuery || ((sql, options) => runQuery(sql, options));
  let rows;

  switch (parsed.command) {
    case "help":
    case "--help":
    case "-h":
      return { text: HELP, rows: null };

    case "list_songs": {
      assertKnownFlags(parsed.flags, new Set(["query", "limit", "json", "local"]));
      if (parsed.positionals.length) throw new Error("list_songs takes no positional arguments");
      const limit = intOption(parsed.flags.get("limit"), {
        defaultValue: 100, min: 1, max: 1000, label: "limit",
      });
      rows = query(listSongsSql(parsed.flags.get("query") || "", limit), { local });
      break;
    }

    case "show_song": {
      assertKnownFlags(parsed.flags, new Set(["lyrics", "json", "local"]));
      if (parsed.positionals.length !== 1) throw new Error("show_song requires one song UUID");
      const id = assertUuid(parsed.positionals[0]);
      rows = requireRows(
        query(showSongSql(id, parsed.flags.has("lyrics")), { local }),
        `Song not found: ${id}`,
      );
      break;
    }

    case "booklet": {
      assertKnownFlags(parsed.flags, new Set(["output", "json", "local"]));
      if (parsed.positionals.length !== 1) throw new Error("booklet requires YYYY-MM-DD");
      const sunday = assertDate(parsed.positionals[0]);
      const planRows = requireRows(
        query(bookletPlanSql(sunday), { local }),
        `No songs selected for ${sunday}`,
      );
      const builder = dependencies.buildBooklet || buildBooklet;
      rows = [builder({
        sunday,
        rows: planRows,
        output: parsed.flags.get("output"),
      })];
      break;
    }

    case "audit_psalms": {
      assertKnownFlags(parsed.flags, new Set(["json", "local"]));
      if (parsed.positionals.length) throw new Error("audit_psalms takes no positional arguments");
      rows = query(auditPsalmsSql(), { local });
      break;
    }

    case "create_song": {
      assertKnownFlags(parsed.flags, allowedMetadataFlags());
      if (parsed.positionals.length) throw new Error("create_song takes no positional arguments");
      const song = songPatch(parsed.flags, { requireTitle: true });
      rows = apply
        ? requireRows(query(createSongSql(song), { local }), "Song creation returned no row")
        : mutationPreview("create_song", song);
      break;
    }

    case "update_song": {
      assertKnownFlags(parsed.flags, allowedMetadataFlags());
      if (parsed.positionals.length !== 1) throw new Error("update_song requires one song UUID");
      const id = assertUuid(parsed.positionals[0]);
      const patch = songPatch(parsed.flags);
      rows = apply
        ? requireRows(query(updateSongSql(id, patch), { local }), `Song not found: ${id}`)
        : mutationPreview("update_song", { id, patch });
      break;
    }

    case "add_lyrics": {
      assertKnownFlags(parsed.flags, new Set(["file", "apply", "dry-run", "json", "local"]));
      if (parsed.positionals.length !== 1) throw new Error("add_lyrics requires one song UUID");
      const id = assertUuid(parsed.positionals[0]);
      const file = parsed.flags.get("file");
      if (!file) throw new Error("add_lyrics requires --file PATH (or --file -)");
      const lyrics = readLyrics(file, dependencies.stdin);
      rows = apply
        ? requireRows(query(addLyricsSql(id, lyrics), { local }), `Song not found: ${id}`)
        : mutationPreview("add_lyrics", { id, lyric_characters: lyrics.length });
      break;
    }

    case "clear_lyrics": {
      assertKnownFlags(parsed.flags, new Set(["apply", "dry-run", "json", "local"]));
      if (parsed.positionals.length !== 1) throw new Error("clear_lyrics requires one song UUID");
      const id = assertUuid(parsed.positionals[0]);
      rows = apply
        ? query(clearLyricsSql(id), { local })
        : mutationPreview("clear_lyrics", { id });
      if (apply && rows[0]?.song_exists === false) throw new Error(`Song not found: ${id}`);
      break;
    }

    case "assign_song": {
      assertKnownFlags(parsed.flags, new Set(["apply", "dry-run", "json", "local"]));
      if (parsed.positionals.length !== 3) {
        throw new Error("assign_song requires YYYY-MM-DD PART SONG_ID");
      }
      const sunday = assertDate(parsed.positionals[0]);
      const part = assertPart(parsed.positionals[1]);
      const id = assertUuid(parsed.positionals[2]);
      rows = apply
        ? requireRows(query(assignSongSql(sunday, part, id), { local }), `Song not found: ${id}`)
        : mutationPreview("assign_song", { sunday, part, id });
      break;
    }

    case "clear_song": {
      assertKnownFlags(parsed.flags, new Set(["apply", "dry-run", "json", "local"]));
      if (parsed.positionals.length !== 2) {
        throw new Error("clear_song requires YYYY-MM-DD PART");
      }
      const sunday = assertDate(parsed.positionals[0]);
      const part = assertPart(parsed.positionals[1]);
      rows = apply
        ? query(clearSongSql(sunday, part), { local })
        : mutationPreview("clear_song", { sunday, part });
      break;
    }

    default:
      throw new Error(`Unknown command: ${parsed.command}\n\n${HELP}`);
  }

  return { text: formatRows(rows, { json }), rows };
}

function main() {
  try {
    const result = execute(process.argv.slice(2));
    process.stdout.write(result.text);
  } catch (error) {
    process.stderr.write(`sundaymass: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  HELP,
  MUSIC_PARTS,
  addLyricsSql,
  auditPsalmsSql,
  bookletPlanSql,
  buildBooklet,
  assertDate,
  assertPart,
  assertUuid,
  clearLyricsSql,
  clearSongSql,
  createSongSql,
  execute,
  formatRows,
  listSongsSql,
  parseArgs,
  parseSupabaseOutput,
  payloadSql,
  readLyrics,
  runQuery,
  showSongSql,
  songPatch,
  updateSongSql,
};
