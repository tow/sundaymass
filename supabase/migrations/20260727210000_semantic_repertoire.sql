create extension if not exists vector with schema extensions;

create table public.song_embeddings (
  song_id uuid primary key references public.songs(id) on delete cascade,
  content_hash text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create table public.reading_embeddings (
  citation text primary key,
  content_hash text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

alter table public.song_embeddings enable row level security;
alter table public.reading_embeddings enable row level security;

revoke all on public.song_embeddings from public, anon, authenticated;
revoke all on public.reading_embeddings from public, anon, authenticated;
grant all on public.song_embeddings, public.reading_embeddings to service_role;

create function public.create_song(
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

  return new_song_id;
end;
$$;

revoke execute on function public.create_song(
  text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_song(
  text, text, text, text, text, text, text
) to authenticated;

create function public.suggest_songs_for_readings(
  p_citations text[],
  p_limit integer default 8
)
returns table (
  id uuid,
  title text,
  youtube_url text,
  authors text,
  copyright_owner text,
  copyright_year text,
  source text,
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
    cross join requested
    group by se.song_id
  )
  select
    s.id,
    s.title,
    s.youtube_url,
    s.authors,
    s.copyright_owner,
    s.copyright_year,
    s.source,
    ranked.score::double precision
  from ranked
  join public.songs s on s.id = ranked.song_id
  order by ranked.score desc, s.title, s.id
  limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;

revoke execute on function public.suggest_songs_for_readings(text[], integer)
  from public, anon;
grant execute on function public.suggest_songs_for_readings(text[], integer)
  to authenticated;
