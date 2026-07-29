-- rollout: contract
-- Keep canonical lyrics on songs while allowing one private edited copy for a
-- particular Sunday slot. Psalm/canticle suggestions use scripture metadata,
-- never semantic similarity.

alter table public.songs
  add column responsorial_book text not null default ''
    check (length(responsorial_book) <= 100),
  add column responsorial_number integer
    check (responsorial_number is null or responsorial_number between 1 and 999),
  add column responsorial_citations text[] not null default array[]::text[];

-- Respond & Acclaim sources carry the authoritative lectionary numbering.
with parsed as (
  select
    id,
    regexp_match(
      source,
      '(Psalm|Isaiah|Daniel|Exodus|Judith)[[:space:]]+([0-9]+)(\(([0-9]+)\))?'
    ) as scripture,
    case
      when source like '% · %'
        then regexp_split_to_array(
          regexp_replace(
            regexp_replace(
              source,
              '^Respond & Acclaim 2026[[:space:]]+·[[:space:]]+',
              ''
            ),
            '[[:space:]]+·[[:space:]]+pp\..*$',
            ''
          ),
          '[[:space:]]+/[[:space:]]+'
        )
      when source ~ '(Psalm|Isaiah|Daniel|Exodus|Judith)[[:space:]]+[0-9]+'
        then array[
          btrim(regexp_replace(source, '[[:space:]]+[—-][[:space:]].*$', ''))
        ]
      else array[]::text[]
    end as citations
  from public.songs
  where source ~ '(Psalm|Isaiah|Daniel|Exodus|Judith)[[:space:]]+[0-9]+'
)
update public.songs song
set responsorial_book = parsed.scripture[1],
    responsorial_number = greatest(
      parsed.scripture[2]::integer,
      coalesce(parsed.scripture[4]::integer, parsed.scripture[2]::integer)
    ),
    responsorial_citations = parsed.citations
from parsed
where song.id = parsed.id;

-- Older records usually carry both modern and Grail/Vulgate numbering in the
-- title. The lectionary number is the greater of the pair.
with parsed as (
  select
    id,
    regexp_match(
      title,
      'Psalm[[:space:]]+([0-9]+)(\(([0-9]+)\))?'
    ) as scripture
  from public.songs
  where responsorial_number is null
    and title ~* 'Psalm[[:space:]]+[0-9]+'
)
update public.songs song
set responsorial_book = 'Psalm',
    responsorial_number = greatest(
      parsed.scripture[1]::integer,
      coalesce(parsed.scripture[3]::integer, parsed.scripture[1]::integer)
    ),
    responsorial_citations = array[
      'Psalm ' || greatest(
        parsed.scripture[1]::integer,
        coalesce(parsed.scripture[3]::integer, parsed.scripture[1]::integer)
      )::text
    ]
from parsed
where song.id = parsed.id;

-- Known historic record whose response title contains no numeric citation.
update public.songs
set responsorial_book = 'Psalm',
    responsorial_number = 126,
    responsorial_citations = array['Psalm 126']
where responsorial_number is null
  and lower(title) = 'those who sow in tears shall reap rejoicing';

alter table public.songs
  add constraint songs_responsorial_metadata_complete
  check (
    not ('psalm' = any(suggestion_parts))
    or (
      nullif(btrim(responsorial_book), '') is not null
      and responsorial_number is not null
    )
  ) not valid;

-- The import and legacy-title passes above must account for every song that is
-- offered for the Psalm slot. Fail the rollout rather than leave an unnumbered
-- setting that could silently fall back to semantic suggestions.
alter table public.songs
  validate constraint songs_responsorial_metadata_complete;

create table public.plan_song_lyrics (
  sunday date not null,
  part text not null,
  song_id uuid not null references public.songs(id) on delete cascade,
  lyrics text not null check (length(btrim(lyrics)) between 1 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (sunday, part),
  foreign key (sunday, part)
    references public.plan_songs(sunday, part)
    on delete cascade
);

create index plan_song_lyrics_song_date_idx
  on public.plan_song_lyrics(song_id, sunday desc);

alter table public.plan_song_lyrics enable row level security;

create policy "Weekly song lyrics are editor only"
  on public.plan_song_lyrics for select
  to authenticated
  using (exists (
    select 1 from public.editors where user_id = auth.uid()
  ));

create policy "Editors can create weekly song lyrics"
  on public.plan_song_lyrics for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
    and exists (
      select 1 from public.plan_songs assignment
      where assignment.sunday = plan_song_lyrics.sunday
        and assignment.part = plan_song_lyrics.part
        and assignment.song_id = plan_song_lyrics.song_id
    )
  );

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
      where assignment.sunday = plan_song_lyrics.sunday
        and assignment.part = plan_song_lyrics.part
        and assignment.song_id = plan_song_lyrics.song_id
    )
  );

