-- rollout: expand
-- Publish song-request changes over Realtime so a suggestion sent by one choir
-- member appears in every other reader's open planner without a reload, and a
-- request an editor accepts or declines leaves their queue the same way.
-- Row-level security is unchanged: subscribers still only receive rows the
-- existing public select policy already lets them read.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_requests'
  ) then
    alter publication supabase_realtime add table public.song_requests;
  end if;
end
$$;
