-- rollout: contract
-- Public planner reads need business data, never Auth user UUID audit fields.
-- Keep RLS as the row boundary and narrow browser roles to explicit columns.

revoke select on public.plans from anon, authenticated;
grant select (
  sunday,
  reading_overrides,
  celebration_override
) on public.plans to anon, authenticated;

revoke select on public.songs from anon, authenticated;
grant select (
  id,
  title,
  youtube_video_id,
  authors,
  copyright_owner,
  copyright_year,
  source,
  responsorial_book,
  responsorial_number,
  responsorial_citations,
  in_repertoire,
  suggestion_parts
) on public.songs to anon, authenticated;

revoke select on public.plan_songs from anon, authenticated;
grant select (
  sunday,
  part,
  song_id
) on public.plan_songs to anon, authenticated;
