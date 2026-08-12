const test = require("node:test");
const assert = require("node:assert/strict");

function localSupabaseConfig() {
  return {
    API_URL: process.env.SUPABASE_API_URL || "http://127.0.0.1:54321",
    ANON_KEY: process.env.SUPABASE_ANON_KEY
      || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  };
}

function client(config, token, apiKey = config.ANON_KEY) {
  return async function request(path, { method = "GET", body, headers = {} } = {}) {
    const response = await fetch(config.API_URL + path, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { data, response };
  };
}

async function expectOk(result) {
  assert.ok(
    result.response.ok,
    `${result.response.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}

test("local Supabase enforces the editor and lyric privacy matrix", async t => {
  const config = localSupabaseConfig();
  const anonymous = client(config, config.ANON_KEY);
  const service = client(config, config.SERVICE_ROLE_KEY, config.SERVICE_ROLE_KEY);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "Local-Test-Password-492!";
  const sunday = "2049-01-03";
  const userIds = [];
  const songIds = [];
  const readingCitations = [];

  async function createUser(label) {
    const data = await expectOk(await service("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email: `${label}-${suffix}@example.test`,
        password,
        email_confirm: true,
      },
    }));
    userIds.push(data.id);
    const session = await expectOk(await anonymous("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: data.email, password },
    }));
    return { id: data.id, request: client(config, session.access_token) };
  }

  const nonEditor = await createUser("non-editor");
  const choir = await createUser("choir");
  const editor = await createUser("editor");

  try {
    await expectOk(await service("/rest/v1/editors", {
      method: "POST",
      body: { user_id: editor.id },
    }));
    await expectOk(await service("/rest/v1/choir_members", {
      method: "POST",
      body: { user_id: choir.id },
    }));

    const [fixtureSong] = await expectOk(await service("/rest/v1/songs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        title: `Privacy fixture ${suffix}`,
        authors: "Test author",
        suggestion_parts: ["entrance"],
      },
    }));
    songIds.push(fixtureSong.id);
    await expectOk(await service("/rest/v1/song_lyrics", {
      method: "POST",
      body: { song_id: fixtureSong.id, lyrics: "Private test lyrics" },
    }));

    await t.test("public metadata is readable but lyrics and vectors are not", async () => {
      const metadata = await anonymous(
        `/rest/v1/songs?id=eq.${fixtureSong.id}&select=id,title`,
      );
      assert.equal(metadata.response.status, 200);
      assert.deepEqual(metadata.data, [{
        id: fixtureSong.id,
        title: `Privacy fixture ${suffix}`,
      }]);

      const anonymousLyrics = await anonymous(
        `/rest/v1/song_lyrics?song_id=eq.${fixtureSong.id}&select=lyrics`,
      );
      assert.ok([401, 403].includes(anonymousLyrics.response.status));

      const anonymousVectors = await anonymous("/rest/v1/song_embeddings?select=song_id");
      assert.ok([401, 403].includes(anonymousVectors.response.status));

      for (const [table, auditColumns] of [
        ["plans", "sunday,updated_by"],
        ["songs", "id,created_by,updated_by"],
        ["plan_songs", "sunday,part,updated_by"],
      ]) {
        for (const [role, request] of [
          ["anonymous", anonymous],
          ["editor", editor.request],
        ]) {
          const audit = await request(
            `/rest/v1/${table}?select=${auditColumns}&limit=1`,
          );
          assert.ok(
            [401, 403].includes(audit.response.status),
            `${role} ${table} audit columns returned ${audit.response.status}`,
          );
        }
      }

      const serviceAudit = await service(
        `/rest/v1/songs?id=eq.${fixtureSong.id}&select=id,created_by,updated_by`,
      );
      assert.equal(serviceAudit.response.status, 200);
      assert.equal(serviceAudit.data[0].id, fixtureSong.id);
    });

    await t.test("authenticated non-editors cannot read lyrics or mutate songs", async () => {
      const lyrics = await nonEditor.request(
        `/rest/v1/song_lyrics?song_id=eq.${fixtureSong.id}&select=lyrics`,
      );
      assert.equal(lyrics.response.status, 200);
      assert.deepEqual(lyrics.data, []);

      const mutation = await nonEditor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: { p_title: "Forbidden song" },
      });
      assert.ok(!mutation.response.ok);
      assert.match(JSON.stringify(mutation.data), /Editor access required/i);

      const vectors = await nonEditor.request("/rest/v1/song_embeddings?select=song_id");
      assert.ok([401, 403].includes(vectors.response.status));
    });

    await t.test("choir members can read any lyrics but cannot mutate songs", async () => {
      const lyrics = await choir.request(
        `/rest/v1/song_lyrics?song_id=eq.${fixtureSong.id}&select=lyrics`,
      );
      assert.equal(lyrics.response.status, 200);
      assert.deepEqual(lyrics.data, [{ lyrics: "Private test lyrics" }]);

      const mutation = await choir.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: { p_title: "Forbidden choir mutation" },
      });
      assert.ok(!mutation.response.ok);
      assert.match(JSON.stringify(mutation.data), /Editor access required/i);
    });

    await t.test("song requests are choir-created, publicly readable, and editor-resolved", async () => {
      const anonymousRead = await anonymous("/rest/v1/song_requests?select=id");
      assert.equal(anonymousRead.response.status, 200);
      const anonymousCreate = await anonymous("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: { p_title: "Anonymous request" },
      });
      assert.ok(!anonymousCreate.response.ok);

      const outsiderCreate = await nonEditor.request("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: { p_title: "Outsider request" },
      });
      assert.ok(!outsiderCreate.response.ok);
      assert.match(JSON.stringify(outsiderCreate.data), /Choir member access required/i);

      const requestId = await expectOk(await choir.request("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: {
          p_song_id: fixtureSong.id,
          p_note: "Please sing this again",
          p_sunday: sunday,
          p_part: "offertory",
        },
      }));
      const freeTextId = await expectOk(await choir.request("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: {
          p_title: `Requested new song ${suffix}`,
          p_youtube_video_id: "AAAAAAAAAAA",
        },
      }));

      const missingDetails = await choir.request("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: { p_note: "No song and no title" },
      });
      assert.ok(!missingDetails.response.ok);
      const badPart = await choir.request("/rest/v1/rpc/create_song_request", {
        method: "POST",
        body: { p_title: "Bad part", p_part: "not-a-part" },
      });
      assert.ok(!badPart.response.ok);

      for (const [role, request] of [
        ["anonymous", anonymous],
        ["outsider", nonEditor.request],
        ["choir", choir.request],
        ["editor", editor.request],
      ]) {
        const audit = await request(
          `/rest/v1/song_requests?id=eq.${requestId}&select=id,created_by`,
        );
        assert.ok(
          [401, 403].includes(audit.response.status),
          `${role} song_requests audit columns returned ${audit.response.status}`,
        );
      }

      const pending = await expectOk(await anonymous(
        "/rest/v1/song_requests?status=eq.pending&select=id,song_id,title,note,status",
      ));
      assert.ok(pending.some(row => row.id === requestId && row.song_id === fixtureSong.id));
      assert.ok(pending.some(row => row.id === freeTextId
        && row.title === `Requested new song ${suffix}`));
      const outsiderPending = await expectOk(await nonEditor.request(
        "/rest/v1/song_requests?status=eq.pending&select=id",
      ));
      assert.ok(outsiderPending.some(row => row.id === requestId));

      const choirResolve = await choir.request("/rest/v1/rpc/resolve_song_request", {
        method: "POST",
        body: { p_request_id: requestId, p_status: "accepted" },
      });
      assert.ok(!choirResolve.response.ok);
      assert.match(JSON.stringify(choirResolve.data), /Editor access required/i);

      await expectOk(await editor.request("/rest/v1/rpc/resolve_song_request", {
        method: "POST",
        body: { p_request_id: requestId, p_status: "accepted" },
      }));
      await expectOk(await editor.request("/rest/v1/rpc/resolve_song_request", {
        method: "POST",
        body: { p_request_id: freeTextId, p_status: "declined" },
      }));
      const repeatedResolve = await editor.request("/rest/v1/rpc/resolve_song_request", {
        method: "POST",
        body: { p_request_id: requestId, p_status: "declined" },
      });
      assert.ok(!repeatedResolve.response.ok);
      assert.match(JSON.stringify(repeatedResolve.data), /Request not found/i);

      const resolved = await expectOk(await service(
        `/rest/v1/song_requests?id=eq.${requestId}&select=status,resolved_by`,
      ));
      assert.deepEqual(resolved, [{ status: "accepted", resolved_by: editor.id }]);
    });

    await t.test("editors can read lyrics and preserve an empty suggestion list", async () => {
      const lyrics = await editor.request(
        `/rest/v1/song_lyrics?song_id=eq.${fixtureSong.id}&select=lyrics`,
      );
      assert.equal(lyrics.response.status, 200);
      assert.deepEqual(lyrics.data, [{ lyrics: "Private test lyrics" }]);

      const createdId = await expectOk(await editor.request(
        "/rest/v1/rpc/create_and_assign_song",
        {
          method: "POST",
          body: {
            p_sunday: sunday,
            p_part: "entrance",
            p_title: `Unclassified ${suffix}`,
            p_suggestion_parts: [],
          },
        },
      ));
      songIds.push(createdId);
      const stored = await expectOk(await service(
        `/rest/v1/songs?id=eq.${createdId}&select=id,suggestion_parts`,
      ));
      assert.deepEqual(stored, [{ id: createdId, suggestion_parts: [] }]);

      const duplicateId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Unclassified ${suffix}`,
          p_suggestion_parts: [],
        },
      }));
      songIds.push(duplicateId);
      assert.notEqual(duplicateId, createdId);

      const publicPlan = await anonymous(
        `/rest/v1/plans?sunday=eq.${sunday}&select=sunday`,
      );
      assert.equal(publicPlan.response.status, 200);
      assert.deepEqual(publicPlan.data, [{ sunday }]);
      const publicAssignment = await anonymous(
        `/rest/v1/plan_songs?sunday=eq.${sunday}&part=eq.entrance&select=song_id`,
      );
      assert.equal(publicAssignment.response.status, 200);
      assert.deepEqual(publicAssignment.data, [{ song_id: createdId }]);
    });

    await t.test("manual assignment remains unrestricted while invalid parts fail", async () => {
      const memorialId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Memorial-only ${suffix}`,
          p_suggestion_parts: ["memorial"],
          p_in_repertoire: false,
        },
      }));
      songIds.push(memorialId);
      await expectOk(await editor.request("/rest/v1/rpc/assign_plan_song", {
        method: "POST",
        body: { p_sunday: sunday, p_part: "communion", p_song_id: memorialId },
      }));
      const assignment = await expectOk(await service(
        `/rest/v1/plan_songs?sunday=eq.${sunday}&part=eq.communion&select=song_id`,
      ));
      assert.deepEqual(assignment, [{ song_id: memorialId }]);
      const promoted = await expectOk(await service(
        `/rest/v1/songs?id=eq.${memorialId}&select=in_repertoire`,
      ));
      assert.deepEqual(promoted, [{ in_repertoire: true }]);

      const invalid = await editor.request("/rest/v1/rpc/assign_plan_song", {
        method: "POST",
        body: { p_sunday: sunday, p_part: "not-a-part", p_song_id: memorialId },
      });
      assert.ok(!invalid.response.ok);
      assert.match(JSON.stringify(invalid.data), /Invalid music part/i);
    });

    await t.test("Psalm matching is structured and weekly lyric copies remain private", async () => {
      const exactPsalmId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Exact Psalm ${suffix}`,
          p_responsorial_book: "Psalm",
          p_responsorial_number: 85,
          p_responsorial_citations: ["Psalm 85:9, 10, 11-12, 13-14"],
          p_lyrics: "Response:\nExact response\n\n1. Cantor verse",
          p_suggestion_parts: ["psalm"],
        },
      }));
      const otherPsalmId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Other Psalm ${suffix}`,
          p_responsorial_book: "Psalm",
          p_responsorial_number: 85,
          p_responsorial_citations: ["Psalm 85:2-8"],
          p_lyrics: "Response:\nOther response\n\n1. Other verse",
          p_suggestion_parts: ["psalm"],
        },
      }));
      songIds.push(exactPsalmId, otherPsalmId);

      const suggestions = await expectOk(await anonymous(
        "/rest/v1/rpc/suggest_psalms_for_reading",
        {
          method: "POST",
          body: {
            p_citation: "Psalm 85:9, 10, 11-12, 13-14",
            p_limit: 3,
          },
        },
      ));
      assert.equal(suggestions[0].id, exactPsalmId);
      assert.match(suggestions[0].suggestion_reason, /^Exact /);
      assert.equal(Object.hasOwn(suggestions[0], "lyrics"), false);

      await expectOk(await editor.request("/rest/v1/rpc/assign_plan_song", {
        method: "POST",
        body: { p_sunday: sunday, p_part: "psalm", p_song_id: exactPsalmId },
      }));
      await expectOk(await editor.request("/rest/v1/rpc/save_plan_song_lyrics", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_part: "psalm",
          p_song_id: exactPsalmId,
          p_lyrics: "Response:\nEdited response\n\n1. Included cantor verse",
        },
      }));

      const anonymousLyrics = await anonymous(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=lyrics`,
      );
      assert.ok([401, 403].includes(anonymousLyrics.response.status));
      const nonEditorLyrics = await nonEditor.request(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=lyrics`,
      );
      assert.equal(nonEditorLyrics.response.status, 200);
      assert.deepEqual(nonEditorLyrics.data, []);
      const choirLyrics = await expectOk(await choir.request(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=song_id,lyrics`,
      ));
      assert.deepEqual(choirLyrics, [{
        song_id: exactPsalmId,
        lyrics: "Response:\nEdited response\n\n1. Included cantor verse",
      }]);
      const editorLyrics = await expectOk(await editor.request(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=song_id,lyrics`,
      ));
      assert.deepEqual(editorLyrics, [{
        song_id: exactPsalmId,
        lyrics: "Response:\nEdited response\n\n1. Included cantor verse",
      }]);

      await expectOk(await editor.request("/rest/v1/rpc/assign_plan_song", {
        method: "POST",
        body: { p_sunday: sunday, p_part: "psalm", p_song_id: otherPsalmId },
      }));
      assert.deepEqual(await expectOk(await editor.request(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=song_id`,
      )), []);

      await expectOk(await editor.request("/rest/v1/rpc/save_plan_song_lyrics", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_part: "psalm",
          p_song_id: otherPsalmId,
          p_lyrics: "Response:\nNew assignment edit\n\n1. New assignment verse",
        },
      }));
      await expectOk(await editor.request("/rest/v1/rpc/clear_plan_song_lyrics", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_part: "psalm",
          p_song_id: exactPsalmId,
        },
      }));
      assert.deepEqual(await expectOk(await editor.request(
        `/rest/v1/plan_song_lyrics?sunday=eq.${sunday}&select=song_id`,
      )), [{ song_id: otherPsalmId }]);
      await expectOk(await editor.request("/rest/v1/rpc/clear_plan_song_lyrics", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_part: "psalm",
          p_song_id: otherPsalmId,
        },
      }));
    });

    await t.test("celebration replacement atomically clears individual reading overrides", async () => {
      const denied = await nonEditor.request("/rest/v1/rpc/save_celebration_override", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_override: { key: "forbidden", title: "Forbidden" },
        },
      });
      assert.ok(!denied.response.ok);
      assert.match(JSON.stringify(denied.data), /Editor access required/i);

      await expectOk(await editor.request("/rest/v1/rpc/save_reading_override", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_slot: "first",
          p_override: {
            citation: "Isaiah 1:1",
            book: "Isaiah",
            segments: [{ chapter: 1, verses: [1] }],
          },
        },
      }));
      await expectOk(await editor.request("/rest/v1/rpc/save_celebration_override", {
        method: "POST",
        body: {
          p_sunday: sunday,
          p_override: {
            id: "test-solemnity",
            name: "Test solemnity",
            sourceDate: "2049-01-02",
            readings: {
              first: "Isaiah 1:1",
              psalm: "Psalm 1:1",
              gospel: "John 1:1",
            },
          },
        },
      }));

      const [plan] = await expectOk(await service(
        `/rest/v1/plans?sunday=eq.${sunday}&select=reading_overrides,celebration_override`,
      ));
      assert.deepEqual(plan.reading_overrides, {});
      assert.equal(plan.celebration_override.id, "test-solemnity");
    });

    await t.test("every application mutation rejects a non-editor", async () => {
      const validReading = {
        citation: "Isaiah 1:1",
        book: "Isaiah",
        segments: [{ chapter: 1, verses: [1] }],
      };
      const validCelebration = {
        id: "forbidden-solemnity",
        name: "Forbidden solemnity",
        sourceDate: "2049-01-02",
        readings: {
          first: "Isaiah 1:1",
          psalm: "Psalm 1:1",
          gospel: "John 1:1",
        },
      };
      const attempts = [
        ["assign_plan_song", { p_sunday: sunday, p_part: "offertory", p_song_id: fixtureSong.id }],
        ["clear_plan_song", { p_sunday: sunday, p_part: "entrance" }],
        ["create_song", { p_title: "Forbidden song" }],
        ["create_and_assign_song", {
          p_sunday: sunday,
          p_part: "offertory",
          p_title: "Forbidden assigned song",
        }],
        ["update_song", { p_song_id: fixtureSong.id, p_title: "Forbidden title" }],
        ["save_plan_song_lyrics", {
          p_sunday: sunday,
          p_part: "entrance",
          p_song_id: fixtureSong.id,
          p_lyrics: "Forbidden weekly lyrics",
        }],
        ["clear_plan_song_lyrics", {
          p_sunday: sunday,
          p_part: "entrance",
          p_song_id: fixtureSong.id,
        }],
        ["save_reading_override", {
          p_sunday: sunday,
          p_slot: "first",
          p_override: validReading,
        }],
        ["clear_reading_override", { p_sunday: sunday, p_slot: "first" }],
        ["save_celebration_override", {
          p_sunday: sunday,
          p_override: validCelebration,
        }],
        ["clear_celebration_override", { p_sunday: sunday }],
      ];

      for (const [name, body] of attempts) {
        const result = await nonEditor.request(`/rest/v1/rpc/${name}`, {
          method: "POST",
          body,
        });
        assert.equal(result.response.ok, false, `${name} unexpectedly accepted a non-editor`);
      }
    });

    await t.test("position filtering happens before semantic ranking", async () => {
      const entranceId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Entrance candidate ${suffix}`,
          p_suggestion_parts: ["entrance"],
        },
      }));
      const communionId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Communion candidate ${suffix}`,
          p_suggestion_parts: ["communion"],
        },
      }));
      const libraryEntranceId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Extended-library entrance ${suffix}`,
          p_suggestion_parts: ["entrance"],
          p_in_repertoire: false,
        },
      }));
      const gospelEntranceId = await expectOk(await editor.request("/rest/v1/rpc/create_song", {
        method: "POST",
        body: {
          p_title: `Gospel entrance ${suffix}`,
          p_suggestion_parts: ["entrance"],
        },
      }));
      songIds.push(entranceId, communionId, libraryEntranceId, gospelEntranceId);

      const citation = `Test Reading ${suffix}`;
      const gospelCitation = `Test Gospel ${suffix}`;
      readingCitations.push(citation, gospelCitation);
      const embedding = new Array(384).fill(0);
      embedding[0] = 1;
      const gospelEmbedding = new Array(384).fill(0);
      gospelEmbedding[1] = 1;
      await expectOk(await service("/rest/v1/reading_embeddings", {
        method: "POST",
        body: [
          {
            citation,
            content_hash: `reading-${suffix}`,
            embedding,
          },
          {
            citation: gospelCitation,
            content_hash: `gospel-${suffix}`,
            embedding: gospelEmbedding,
          },
        ],
      }));
      await expectOk(await service("/rest/v1/song_embeddings", {
        method: "POST",
        body: [
          {
            song_id: entranceId,
            content_hash: `entrance-${suffix}`,
            embedding,
          },
          {
            song_id: communionId,
            content_hash: `communion-${suffix}`,
            embedding,
          },
          {
            song_id: libraryEntranceId,
            content_hash: `library-entrance-${suffix}`,
            embedding,
          },
          {
            song_id: gospelEntranceId,
            content_hash: `gospel-entrance-${suffix}`,
            embedding: gospelEmbedding,
          },
        ],
      }));

      const suggestions = await expectOk(await anonymous(
        "/rest/v1/rpc/suggest_songs_for_readings",
        {
          method: "POST",
          body: {
            p_citations: [citation, gospelCitation],
            p_part: "entrance",
            p_limit: 3,
          },
        },
      ));
      assert.equal(
        suggestions.find(song => song.reading_citation === citation)?.id,
        entranceId,
      );
      assert.equal(
        suggestions.find(song => song.reading_citation === gospelCitation)?.id,
        gospelEntranceId,
      );
      assert.ok(suggestions.some(song => song.in_repertoire === false));
      assert.equal(Object.hasOwn(suggestions[0], "lyrics"), false);
      assert.equal(Object.hasOwn(suggestions[0], "embedding"), false);
    });
  } finally {
    await service(`/rest/v1/song_requests?created_by=eq.${choir.id}`, { method: "DELETE" });
    await service(`/rest/v1/plan_songs?sunday=eq.${sunday}`, { method: "DELETE" });
    await service(`/rest/v1/plans?sunday=eq.${sunday}`, { method: "DELETE" });
    for (const citation of readingCitations) {
      await service(
        `/rest/v1/reading_embeddings?citation=eq.${encodeURIComponent(citation)}`,
        { method: "DELETE" },
      );
    }
    for (const songId of songIds) {
      await service(`/rest/v1/song_embeddings?song_id=eq.${songId}`, { method: "DELETE" });
      await service(`/rest/v1/song_lyrics?song_id=eq.${songId}`, { method: "DELETE" });
      await service(`/rest/v1/songs?id=eq.${songId}`, { method: "DELETE" });
    }
    await service(`/rest/v1/editors?user_id=eq.${editor.id}`, { method: "DELETE" });
    await service(`/rest/v1/choir_members?user_id=eq.${choir.id}`, { method: "DELETE" });
    for (const userId of userIds) {
      await service(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    }
  }
});
