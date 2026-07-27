-- Suggestion parts are a soft recommendation filter, not an assignment rule.
-- Editors can still find and assign every song through the unrestricted catalogue.
alter table public.songs
  add column suggestion_parts text[] not null
  default array[]::text[];

alter table public.songs
  add constraint songs_suggestion_parts_valid check (
    suggestion_parts <@ array[
      'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
      'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
      'recessional'
    ]::text[]
    and cardinality(suggestion_parts) <= 13
  );

-- Existing use is the strongest signal we have for the small live data set.
-- Communion 1 and 2 deliberately share one suggestion class.
update public.songs s
set suggestion_parts = usage.parts
from (
  select
    song_id,
    array_agg(distinct case when part = 'communion2' then 'communion' else part end) as parts
  from public.plan_songs
  group by song_id
) usage
where usage.song_id = s.id;

-- Functional music is not interchangeable with general hymns. These known imported
-- records may not yet have appeared in a plan, so classify them explicitly. All other
-- unused songs remain unclassified and therefore absent from automated suggestions
-- until an editor records one or more normal uses.
update public.songs
set suggestion_parts = array['kyrie']::text[]
where title = 'Prayer for Mercy (Mass for Young Americans)';

update public.songs
set suggestion_parts = array['gloria']::text[]
where title like 'Glory to God (%';

update public.songs
set suggestion_parts = array['psalm']::text[]
where title = any(array[
  'Glory and Praise for Ever',
  'Harden not your heart',
  'I Believe That I Shall See the Good Things of the Lord in the Land of the Living',
  'I Will Praise Your Name for Ever, My King and My God',
  'Lord, in Your Great Love, Answer Me',
  'Lord, Send Out Your Spirit, and Renew the Face of the Earth',
  'Lord, You Are Good and Forgiving',
  'Praise the Lord, Jerusalem',
  'The Seed That Falls on Good Ground Will Yield a Fruitful Harvest',
  'Their Message Goes Out Through All the Earth',
  'Those who sow in tears shall reap rejoicing',
  'We Are His People, the Sheep of His Flock'
]::text[]);

update public.songs
set suggestion_parts = array['acclamation']::text[]
where title = 'Sing Hallelujah to the Lord';

update public.songs
set suggestion_parts = array['sanctus']::text[]
where title = 'Holy holy holy (St Louis Jesuits’ Mass)';

update public.songs
set suggestion_parts = array['memorial']::text[]
where title = 'Memorial Acclamation (unidentified setting)';

update public.songs
set suggestion_parts = array['amen']::text[]
where title = 'Amén (Misa Crista Salvador)';

update public.songs
set suggestion_parts = array['lordPrayer']::text[]
where title = 'Our Father';

update public.songs
set suggestion_parts = array['agnus']::text[]
where title = 'Lamb of God';

drop function public.create_song(text, text, text, text, text, text, text);
drop function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text
);
drop function public.update_song(uuid, text, text, text, text, text, text, text);
drop function public.suggest_songs_for_readings(text[], integer);

create function public.create_song(
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
  p_suggestion_parts text[] default array[]::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_song_id uuid;
  normalized_parts text[];
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

  normalized_parts := coalesce(p_suggestion_parts, array[]::text[]);
  if cardinality(normalized_parts) = 0 then
    normalized_parts := array[
      case when p_part = 'communion2' then 'communion' else p_part end
    ]::text[];
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
    normalized_parts,
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
  p_suggestion_parts text[] default array[]::text[]
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
  suggestion_parts text[],
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
  )
  select
    s.id,
    s.title,
    s.youtube_url,
    s.authors,
    s.copyright_owner,
    s.copyright_year,
    s.source,
    s.suggestion_parts,
    ranked.score::double precision
  from ranked
  join public.songs s on s.id = ranked.song_id
  order by ranked.score desc, s.title, s.id
  limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;

revoke execute on function public.create_song(
  text, text, text, text, text, text, text, text[]
) from public, anon;
revoke execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[]
) from public, anon;
revoke execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, text[]
) from public, anon;
revoke execute on function public.suggest_songs_for_readings(text[], text, integer)
  from public, anon;

grant execute on function public.create_song(
  text, text, text, text, text, text, text, text[]
) to authenticated;
grant execute on function public.create_and_assign_song(
  date, text, text, text, text, text, text, text, text, text[]
) to authenticated;
grant execute on function public.update_song(
  uuid, text, text, text, text, text, text, text, text[]
) to authenticated;
grant execute on function public.suggest_songs_for_readings(text[], text, integer)
  to authenticated;
