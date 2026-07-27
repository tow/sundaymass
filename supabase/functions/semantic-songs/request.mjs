const SUGGESTION_PARTS = new Set([
  "entrance", "kyrie", "gloria", "psalm", "acclamation", "offertory",
  "sanctus", "memorial", "amen", "lordPrayer", "agnus", "communion", "recessional",
]);

function boundedStrings(values, limit, maximumLength) {
  if (!Array.isArray(values)) return [];
  return values
    .filter(value => typeof value === "string")
    .map(value => value.trim())
    .filter(value => value.length > 0 && value.length <= maximumLength)
    .slice(0, limit);
}

export function embeddingChunks(value) {
  const result = [];
  let remaining = String(value || "").trim().slice(0, 30000);
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

export function parseSemanticRequest(body) {
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "status") return { action };
  if (action === "suggest") {
    const part = typeof body.part === "string" && SUGGESTION_PARTS.has(body.part)
      ? body.part
      : "";
    return {
      action,
      citations: boundedStrings(body.citations, 8, 300),
      part,
    };
  }
  if (action === "sync-songs") {
    return { action, songIds: boundedStrings(body.songIds, 20, 200) };
  }
  if (action === "sync-readings") {
    const readings = Array.isArray(body.readings)
      ? body.readings
        .map(reading => ({
          citation: typeof reading?.citation === "string" ? reading.citation.trim() : "",
          text: typeof reading?.text === "string" ? reading.text.trim() : "",
        }))
        .filter(reading => (
          reading.citation
          && reading.text
          && reading.citation.length <= 300
          && reading.text.length <= 30000
        ))
        .slice(0, 20)
      : [];
    return { action, readings };
  }
  return { action: "unknown" };
}
