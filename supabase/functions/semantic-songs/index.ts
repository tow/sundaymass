import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  songEmbeddingContent,
  staleSongIds,
  storedSongEmbeddingHash,
} from "./song-content.mjs";
import { embeddingChunks, parseSemanticRequest } from "./request.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const model = new Supabase.ai.Session("gte-small");
const encoder = new TextEncoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function vector(value: string) {
  const parts = embeddingChunks(value);
  const vectors: number[][] = [];
  for (const part of parts) {
    vectors.push(await model.run(part, {
      mean_pool: true,
      normalize: true,
    }) as number[]);
  }
  const average = new Array(384).fill(0);
  vectors.forEach((embedding, index) => {
    const weight = parts[index].length;
    embedding.forEach((coordinate, coordinateIndex) => {
      average[coordinateIndex] += coordinate * weight;
    });
  });
  const magnitude = Math.sqrt(average.reduce((sum, coordinate) => sum + coordinate ** 2, 0));
  return average.map(coordinate => coordinate / (magnitude || 1));
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceKey || !authorization) {
    return json({ error: "Authentication unavailable" }, 401);
  }

  const bearerToken = authorization.replace(/^Bearer\s+/i, "");
  const serviceRequest = bearerToken === serviceKey;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  if (!serviceRequest) {
    const { data: membership, error: membershipError } = await userClient
      .from("editors")
      .select("user_id")
      .maybeSingle();
    if (membershipError || !membership) return json({ error: "Editor access required" }, 403);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const command = parseSemanticRequest(body);

  if (command.action === "suggest") {
    const { citations, part } = command;
    if (!citations.length || !part) return json({ songs: [] });
    const { data, error } = await userClient.rpc("suggest_songs_for_readings", {
      p_citations: citations,
      p_part: part,
      p_limit: 3,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ songs: data || [] });
  }

  if (command.action === "status") {
    const [songs, readingVectors] = await Promise.all([
      admin.from("songs").select(
        "id,title,authors,source,song_lyrics(lyrics),song_embeddings(content_hash)",
      ),
      admin.from("reading_embeddings").select("citation", { count: "exact", head: true }),
    ]);
    if (songs.error || readingVectors.error) {
      return json({ error: songs.error?.message || readingVectors.error?.message }, 500);
    }
    const rows = songs.data || [];
    const staleIds = await staleSongIds(rows, digest);
    return json({
      songs: rows.length,
      embeddedSongs: rows.filter(song => storedSongEmbeddingHash(song)).length,
      embeddedReadings: readingVectors.count || 0,
      staleSongIds: staleIds,
    });
  }

  if (command.action === "sync-songs") {
    const { songIds } = command;
    if (!songIds.length) return json({ processed: 0, skipped: 0 });
    const { data: songs, error } = await admin
      .from("songs")
      .select("id,title,youtube_url,authors,copyright_owner,copyright_year,source,song_lyrics(lyrics)")
      .in("id", songIds);
    if (error) return json({ error: error.message }, 500);

    let processed = 0;
    let skipped = 0;
    for (const song of songs || []) {
      const content = songEmbeddingContent(song);
      const contentHash = await digest(content);
      const { data: existing } = await admin
        .from("song_embeddings")
        .select("content_hash")
        .eq("song_id", song.id)
        .maybeSingle();
      if (existing?.content_hash === contentHash) {
        skipped++;
        continue;
      }
      const embedding = await vector(content);
      const { error: updateError } = await admin.from("song_embeddings").upsert({
        song_id: song.id,
        content_hash: contentHash,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      });
      if (updateError) return json({ error: updateError.message }, 500);
      processed++;
    }
    return json({ processed, skipped });
  }

  if (command.action === "sync-readings") {
    const { readings } = command;
    let processed = 0;
    let skipped = 0;
    for (const reading of readings) {
      const { citation, text } = reading;
      const content = `${citation}\n${text}`;
      const contentHash = await digest(content);
      const { data: existing } = await admin
        .from("reading_embeddings")
        .select("content_hash")
        .eq("citation", citation)
        .maybeSingle();
      if (existing?.content_hash === contentHash) {
        skipped++;
        continue;
      }
      const embedding = await vector(content);
      const { error } = await admin.from("reading_embeddings").upsert({
        citation,
        content_hash: contentHash,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      processed++;
    }
    return json({ processed, skipped });
  }

  return json({ error: "Unknown action" }, 400);
});
