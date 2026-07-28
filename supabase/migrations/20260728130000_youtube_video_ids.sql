-- A song points to one YouTube video. Store that stable identifier and derive URLs
-- at presentation boundaries so share parameters and URL variants never become data.

drop function public.create_song(
  text, text, text, text, text, text, text, text[], boolean
);
drop function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[], boolean
);
drop function public.update_song(
  uuid, text, text, text, text, text, text, text, text[], boolean
);
drop function public.suggest_songs_for_readings(text[], text, integer);

alter table public.songs
  add column youtube_video_id text;

update public.songs
set youtube_video_id = case
  when btrim(youtube_url) = '' then ''
  when regexp_match(
    btrim(youtube_url),
    '^https://(?:www\.)?youtu\.be/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$'
  ) is not null
    then (regexp_match(
      btrim(youtube_url),
      '^https://(?:www\.)?youtu\.be/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$'
    ))[1]
  when btrim(youtube_url) ~
    '^https://(?:[A-Za-z0-9-]+\.)*youtube(?:-nocookie)?\.com/watch\?'
    and regexp_match(
      btrim(youtube_url),
      '[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)'
    ) is not null
    then (regexp_match(
      btrim(youtube_url),
      '[?&]v=([A-Za-z0-9_-]{11})(?:[&#]|$)'
    ))[1]
  when regexp_match(
    btrim(youtube_url),
    '^https://(?:[A-Za-z0-9-]+\.)*youtube(?:-nocookie)?\.com/'
      || '(?:embed|shorts|live)/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$'
  ) is not null
    then (regexp_match(
      btrim(youtube_url),
      '^https://(?:[A-Za-z0-9-]+\.)*youtube(?:-nocookie)?\.com/'
        || '(?:embed|shorts|live)/([A-Za-z0-9_-]{11})/?(?:[?#].*)?$'
    ))[1]
  else null
end;

do $$
declare
  invalid_count integer;
begin
  select count(*) into invalid_count
  from public.songs
  where youtube_video_id is null;

  if invalid_count > 0 then
    raise exception
      'YouTube video ID migration refused: % non-empty URL(s) are not recognised',
      invalid_count;
  end if;
end;
$$;

alter table public.songs
  alter column youtube_video_id set default '',
  alter column youtube_video_id set not null,
  add constraint songs_youtube_video_id_valid check (
    youtube_video_id = ''
    or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
  ),
  drop column youtube_url;

create function public.create_song(
  p_title text,
  p_youtube_video_id text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
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

  insert into public.songs (
    title, youtube_video_id, authors, copyright_owner, copyright_year, source,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_video_id, '')),
    btrim(coalesce(p_authors, '')),
    btrim(coalesce(p_copyright_owner, '')),
    btrim(coalesce(p_copyright_year, '')),
    btrim(coalesce(p_source, '')),
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
  if btrim(coalesce(p_youtube_video_id, '')) <> ''
    and btrim(p_youtube_video_id) !~ '^[A-Za-z0-9_-]{11}$'
  then
    raise exception 'Invalid YouTube video ID';
  end if;

  insert into public.songs (
    title, youtube_video_id, authors, copyright_owner, copyright_year, source,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_video_id, '')),
    btrim(coalesce(p_authors, '')),
    btrim(coalesce(p_copyright_owner, '')),
    btrim(coalesce(p_copyright_year, '')),
    btrim(coalesce(p_source, '')),
    coalesce(p_suggestion_parts, array[]::text[]),
    coalesce(p_in_repertoire, true),
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
  p_youtube_video_id text default '',
  p_authors text default '',
  p_copyright_owner text default '',
  p_copyright_year text default '',
  p_source text default '',
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

  update public.songs
  set title = btrim(p_title),
      youtube_video_id = btrim(coalesce(p_youtube_video_id, '')),
      authors = btrim(coalesce(p_authors, '')),
      copyright_owner = btrim(coalesce(p_copyright_owner, '')),
      copyright_year = btrim(coalesce(p_copyright_year, '')),
      source = btrim(coalesce(p_source, '')),
      suggestion_parts = coalesce(p_suggestion_parts, array[]::text[]),
      in_repertoire = coalesce(p_in_repertoire, true),
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

create function public.suggest_songs_for_readings(
  p_citations text[],
  p_part text,
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
  similarity double precision
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_part not in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'recessional'
  ) then
    raise exception 'Invalid suggestion part';
  end if;

  return query
  with bounded_citations as (
    select btrim(citation) as citation
    from unnest(coalesce(p_citations, array[]::text[]))
      with ordinality as input(citation, ordinal)
    where citation is not null
      and length(btrim(citation)) between 1 and 300
    order by ordinal
    limit 8
  ),
  requested as (
    select re.embedding
    from public.reading_embeddings re
    join bounded_citations input on input.citation = re.citation
  ),
  ranked as (
    select
      se.song_id,
      0.75 * max(1 - (se.embedding <=> requested.embedding))
        + 0.25 * avg(1 - (se.embedding <=> requested.embedding)) as score
    from public.song_embeddings se
    join public.songs s on s.id = se.song_id
    cross join requested
    where p_part = any(s.suggestion_parts)
    group by se.song_id
  ),
  classified as (
    select
      s.*,
      ranked.score,
      row_number() over (
        partition by s.in_repertoire
        order by ranked.score desc, s.title, s.id
      ) as class_rank
    from ranked
    join public.songs s on s.id = ranked.song_id
  )
  select
    classified.id,
    classified.title,
    classified.youtube_video_id,
    classified.authors,
    classified.copyright_owner,
    classified.copyright_year,
    classified.source,
    classified.suggestion_parts,
    classified.in_repertoire,
    classified.score::double precision
  from classified
  where (classified.in_repertoire and class_rank <= 2)
     or (not classified.in_repertoire and class_rank <= 1)
  order by classified.in_repertoire desc, classified.score desc,
    classified.title, classified.id
  limit greatest(1, least(coalesce(p_limit, 3), 3));
end;
$$;

revoke execute on function public.create_song(
  text, text, text, text, text, text, text, text[], boolean
) from public, anon;
revoke execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[], boolean
) from public, anon;
revoke execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, text[], boolean
) from public, anon;
revoke execute on function public.suggest_songs_for_readings(text[], text, integer)
  from public;

grant execute on function public.create_song(
  text, text, text, text, text, text, text, text[], boolean
) to authenticated;
grant execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[], boolean
) to authenticated;
grant execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, text[], boolean
) to authenticated;
grant execute on function public.suggest_songs_for_readings(text[], text, integer)
  to anon, authenticated;
