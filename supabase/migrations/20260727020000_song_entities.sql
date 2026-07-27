create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  youtube_url text not null default '' check (length(youtube_url) <= 2000),
  authors text not null default '' check (length(authors) <= 1000),
  copyright_owner text not null default '' check (length(copyright_owner) <= 1000),
  copyright_year text not null default '' check (length(copyright_year) <= 200),
  source text not null default '' check (length(source) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Deliberately non-unique: different songs and settings may have the same title.
create index songs_title_search_idx on public.songs (lower(title));

-- Lyrics are physically separate only to create a hard permission boundary.
-- In the domain this remains an optional one-to-one part of a song.
create table public.song_lyrics (
  song_id uuid primary key references public.songs(id) on delete cascade,
  lyrics text not null check (length(btrim(lyrics)) between 1 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.plan_songs (
  sunday date not null references public.plans(sunday) on delete cascade,
  part text not null check (
    part in (
      'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
      'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
      'communion2', 'recessional'
    )
  ),
  song_id uuid not null references public.songs(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (sunday, part)
);

create index plan_songs_song_id_idx on public.plan_songs (song_id);

alter table public.songs enable row level security;
alter table public.song_lyrics enable row level security;
alter table public.plan_songs enable row level security;

create policy "Song metadata is public"
  on public.songs for select
  to anon, authenticated
  using (true);

create policy "Editors can create songs"
  on public.songs for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Editors can update songs"
  on public.songs for update
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()))
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Song lyrics are editor only"
  on public.song_lyrics for select
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()));

create policy "Editors can create song lyrics"
  on public.song_lyrics for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Editors can update song lyrics"
  on public.song_lyrics for update
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()))
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Editors can delete song lyrics"
  on public.song_lyrics for delete
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()));

create policy "Planned songs are public"
  on public.plan_songs for select
  to anon, authenticated
  using (true);

create policy "Editors can assign songs"
  on public.plan_songs for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Editors can change assigned songs"
  on public.plan_songs for update
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()))
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Editors can clear assigned songs"
  on public.plan_songs for delete
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()));

-- Earlier project-wide grants were intentionally broad. Replace them with the exact
-- privileges for these tables; in particular, anon must have no lyric-table access.
revoke all on public.songs from anon, authenticated, public;
revoke all on public.song_lyrics from anon, public;
revoke all on public.song_lyrics from authenticated;
revoke all on public.plan_songs from anon, authenticated, public;

grant select on public.songs to anon, authenticated;
grant insert, update on public.songs to authenticated;
grant select, insert, update, delete on public.song_lyrics to authenticated;
grant select on public.plan_songs to anon, authenticated;
grant insert, update, delete on public.plan_songs to authenticated;
grant all on public.songs, public.song_lyrics, public.plan_songs to service_role;

-- Capture the small legacy data set before removing the JSON column. Exact repeated
-- records become one song; title alone is never used for grouping.
create temporary table legacy_music_choices on commit drop as
select
  p.sunday,
  p.updated_by,
  choice.key as part,
  btrim(choice.value->>'song') as title,
  btrim(coalesce(choice.value->>'youtubeUrl', '')) as youtube_url,
  btrim(coalesce(choice.value->>'authors', '')) as authors,
  btrim(coalesce(choice.value->>'copyrightOwner', '')) as copyright_owner,
  btrim(coalesce(choice.value->>'copyrightYear', '')) as copyright_year,
  btrim(coalesce(choice.value->>'source', '')) as source
from public.plans p
cross join lateral jsonb_each(coalesce(p.choices, '{}'::jsonb)) as choice
where nullif(btrim(choice.value->>'song'), '') is not null;

create temporary table legacy_song_groups on commit drop as
select
  gen_random_uuid() as song_id,
  title,
  youtube_url,
  authors,
  copyright_owner,
  copyright_year,
  source,
  min(sunday) as first_sunday
from legacy_music_choices
group by title, youtube_url, authors, copyright_owner, copyright_year, source;

