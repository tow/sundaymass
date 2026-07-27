-- Suggestion browsing is public, while vectors and lyrics remain private.
-- The security-definer function returns only the same safe song metadata that
-- public plan and repertoire views already expose.

create or replace function public.suggest_songs_for_readings(
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

revoke execute on function public.suggest_songs_for_readings(text[], text, integer)
  from public;
grant execute on function public.suggest_songs_for_readings(text[], text, integer)
  to anon, authenticated;
