const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cli = require("../scripts/sundaymass-cli.js");

const SONG_ID = "11111111-1111-4111-8111-111111111111";

test("mutating commands use UUIDs and never accept titles as identifiers", () => {
  assert.throws(
    () => cli.execute(["show_song", "Harden not your heart"], { runQuery() {} }),
    /must be a UUID/,
  );
  assert.throws(
    () => cli.execute(["update_song", "Table of Plenty", "--authors", "Dan Schutte"]),
    /must be a UUID/,
  );
  assert.throws(
    () => cli.execute(["import", "book.pdf"]),
    /Unknown command: import/,
  );
});

test("song creation defaults to repertoire and mutations default to dry-run", () => {
  let calls = 0;
  const result = cli.execute(
    [
      "create_song", "--title", "New Psalm",
      "--suggestion-part", "psalm",
      "--responsorial-book", "Psalm",
      "--responsorial-number", "85",
      "--responsorial-citation", "Psalm 85:9-14",
      "--json",
    ],
    { runQuery() { calls += 1; } },
  );

  assert.equal(calls, 0);
  assert.deepEqual(result.rows, [{
    dry_run: true,
    command: "create_song",
    title: "New Psalm",
    youtubeVideoId: "",
    authors: "",
    copyrightOwner: "",
    copyrightYear: "",
    source: "",
    responsorialBook: "Psalm",
    responsorialNumber: 85,
    responsorialCitations: ["Psalm 85:9-14"],
    suggestionParts: ["psalm"],
    inRepertoire: true,
  }]);
});

test("non-repertoire creation validates YouTube IDs and applies through SQL", () => {
  let sql = "";
  const result = cli.execute([
    "create_song",
    "--title", "A setting",
    "--youtube-id", "D6_KModMCtg",
    "--non-repertoire",
    "--apply",
  ], {
    runQuery(value) {
      sql = value;
      return [{
        id: SONG_ID,
        title: "A setting",
        in_repertoire: false,
        has_lyrics: false,
      }];
    },
  });

  assert.equal(result.rows[0].id, SONG_ID);
  assert.match(sql, /insert into public\.songs/i);
  assert.doesNotMatch(sql, /A setting|D6_KModMCtg/);
  assert.throws(
    () => cli.execute(["create_song", "--title", "Bad", "--youtube-id", "not-an-id"]),
    /11-character YouTube video ID/,
  );
});

test("metadata updates patch a UUID-targeted row", () => {
  let sql = "";
  cli.execute([
    "update_song", SONG_ID,
    "--source", "Respond & Acclaim 2026",
    "--non-repertoire",
    "--apply",
  ], {
    runQuery(value) {
      sql = value;
      return [{ id: SONG_ID, title: "Existing song", in_repertoire: false }];
    },
  });

  assert.match(sql, /update public\.songs/i);
  assert.match(sql, /where s\.id = \(p->>'id'\)::uuid/i);
  assert.doesNotMatch(sql, /Respond & Acclaim 2026/);
});

test("responsorial metadata is parameterized and the audit is read-only", () => {
  let createSql = "";
  cli.execute([
    "create_song",
    "--title", "Canticle",
    "--suggestion-part", "psalm",
    "--responsorial-book", "Isaiah",
    "--responsorial-number", "12",
    "--responsorial-citation", "Isaiah 12:2-3, 4, 5-6",
    "--apply",
  ], {
    runQuery(sql) {
      createSql = sql;
      return [{ id: SONG_ID, title: "Canticle" }];
    },
  });
  assert.match(createSql, /responsorial_book, responsorial_number, responsorial_citations/i);
  assert.doesNotMatch(createSql, /Isaiah 12|Canticle/);

  let auditSql = "";
  cli.execute(["audit_psalms", "--json"], {
    runQuery(sql) {
      auditSql = sql;
      return [];
    },
  });
  assert.match(auditSql, /missing exact citation/i);
  assert.match(auditSql, /invalid exact citation/i);
  assert.match(auditSql, /Respond & Acclaim/i);
  assert.match(auditSql, /pp\\\./i);
  assert.doesNotMatch(auditSql, /\b(insert|update|delete)\b/i);
});

test("lyrics are read from a file, hidden from previews, and encoded in SQL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sundaymass-cli-test-"));
  const lyricsPath = path.join(directory, "lyrics.txt");
  fs.writeFileSync(lyricsPath, "First line\nSecond line\n");
  try {
    const preview = cli.execute([
      "add_lyrics", SONG_ID, "--file", lyricsPath, "--json",
    ]);
    assert.deepEqual(preview.rows, [{
      dry_run: true,
      command: "add_lyrics",
      id: SONG_ID,
      lyric_characters: 22,
    }]);
    assert.doesNotMatch(preview.text, /First line/);

    let sql = "";
    cli.execute([
      "add_lyrics", SONG_ID, "--file", lyricsPath, "--apply",
    ], {
      runQuery(value) {
        sql = value;
        return [{ id: SONG_ID, has_lyrics: true, lyric_characters: 22 }];
      },
    });
    assert.match(sql, /insert into public\.song_lyrics/i);
    assert.doesNotMatch(sql, /First line|Second line/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("plan assignment validates dates, parts, and song UUIDs before querying", () => {
  const preview = cli.execute([
    "assign_song", "2026-08-02", "psalm", SONG_ID, "--json",
  ]);
  assert.deepEqual(preview.rows, [{
    dry_run: true,
    command: "assign_song",
    sunday: "2026-08-02",
    part: "psalm",
    id: SONG_ID,
  }]);
  assert.throws(
    () => cli.execute(["assign_song", "2026-02-31", "psalm", SONG_ID]),
    /valid date/,
  );
  assert.throws(
    () => cli.execute(["assign_song", "2026-08-02", "not-a-part", SONG_ID]),
    /Invalid music part/,
  );
});

test("Supabase JSON output is parsed without trusting wrapper metadata", () => {
  assert.deepEqual(
    cli.parseSupabaseOutput(JSON.stringify({
      boundary: "opaque",
      rows: [{ id: SONG_ID }],
      warning: "untrusted rows",
    })),
    [{ id: SONG_ID }],
  );
  assert.throws(() => cli.parseSupabaseOutput("{}"), /no rows array/);
});