insert into public.songs (
  id,
  title,
  youtube_url,
  authors,
  copyright_owner,
  copyright_year,
  source,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  group_row.song_id,
  group_row.title,
  group_row.youtube_url,
  group_row.authors,
  group_row.copyright_owner,
  group_row.copyright_year,
  group_row.source,
  now(),
  plan_row.updated_by,
  now(),
  plan_row.updated_by
from legacy_song_groups group_row
left join public.plans plan_row on plan_row.sunday = group_row.first_sunday;

insert into public.plan_songs (sunday, part, song_id, updated_at, updated_by)
select
  legacy.sunday,
  legacy.part,
  group_row.song_id,
  now(),
  legacy.updated_by
from legacy_music_choices legacy
join legacy_song_groups group_row
  on group_row.title = legacy.title
  and group_row.youtube_url = legacy.youtube_url
  and group_row.authors = legacy.authors
  and group_row.copyright_owner = legacy.copyright_owner
  and group_row.copyright_year = legacy.copyright_year
  and group_row.source = legacy.source;

do $$
declare
  legacy_count integer;
  migrated_count integer;
begin
  select count(*) into legacy_count from legacy_music_choices;
  select count(*) into migrated_count from public.plan_songs;
  if migrated_count <> legacy_count then
    raise exception 'Song migration mismatch: expected % assignments, created %',
      legacy_count, migrated_count;
  end if;
end
$$;

drop function if exists public.save_music_choice(date, text, text, text);
drop function if exists public.save_music_choice(
  date, text, text, text, text, text, text, text
);

alter table public.plans drop column choices;

-- Recreate existing plan functions without the removed choices column.
create or replace function public.save_reading_override(
  p_sunday date,
  p_slot text,
  p_override jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_slot not in ('first', 'psalm', 'second', 'gospel') then
    raise exception 'Invalid reading slot';
  end if;

  if p_override is null
    or jsonb_typeof(p_override) <> 'object'
    or nullif(p_override->>'citation', '') is null
    or nullif(p_override->>'book', '') is null
    or jsonb_typeof(p_override->'segments') <> 'array'
    or jsonb_array_length(p_override->'segments') = 0
    or length(p_override::text) > 4096
  then
    raise exception 'Invalid reading override';
  end if;

  insert into public.plans (sunday, reading_overrides, updated_at, updated_by)
  values (
    p_sunday,
    jsonb_build_object(p_slot, p_override),
    now(),
    auth.uid()
  )
  on conflict (sunday) do update
  set reading_overrides = coalesce(public.plans.reading_overrides, '{}'::jsonb)
        || excluded.reading_overrides,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.save_celebration_override(
  p_sunday date,
  p_override jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;

  if p_override is null
    or jsonb_typeof(p_override) <> 'object'
    or nullif(p_override->>'id', '') is null
    or nullif(p_override->>'name', '') is null
    or nullif(p_override->>'sourceDate', '') is null
    or jsonb_typeof(p_override->'readings') <> 'object'
    or nullif(p_override->'readings'->>'first', '') is null
    or nullif(p_override->'readings'->>'psalm', '') is null
    or nullif(p_override->'readings'->>'gospel', '') is null
    or length(p_override::text) > 8192
  then
    raise exception 'Invalid celebration override';
  end if;

  insert into public.plans (
    sunday,
    reading_overrides,
    celebration_override,
    updated_at,
    updated_by
  )
  values (
    p_sunday,
    '{}'::jsonb,
    p_override,
    now(),
    auth.uid()
  )
  on conflict (sunday) do update
  set celebration_override = excluded.celebration_override,
      reading_overrides = '{}'::jsonb,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create function public.assign_plan_song(
  p_sunday date,
  p_part text,
  p_song_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
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

  insert into public.plans (sunday, updated_at, updated_by)
  values (p_sunday, now(), auth.uid())
  on conflict (sunday) do update
  set updated_at = now(), updated_by = auth.uid();

  insert into public.plan_songs (sunday, part, song_id, updated_at, updated_by)
  values (p_sunday, p_part, p_song_id, now(), auth.uid())
  on conflict (sunday, part) do update
  set song_id = excluded.song_id,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create function public.clear_plan_song(
  p_sunday date,
  p_part text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
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

  delete from public.plan_songs
  where sunday = p_sunday and part = p_part;

  update public.plans
  set updated_at = now(), updated_by = auth.uid()
  where sunday = p_sunday;
end;
$$;

create function public.create_and_assign_song(
  p_sunday date,
  p_part text,
  p_title text,
  p_youtube_url text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
  p_lyrics text default null
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
    created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_url, '')),
    btrim(coalesce(p_authors, '')),
    btrim(coalesce(p_copyright_owner, '')),
    btrim(coalesce(p_copyright_year, '')),
    btrim(coalesce(p_source, '')),
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

create function public.update_song(
  p_song_id uuid,
  p_title text,
  p_youtube_url text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
  p_lyrics text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'Song title required';
  end if;

  update public.songs
  set title = btrim(p_title),
      youtube_url = btrim(coalesce(p_youtube_url, '')),
      authors = btrim(coalesce(p_authors, '')),
      copyright_owner = btrim(coalesce(p_copyright_owner, '')),
      copyright_year = btrim(coalesce(p_copyright_year, '')),
      source = btrim(coalesce(p_source, '')),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_song_id;

  if not found then
    raise exception 'Song not found';
  end if;

  if nullif(btrim(coalesce(p_lyrics, '')), '') is null then
    delete from public.song_lyrics where song_id = p_song_id;
  else
    insert into public.song_lyrics (song_id, lyrics, updated_at, updated_by)
    values (p_song_id, btrim(p_lyrics), now(), auth.uid())
    on conflict (song_id) do update
    set lyrics = excluded.lyrics,
        updated_at = now(),
        updated_by = auth.uid();
  end if;
end;
$$;

revoke execute on function public.assign_plan_song(date, text, uuid) from public, anon;
revoke execute on function public.clear_plan_song(date, text) from public, anon;
revoke execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text
) from public, anon;
revoke execute on function public.update_song(
  uuid, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.assign_plan_song(date, text, uuid) to authenticated;
grant execute on function public.clear_plan_song(date, text) to authenticated;
grant execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.update_song(
  uuid, text, text, text, text, text, text, text
) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plan_songs'
  ) then
    alter publication supabase_realtime add table public.plan_songs;
  end if;
end
$$;