create policy "Editors can delete weekly song lyrics"
  on public.plan_song_lyrics for delete
  to authenticated
  using (exists (
    select 1 from public.editors where user_id = auth.uid()
  ));

revoke all on public.plan_song_lyrics from public, anon, authenticated;
grant select, insert, update, delete on public.plan_song_lyrics to authenticated;
grant all on public.plan_song_lyrics to service_role;

create function public.discard_weekly_lyrics_for_changed_song()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.song_id is distinct from new.song_id then
    delete from public.plan_song_lyrics
    where sunday = old.sunday and part = old.part;
  end if;
  return new;
end;
$$;

create trigger discard_weekly_lyrics_before_song_change
before update of song_id on public.plan_songs
for each row
execute function public.discard_weekly_lyrics_for_changed_song();

create function public.save_plan_song_lyrics(
  p_sunday date,
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
    where sunday = p_sunday and part = p_part and song_id = p_song_id
  ) then
    raise exception 'The song is not assigned to this Mass slot';
  end if;

  insert into public.plan_song_lyrics (
    sunday, part, song_id, lyrics, updated_at, updated_by
  )
  values (
    p_sunday, p_part, p_song_id, btrim(p_lyrics), now(), auth.uid()
  )
  on conflict (sunday, part) do update
  set song_id = excluded.song_id,
      lyrics = excluded.lyrics,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create function public.clear_plan_song_lyrics(
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
  delete from public.plan_song_lyrics
  where sunday = p_sunday
    and part = p_part
    and song_id = p_song_id;
end;
$$;

revoke execute on function public.save_plan_song_lyrics(date, text, uuid, text)
  from public, anon;
revoke execute on function public.clear_plan_song_lyrics(date, text, uuid)
  from public, anon;
grant execute on function public.save_plan_song_lyrics(date, text, uuid, text)
  to authenticated;
grant execute on function public.clear_plan_song_lyrics(date, text, uuid)
  to authenticated;

drop function public.create_song(
  text, text, text, text, text, text, text, text[], boolean
);
drop function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[], boolean
);
drop function public.update_song(
  uuid, text, text, text, text, text, text, text, text[], boolean
);

create function public.create_song(
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
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;
  if nullif(btrim(p_title), '') is null then
    raise exception 'Song title required';
  end if;
  if btrim(coalesce(p_youtube_video_id, '')) <> ''
    and btrim(p_youtube_video_id) !~ '^[A-Za-z0-9_-]{11}$'
  then
    raise exception 'Invalid YouTube video ID';
  end if;
  if 'psalm' = any(coalesce(p_suggestion_parts, array[]::text[]))
    and (
      nullif(btrim(coalesce(p_responsorial_book, '')), '') is null
      or p_responsorial_number is null
    )
  then
    raise exception 'Responsorial book and number required';
  end if;

  insert into public.songs (
    title, youtube_video_id, authors, copyright_owner, copyright_year, source,
    responsorial_book, responsorial_number, responsorial_citations,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_video_id, '')),
    btrim(coalesce(p_authors, '')),
    btrim(coalesce(p_copyright_owner, '')),
    btrim(coalesce(p_copyright_year, '')),
    btrim(coalesce(p_source, '')),
    btrim(coalesce(p_responsorial_book, '')),
    p_responsorial_number,
    coalesce(p_responsorial_citations, array[]::text[]),
    coalesce(p_suggestion_parts, array[]::text[]),
    coalesce(p_in_repertoire, true),
    now(), auth.uid(), now(), auth.uid()
  )
  returning id into new_song_id;

  if nullif(btrim(coalesce(p_lyrics, '')), '') is not null then
    insert into public.song_lyrics (song_id, lyrics, updated_at, updated_by)
    values (new_song_id, btrim(p_lyrics), now(), auth.uid());
  end if;
  return new_song_id;
end;
$$;

