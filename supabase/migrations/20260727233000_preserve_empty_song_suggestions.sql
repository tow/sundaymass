-- The planner UI supplies a useful default suggestion position for a new song.
-- The database must nevertheless preserve an explicitly empty editor selection.
create or replace function public.create_and_assign_song(
  p_sunday date,
  p_part text,
  p_title text,
  p_youtube_url text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
  p_lyrics text default null,
  p_suggestion_parts text[] default array[]::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_song_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;
  if p_part not in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'communion2', 'recessional'
  ) then
    raise exception 'Invalid music part';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'Song title required';
  end if;

  insert into public.songs (
    title, youtube_url, authors, copyright_owner, copyright_year, source,
    suggestion_parts, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_url, '')),
    btrim(coalesce(p_authors, '')),
    btrim(coalesce(p_copyright_owner, '')),
    btrim(coalesce(p_copyright_year, '')),
    btrim(coalesce(p_source, '')),
    coalesce(p_suggestion_parts, array[]::text[]),
    now(), auth.uid(), now(), auth.uid()
  )
  returning id into new_song_id;

  if nullif(btrim(coalesce(p_lyrics, '')), '') is not null then
    insert into public.song_lyrics (song_id, lyrics, updated_at, updated_by)
    values (new_song_id, btrim(p_lyrics), now(), auth.uid());
  end if;

  insert into public.plans (sunday, updated_at, updated_by)
  values (p_sunday, now(), auth.uid())
  on conflict (sunday) do update
  set updated_at = now(), updated_by = auth.uid();

  insert into public.plan_songs (sunday, part, song_id, updated_at, updated_by)
  values (p_sunday, p_part, new_song_id, now(), auth.uid())
  on conflict (sunday, part) do update
  set song_id = excluded.song_id,
      updated_at = now(),
      updated_by = auth.uid();

  return new_song_id;
end;
$$;
