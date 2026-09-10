-- rollout: contract
-- Plans are being extended to non-Sunday dates (Christmas Eve, weddings, etc.).
-- Rename the plans.sunday primary key (and every propagated column) to plan_date
-- so the identifier no longer implies "day of week must be Sunday." No day-of-week
-- constraint exists today, so this is a pure rename with no data change. Postgres
-- carries PK/FK/index definitions and column-level grants through a rename
-- automatically; only function/policy body text does not, so those are recreated
-- below with the same logic, just the renamed column/parameter.

alter table public.plans rename column sunday to plan_date;
alter table public.plan_songs rename column sunday to plan_date;
alter table public.plan_song_lyrics rename column sunday to plan_date;
alter table public.song_requests rename column sunday to plan_date;

-- RLS policy bodies embed the column name as text and are not rewritten by the
-- column rename above; recreate with identical gating logic, only the join
-- column renamed.
drop policy "Editors can create weekly song lyrics" on public.plan_song_lyrics;
create policy "Editors can create weekly song lyrics"
  on public.plan_song_lyrics for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
    and exists (
      select 1 from public.plan_songs assignment
      where assignment.plan_date = plan_song_lyrics.plan_date
        and assignment.part = plan_song_lyrics.part
        and assignment.song_id = plan_song_lyrics.song_id
    )
  );

drop policy "Editors can update weekly song lyrics" on public.plan_song_lyrics;
create policy "Editors can update weekly song lyrics"
  on public.plan_song_lyrics for update
  to authenticated
  using (exists (
    select 1 from public.editors where user_id = auth.uid()
  ))
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
    and exists (
      select 1 from public.plan_songs assignment
      where assignment.plan_date = plan_song_lyrics.plan_date
        and assignment.part = plan_song_lyrics.part
        and assignment.song_id = plan_song_lyrics.song_id
    )
  );

-- Recreate every function whose body references the literal sunday/p_sunday
-- identifier. Argument type lists are unchanged, so OIDs and existing
-- GRANT EXECUTE privileges are preserved; only the parameter name and the
-- column references in each body change.