create function public.create_and_assign_song(
  p_sunday date,
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
  if btrim(coalesce(p_youtube_video_id, '')) <> ''
    and btrim(p_youtube_video_id) !~ '^[A-Za-z0-9_-]{11}$'
  then
    raise exception 'Invalid YouTube video ID';
  end if;
  if 'psalm' = any(coalesce(p_suggestion_parts, array[]::text[]))
    and (
      nullif(btrim(coalesce(p_responsorial_book, '')), '') is null
      or p_responsorial_number is null
    )
  then
    raise exception 'Responsorial book and number required';
  end if;

  update public.songs
  set title = btrim(p_title),
      youtube_video_id = btrim(coalesce(p_youtube_video_id, '')),
      authors = btrim(coalesce(p_authors, '')),
      copyright_owner = btrim(coalesce(p_copyright_owner, '')),
      copyright_year = btrim(coalesce(p_copyright_year, '')),
      source = btrim(coalesce(p_source, '')),
      responsorial_book = btrim(coalesce(p_responsorial_book, '')),
      responsorial_number = p_responsorial_number,
      responsorial_citations = coalesce(p_responsorial_citations, array[]::text[]),
      suggestion_parts = coalesce(p_suggestion_parts, array[]::text[]),
      in_repertoire = coalesce(p_in_repertoire, true),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_song_id;

  if not found then raise exception 'Song not found'; end if;

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

revoke execute on function public.create_song(
  text, text, text, text, text, text, text, integer, text[], text, text[], boolean
) from public, anon;
revoke execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, integer, text[], text,
  text[], boolean
) from public, anon;
revoke execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, integer, text[], text, text[],
  boolean
) from public, anon;
grant execute on function public.create_song(
  text, text, text, text, text, text, text, integer, text[], text, text[], boolean
) to authenticated;
grant execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, integer, text[], text,
  text[], boolean
) to authenticated;
grant execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, integer, text[], text, text[],
  boolean
) to authenticated;

create function public.normalized_responsorial_citation(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(
    replace(replace(btrim(coalesce(value, '')), '–', '-'), '—', '-'),
    '[[:space:]]+',
    ' ',
    'g'
  ));
$$;

create function public.suggest_psalms_for_reading(
  p_citation text,
  p_limit integer default 3
)
returns table (
  id uuid,
  title text,
  youtube_video_id text,
  authors text,
  copyright_owner text,
  copyright_year text,
  source text,
  suggestion_parts text[],
  in_repertoire boolean,
  responsorial_book text,
  responsorial_number integer,
  responsorial_citations text[],
  suggestion_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  scripture text[];
  requested_book text;
  requested_number integer;
  requested_normalized text;
begin
  scripture := regexp_match(
    btrim(coalesce(p_citation, '')),
    '^((?:[1-3][[:space:]]+)?[A-Za-z][A-Za-z ]*?)[[:space:]]+([0-9]+)'
  );
  if scripture is null then return; end if;
  requested_book := btrim(scripture[1]);
  requested_number := scripture[2]::integer;
  requested_normalized := public.normalized_responsorial_citation(p_citation);

  return query
  select
    song.id,
    song.title,
    song.youtube_video_id,
    song.authors,
    song.copyright_owner,
    song.copyright_year,
    song.source,
    song.suggestion_parts,
    song.in_repertoire,
    song.responsorial_book,
    song.responsorial_number,
    song.responsorial_citations,
    case
      when exists (
        select 1 from unnest(song.responsorial_citations) citation
        where public.normalized_responsorial_citation(citation) = requested_normalized
      ) then 'Exact ' || p_citation
      else song.responsorial_book || ' ' || song.responsorial_number::text || ' setting'
    end
  from public.songs song
  where 'psalm' = any(song.suggestion_parts)
    and lower(song.responsorial_book) = lower(requested_book)
    and song.responsorial_number = requested_number
  order by
    exists (
      select 1 from unnest(song.responsorial_citations) citation
      where public.normalized_responsorial_citation(citation) = requested_normalized
    ) desc,
    song.in_repertoire desc,
    lower(song.title),
    song.id
  limit greatest(1, least(coalesce(p_limit, 3), 10));
end;
$$;

revoke execute on function public.suggest_psalms_for_reading(text, integer)
  from public;
grant execute on function public.suggest_psalms_for_reading(text, integer)
  to anon, authenticated;
grant execute on function public.suggest_psalms_for_reading(text, integer)
  to service_role;
