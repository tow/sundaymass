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
  const editor = await createUser("editor");

  try {
    await expectOk(await service("/rest/v1/editors", {
      method: "POST",
      body: { user_id: editor.id },
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

      const invalid = await editor.request("/rest/v1/rpc/assign_plan_song", {
        method: "POST",
        body: { p_sunday: sunday, p_part: "not-a-part", p_song_id: memorialId },
      });
      assert.ok(!invalid.response.ok);
      assert.match(JSON.stringify(invalid.data), /Invalid music part/i);
    });
  } finally {
    await service(`/rest/v1/plan_songs?sunday=eq.${sunday}`, { method: "DELETE" });
    await service(`/rest/v1/plans?sunday=eq.${sunday}`, { method: "DELETE" });
    for (const songId of songIds) {
      await service(`/rest/v1/song_lyrics?song_id=eq.${songId}`, { method: "DELETE" });
      await service(`/rest/v1/songs?id=eq.${songId}`, { method: "DELETE" });
    }
    await service(`/rest/v1/editors?user_id=eq.${editor.id}`, { method: "DELETE" });
    for (const userId of userIds) {
      await service(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    }
  }
});