create or replace function public.save_reading_override(
  p_plan_date date,
  p_slot text,
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

  insert into public.plans (plan_date, reading_overrides, updated_at, updated_by)
  values (
    p_plan_date,
    jsonb_build_object(p_slot, p_override),
    now(),
    auth.uid()
  )
  on conflict (plan_date) do update
  set reading_overrides = coalesce(public.plans.reading_overrides, '{}'::jsonb)
        || excluded.reading_overrides,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_reading_override(
  p_plan_date date,
  p_slot text default null
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

  if p_slot is not null and p_slot not in ('first', 'psalm', 'second', 'gospel') then
    raise exception 'Invalid reading slot';
  end if;

  update public.plans
  set reading_overrides = case
        when p_slot is null then '{}'::jsonb
        else coalesce(reading_overrides, '{}'::jsonb) - p_slot
      end,
      updated_at = now(),
      updated_by = auth.uid()
  where plan_date = p_plan_date;
end;
$$;

create or replace function public.save_celebration_override(
  p_plan_date date,
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
    plan_date,
    reading_overrides,
    celebration_override,
    updated_at,
    updated_by
  )
  values (
    p_plan_date,
    '{}'::jsonb,
    p_override,
    now(),
    auth.uid()
  )
  on conflict (plan_date) do update
  set celebration_override = excluded.celebration_override,
      reading_overrides = '{}'::jsonb,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_celebration_override(
  p_plan_date date
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

  update public.plans
  set celebration_override = null,
      reading_overrides = '{}'::jsonb,
      updated_at = now(),
      updated_by = auth.uid()
  where plan_date = p_plan_date;
end;
$$;

create or replace function public.assign_plan_song(
  p_plan_date date,
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

  insert into public.plans (plan_date, updated_at, updated_by)
  values (p_plan_date, now(), auth.uid())
  on conflict (plan_date) do update
  set updated_at = now(), updated_by = auth.uid();

  insert into public.plan_songs (plan_date, part, song_id, updated_at, updated_by)
  values (p_plan_date, p_part, p_song_id, now(), auth.uid())
  on conflict (plan_date, part) do update
  set song_id = excluded.song_id,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_plan_song(
  p_plan_date date,
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
  where plan_date = p_plan_date and part = p_part;

  update public.plans
  set updated_at = now(), updated_by = auth.uid()
  where plan_date = p_plan_date;
end;
$$;

-- Current (14-param) signature only; earlier overloads were already dropped by
-- prior migrations and don't need touching.
create or replace function public.create_and_assign_song(
  p_plan_date date,
  p_part text,
  p_title text,
  p_youtube_video_id text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
  p_responsorial_book text default '',
  p_responsorial_number integer default null,
  p_responsorial_citations text[] default array[]::text[],
  p_lyrics text default null,
  p_suggestion_parts text[] default array[]::text[],
  p_in_repertoire boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_song_id uuid;
begin
  new_song_id := public.create_song(
    p_title,
    p_youtube_video_id,
    p_authors,
    p_copyright_owner,
    p_copyright_year,
    p_source,
    p_responsorial_book,
    p_responsorial_number,
    p_responsorial_citations,
    p_lyrics,
    p_suggestion_parts,
    p_in_repertoire
  );

  if p_part not in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'communion2', 'recessional'
  ) then
    raise exception 'Invalid music part';
  end if;

  insert into public.plans (plan_date, updated_at, updated_by)
  values (p_plan_date, now(), auth.uid())
  on conflict (plan_date) do update
  set updated_at = now(), updated_by = auth.uid();

  insert into public.plan_songs (plan_date, part, song_id, updated_at, updated_by)
  values (p_plan_date, p_part, new_song_id, now(), auth.uid())
  on conflict (plan_date, part) do update
  set song_id = excluded.song_id,
      updated_at = now(),
      updated_by = auth.uid();
  return new_song_id;
end;
$$;

create or replace function public.save_plan_song_lyrics(
  p_plan_date date,
  p_part text,
  p_song_id uuid,
  p_lyrics text
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
  if nullif(btrim(coalesce(p_lyrics, '')), '') is null then
    raise exception 'Weekly lyrics required';
  end if;
  if not exists (
    select 1
    from public.plan_songs
    where plan_date = p_plan_date and part = p_part and song_id = p_song_id
  ) then
    raise exception 'The song is not assigned to this Mass slot';
  end if;

  insert into public.plan_song_lyrics (
    plan_date, part, song_id, lyrics, updated_at, updated_by
  )
  values (
    p_plan_date, p_part, p_song_id, btrim(p_lyrics), now(), auth.uid()
  )
  on conflict (plan_date, part) do update
  set song_id = excluded.song_id,
      lyrics = excluded.lyrics,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_plan_song_lyrics(
  p_plan_date date,
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
  delete from public.plan_song_lyrics
  where plan_date = p_plan_date
    and part = p_part
    and song_id = p_song_id;
end;
$$;

create or replace function public.create_song_request(
  p_song_id uuid default null,
  p_title text default '',
  p_youtube_video_id text default '',
  p_note text default '',
  p_plan_date date default null,
  p_part text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_request_id uuid;
begin
  if auth.uid() is null or not (
    exists (select 1 from public.choir_members where user_id = auth.uid())
    or exists (select 1 from public.editors where user_id = auth.uid())
  ) then
    raise exception 'Choir member access required';
  end if;
  if p_song_id is null and nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Choose a song or enter a title';
  end if;
  if p_song_id is not null and not exists (
    select 1 from public.songs where id = p_song_id
  ) then
    raise exception 'Song not found';
  end if;
  if btrim(coalesce(p_youtube_video_id, '')) <> ''
    and btrim(p_youtube_video_id) !~ '^[A-Za-z0-9_-]{11}$'
  then
    raise exception 'Invalid YouTube video ID';
  end if;
  if p_part is not null and p_part not in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'communion2', 'recessional'
  ) then
    raise exception 'Invalid music part';
  end if;

  insert into public.song_requests (
    song_id, title, youtube_video_id, note, plan_date, part,
    status, created_at, created_by
  )
  values (
    p_song_id,
    case when p_song_id is null then btrim(coalesce(p_title, '')) else '' end,
    case when p_song_id is null then btrim(coalesce(p_youtube_video_id, '')) else '' end,
    btrim(coalesce(p_note, '')),
    p_plan_date,
    p_part,
    'pending',
    now(),
    auth.uid()
  )
  returning id into new_request_id;
  return new_request_id;
end;
$$;

create or replace function public.discard_weekly_lyrics_for_changed_song()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.song_id is distinct from new.song_id then
    delete from public.plan_song_lyrics
    where plan_date = old.plan_date and part = old.part;
  end if;
  return new;
end;
$$;
