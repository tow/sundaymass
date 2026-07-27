-- Songs in the starter library are fully fledged song entities, but they must not
-- imply that the choir already knows them. Existing and normally-created songs remain
-- repertoire songs unless an editor explicitly changes this flag.
alter table public.songs
  add column in_repertoire boolean not null default true;

create index songs_in_repertoire_idx
  on public.songs (in_repertoire, lower(title));

drop function public.create_song(text, text, text, text, text, text, text, text[]);
drop function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[]
);
drop function public.update_song(uuid, text, text, text, text, text, text, text, text[]);
drop function public.suggest_songs_for_readings(text[], text, integer);

create function public.create_song(
  p_title text,
  p_youtube_url text default '',
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

  insert into public.songs (
    title, youtube_url, authors, copyright_owner, copyright_year, source,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_url, '')),
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
  p_youtube_url text default '',
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

  insert into public.songs (
    title, youtube_url, authors, copyright_owner, copyright_year, source,
    suggestion_parts, in_repertoire, created_at, created_by, updated_at, updated_by
  )
  values (
    btrim(p_title),
    btrim(coalesce(p_youtube_url, '')),
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
  p_youtube_url text default '',
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

  update public.songs
  set title = btrim(p_title),
      youtube_url = btrim(coalesce(p_youtube_url, '')),
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
  youtube_url text,
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
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;
  if p_part not in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'recessional'
  ) then
    raise exception 'Invalid suggestion part';
  end if;

  return query
  with requested as (
    select re.embedding
    from public.reading_embeddings re
    where re.citation = any(coalesce(p_citations, array[]::text[]))
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
    classified.youtube_url,
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
  from public, anon;

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
  to authenticated;
