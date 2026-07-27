import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function chunks(value: string) {
  const result: string[] = [];
  let remaining = value.trim().slice(0, 30000);
  while (remaining) {
    if (remaining.length <= 1600) {
      result.push(remaining);
      break;
    }
    const candidate = remaining.slice(0, 1600);
    const splitAt = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf(" "));
    const end = splitAt > 1000 ? splitAt : 1600;
    result.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (result.length <= 4) return result;
  return [0, 1 / 3, 2 / 3, 1]
    .map(position => result[Math.round(position * (result.length - 1))])
    .filter((part, index, selected) => selected.indexOf(part) === index);
}

async function vector(value: string) {
  const parts = chunks(value);
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
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "suggest") {
    const citations = Array.isArray(body.citations)
      ? body.citations.filter((value: unknown) => typeof value === "string").slice(0, 8)
      : [];
    if (!citations.length) return json({ songs: [] });
    const { data, error } = await userClient.rpc("suggest_songs_for_readings", {
      p_citations: citations,
      p_limit: 3,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ songs: data || [] });
  }

  if (action === "status") {
    const [songs, readingVectors] = await Promise.all([
      admin.from("songs").select(
        "id,updated_at,song_lyrics(updated_at),song_embeddings(updated_at)",
      ),
      admin.from("reading_embeddings").select("citation", { count: "exact", head: true }),
    ]);
    if (songs.error || readingVectors.error) {
      return json({ error: songs.error?.message || readingVectors.error?.message }, 500);
    }
    const rows = songs.data || [];
    const relationValue = (
      relation: { updated_at?: string } | { updated_at?: string }[] | null,
    ) => Array.isArray(relation) ? relation[0]?.updated_at : relation?.updated_at;
    const staleSongIds = rows.filter(song => {
      const lyricsUpdatedAt = relationValue(song.song_lyrics);
      const embeddingUpdatedAt = relationValue(song.song_embeddings);
      const contentUpdatedAt = Math.max(
        Date.parse(song.updated_at),
        lyricsUpdatedAt ? Date.parse(lyricsUpdatedAt) : 0,
      );
      return !embeddingUpdatedAt || Date.parse(embeddingUpdatedAt) < contentUpdatedAt;
    }).map(song => song.id);
    return json({
      songs: rows.length,
      embeddedSongs: rows.length - rows.filter(
        song => !relationValue(song.song_embeddings),
      ).length,
      embeddedReadings: readingVectors.count || 0,
      staleSongIds,
    });
  }

  if (action === "sync-songs") {
    const songIds = Array.isArray(body.songIds)
      ? body.songIds.filter((value: unknown) => typeof value === "string").slice(0, 20)
      : [];
    if (!songIds.length) return json({ processed: 0, skipped: 0 });
    const { data: songs, error } = await admin
      .from("songs")
      .select("id,title,youtube_url,authors,copyright_owner,copyright_year,source,song_lyrics(lyrics)")
      .in("id", songIds);
    if (error) return json({ error: error.message }, 500);

    let processed = 0;
    let skipped = 0;
    for (const song of songs || []) {
      const relation = song.song_lyrics as { lyrics?: string } | { lyrics?: string }[] | null;
      const lyrics = Array.isArray(relation) ? relation[0]?.lyrics || "" : relation?.lyrics || "";
      const content = [
        `Title: ${song.title}`,
        song.authors ? `Authors: ${song.authors}` : "",
        song.source ? `Source: ${song.source}` : "",
        lyrics ? `Lyrics:\n${lyrics}` : "",
      ].filter(Boolean).join("\n");
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

  if (action === "sync-readings") {
    const readings = Array.isArray(body.readings) ? body.readings.slice(0, 20) : [];
    let processed = 0;
    let skipped = 0;
    for (const reading of readings) {
      const citation = typeof reading?.citation === "string" ? reading.citation.trim() : "";
      const text = typeof reading?.text === "string" ? reading.text.trim() : "";
      if (!citation || !text || citation.length > 300 || text.length > 30000) continue;
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
