-- rollout: contract
-- Rank songs independently for each reading, keep repertoire membership monotonic
-- once a song has appeared in a Mass, and finish the catalogue's soft part labels.

create or replace function public.keep_assigned_song_in_repertoire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.songs
  set in_repertoire = true,
      updated_at = greatest(updated_at, new.updated_at),
      updated_by = coalesce(new.updated_by, updated_by)
  where id = new.song_id
    and not in_repertoire;
  return new;
end;
$$;

create trigger plan_songs_keep_repertoire
after insert or update of song_id on public.plan_songs
for each row execute function public.keep_assigned_song_in_repertoire();

create or replace function public.prevent_assigned_song_repertoire_removal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not new.in_repertoire and exists (
    select 1 from public.plan_songs where song_id = new.id
  ) then
    new.in_repertoire := true;
  end if;
  return new;
end;
$$;

create trigger songs_keep_historic_repertoire
before update of in_repertoire on public.songs
for each row execute function public.prevent_assigned_song_repertoire_removal();

update public.songs song
set in_repertoire = true
where not song.in_repertoire
  and exists (
    select 1 from public.plan_songs assignment
    where assignment.song_id = song.id
  );

-- Responsorial settings are eligible only through their structured Scripture
-- identity. This also catches Psalm settings imported before soft labels existed.
update public.songs
set suggestion_parts = array['psalm']::text[]
where cardinality(suggestion_parts) = 0
  and nullif(btrim(responsorial_book), '') is not null
  and responsorial_number is not null;

-- Classify every remaining historic catalogue song. Functional Mass settings and
-- already-reviewed songs are untouched. The rules intentionally describe normal
-- liturgical use rather than hard eligibility; manual assignment stays unrestricted.
with song_text as (
  select
    song.id,
    lower(song.title || E'\n' || coalesce(lyrics.lyrics, '')) as content
  from public.songs song
  left join public.song_lyrics lyrics on lyrics.song_id = song.id
  where cardinality(song.suggestion_parts) = 0
), classified as (
  select
    id,
    array_remove(array[
      case when content ~ (
        'gather|welcome|come together|people of god|praise|glorif|rejoic|celebrat|'
        'jubil|hosanna|light|risen|resurrect|easter|christmas|manger|bethlehem|'
        'advent|king of kings|majesty|exalt|sing (to|a new)|bind us|holy spirit|'
        'veni sancte|venite|arise|procession'
      ) then 'entrance' end,
      case when content ~ (
        'offer|offering|gift|work of our hands|surrender|servant|service|prayer|'
        'mercy|forgiv|repent|peniten|cross|passion|sacred head|behold the wood|'
        'ador|kneel|heart|peace|humble|purif|wash me|magnificat|mary|father|'
        'receive|hands gently'
      ) then 'offertory' end,
      case when content ~ (
        'bread|wine|body of christ|blood of christ|banquet|feast|communion|'
        'euchar|vine|shepherd|thirst|living water|hunger|abide|remain in|'
        'new commandment|love one another|unity|family|neighbou?r|healing|'
        'touching place|presence|stay with me|with me,? lord|near|centre|'
        'be still|my soul|anima christi|one love|grain of wheat|ubi caritas'
      ) then 'communion' end,
      case when content ~ (
        '\mgo\M|\msend\M|\mwalk\M|march|freedom|shine|proclaim|'
        'tell .*world|mission|witness|rejoic|celebrat|jubil|praise|allelu|'
        'risen|resurrect|easter|light|kingdom|mass is ended|redeemed|\mjoy\M'
      ) then 'recessional' end
    ]::text[], null) as parts
  from song_text
)
update public.songs song
set suggestion_parts = case
  when cardinality(classified.parts) > 0 then classified.parts
  else array['offertory', 'communion']::text[]
end
from classified
where classified.id = song.id;

drop function public.suggest_songs_for_readings(text[], text, integer);

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
  reading_citation text,
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
    select btrim(citation) as citation, ordinal
    from unnest(coalesce(p_citations, array[]::text[]))
      with ordinality as input(citation, ordinal)
    where citation is not null
      and length(btrim(citation)) between 1 and 300
    order by ordinal
    limit 8
  ),
  requested as (
    select input.citation, input.ordinal, reading.embedding
    from bounded_citations input
    join public.reading_embeddings reading on reading.citation = input.citation
  ),
  classified as (
    select
      song.*,
      requested.citation,
      requested.ordinal,
      1 - (embedding.embedding <=> requested.embedding) as score,
      row_number() over (
        partition by requested.citation, song.in_repertoire
        order by 1 - (embedding.embedding <=> requested.embedding) desc,
          lower(song.title), song.id
      ) as class_rank
    from requested
    cross join public.songs song
    join public.song_embeddings embedding on embedding.song_id = song.id
    where p_part = any(song.suggestion_parts)
  ),
  reserved as (
    select
      classified.*,
      row_number() over (
        partition by classified.citation
        order by classified.in_repertoire desc, classified.score desc,
          lower(classified.title), classified.id
      ) as reading_rank
    from classified
    where (classified.in_repertoire and classified.class_rank <= 2)
       or (not classified.in_repertoire and classified.class_rank <= 1)
  )
  select
    reserved.id,
    reserved.title,
    reserved.youtube_video_id,
    reserved.authors,
    reserved.copyright_owner,
    reserved.copyright_year,
    reserved.source,
    reserved.suggestion_parts,
    reserved.in_repertoire,
    reserved.citation,
    reserved.score::double precision
  from reserved
  where reserved.reading_rank <= greatest(1, least(coalesce(p_limit, 3), 3))
  order by reserved.ordinal, reserved.reading_rank;
end;
$$;

revoke execute on function public.suggest_songs_for_readings(text[], text, integer)
  from public;
grant execute on function public.suggest_songs_for_readings(text[], text, integer)
  to anon, authenticated, service_role;
