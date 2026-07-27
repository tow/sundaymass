export function relationRecord(relation) {
  return Array.isArray(relation) ? relation[0] || null : relation || null;
}

export function songLyrics(song) {
  return relationRecord(song?.song_lyrics)?.lyrics || "";
}

export function songEmbeddingContent(song) {
  const lyrics = songLyrics(song);
  return [
    `Title: ${song?.title || ""}`,
    song?.authors ? `Authors: ${song.authors}` : "",
    song?.source ? `Source: ${song.source}` : "",
    lyrics ? `Lyrics:\n${lyrics}` : "",
  ].filter(Boolean).join("\n");
}

export function storedSongEmbeddingHash(song) {
  return relationRecord(song?.song_embeddings)?.content_hash || "";
}

export async function staleSongIds(songs, hash) {
  const stale = await Promise.all((songs || []).map(async song => {
    const storedHash = storedSongEmbeddingHash(song);
    if (!storedHash) return song.id;
    const currentHash = await hash(songEmbeddingContent(song));
    return currentHash === storedHash ? null : song.id;
  }));
  return stale.filter(Boolean);
}
