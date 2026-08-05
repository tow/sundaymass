-- rollout: expand
-- The pending song-suggestion queue is public information: it carries song
-- titles, target slots, notes, and YouTube video IDs, never lyrics or Auth
-- user UUIDs. Anyone may read it. Creating a request remains a choir or
-- editor action and resolving remains editor-only.

drop policy "Choir members and editors can read song requests"
  on public.song_requests;
create policy "Song requests are public"
  on public.song_requests for select
  to anon, authenticated
  using (true);

grant select (
  id, song_id, title, youtube_video_id, note, sunday, part, status, created_at
) on public.song_requests to anon;
