-- rollout: contract
-- Keep only position labels supported by direct evidence. Move uncertain labels into
-- an explicit human review queue instead of forcing every song into a suggestion slot.

alter table public.songs
  add column suggestion_proposed_parts text[] not null default array[]::text[],
  add column suggestion_proposal_confidence text not null default '',
  add column suggestion_proposal_reason text not null default '',
  add column suggestion_review_status text not null default 'reviewed';

alter table public.songs
  add constraint songs_suggestion_proposed_parts_valid check (
    suggestion_proposed_parts <@ array[
      'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
      'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
      'recessional'
    ]::text[]
    and cardinality(suggestion_proposed_parts) <= 13
  ),
  add constraint songs_suggestion_proposal_confidence_valid check (
    suggestion_proposal_confidence in ('', 'low', 'medium', 'high')
  ),
  add constraint songs_suggestion_review_status_valid check (
    suggestion_review_status in ('reviewed', 'evidence-backed', 'needs-review')
  ),
  add constraint songs_suggestion_proposal_reason_length check (
    length(suggestion_proposal_reason) <= 1000
  );

grant select (
  suggestion_proposed_parts,
  suggestion_proposal_confidence,
  suggestion_proposal_reason,
  suggestion_review_status
) on public.songs to anon, authenticated;

with usage_parts as (
  select
    song_id,
    array_agg(
      distinct case when part = 'communion2' then 'communion' else part end
    ) as parts
  from public.plan_songs
  group by song_id
), evidence as (
  select
    song.id,
    song.suggestion_parts as previous_parts,
    lower(btrim(song.title)) as title,
    lower(song.title || E'\n' || coalesce(lyrics.lyrics, '')) as content,
    coalesce(usage.parts, array[]::text[]) as usage_parts,
    array_remove(array[
      case when nullif(btrim(song.responsorial_book), '') is not null
        and song.responsorial_number is not null then 'psalm' end,
      case when song.suggestion_parts && array['kyrie']::text[] then 'kyrie' end,
      case when song.suggestion_parts && array['gloria']::text[] then 'gloria' end,
      case when song.suggestion_parts && array['acclamation']::text[] then 'acclamation' end,
      case when song.suggestion_parts && array['sanctus']::text[] then 'sanctus' end,
      case when song.suggestion_parts && array['memorial']::text[] then 'memorial' end,
      case when song.suggestion_parts && array['amen']::text[] then 'amen' end,
      case when song.suggestion_parts && array['lordPrayer']::text[] then 'lordPrayer' end,
      case when song.suggestion_parts && array['agnus']::text[] then 'agnus' end,
      case when lower(song.title) ~ (
        'gather|all are welcome|we are gathered|come together|\menter\M|procession'
      ) then 'entrance' end,
      case when lower(song.title) ~ (
        'offer|offering|what can we offer|all that i am|all that we have|'
        'gifts we bring|take our bread|take my hands|bread and wine'
      ) then 'offertory' end,
      case when lower(song.title) ~ (
        'communion|one bread|bread of life|eat this bread|table of plenty|'
        'come to the feast|body of christ|banquet|euchar|\mvine\M|grain of wheat|'
        'taste and see|stay with me,? lord|anima christi|ubi caritas'
      ) then 'communion' end,
      case when lower(song.title) ~ (
        '^go([ ,]| forth)|send (us|me)|shall go out|walk in the light|marching|'
        'proclaim|tell the world|mass is ended|freedom is coming|shine jesus shine|'
        'we want to see jesus lifted high'
      ) then 'recessional' end
    ]::text[], null) as direct_parts
  from public.songs song
  left join public.song_lyrics lyrics on lyrics.song_id = song.id
  left join usage_parts usage on usage.song_id = song.id
), classified as (
  select
    evidence.*,
    array(
      select part
      from unnest(array[
        'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
        'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
        'recessional'
      ]::text[]) part
      where part = any(evidence.usage_parts)
         or part = any(evidence.direct_parts)
    ) as accepted_parts
  from evidence
), proposals as (
  select
    classified.*,
    array(
      select part
      from unnest(classified.previous_parts) part
      where not (part = any(classified.accepted_parts))
    ) as proposed_parts,
    classified.previous_parts = array['offertory', 'communion']::text[]
      and cardinality(classified.accepted_parts) = 0
      and not classified.content ~ (
        'gather|welcome|come together|people of god|praise|glorif|rejoic|celebrat|'
        'jubil|hosanna|light|risen|resurrect|easter|christmas|manger|bethlehem|'
        'advent|king of kings|majesty|exalt|sing (to|a new)|bind us|holy spirit|'
        'veni sancte|venite|arise|procession|offer|offering|gift|work of our hands|'
        'surrender|servant|service|prayer|mercy|forgiv|repent|peniten|cross|passion|'
        'sacred head|behold the wood|ador|kneel|heart|peace|humble|purif|wash me|'
        'magnificat|mary|father|receive|hands gently|bread|wine|body of christ|'
        'blood of christ|banquet|feast|communion|euchar|vine|shepherd|thirst|'
        'living water|hunger|abide|remain in|new commandment|love one another|unity|'
        'family|neighbou?r|healing|touching place|presence|stay with me|with me,? lord|'
        'near|centre|be still|my soul|anima christi|one love|grain of wheat|ubi caritas|'
        '\mgo\M|\msend\M|\mwalk\M|march|freedom|shine|proclaim|tell .*world|'
        'mission|witness|allelu|kingdom|mass is ended|redeemed|\mjoy\M'
      ) as was_forced_fallback
  from classified
)
update public.songs song
set
  suggestion_parts = proposals.accepted_parts,
  suggestion_proposed_parts = proposals.proposed_parts,
  suggestion_proposal_confidence = case
    when cardinality(proposals.proposed_parts) = 0 then ''
    when proposals.was_forced_fallback then 'low'
    else 'medium'
  end,
  suggestion_proposal_reason = case
    when cardinality(proposals.proposed_parts) = 0 then ''
    when proposals.was_forced_fallback
      then 'No reliable positional evidence; the previous forced fallback needs human review.'
    else 'Previous automatic or legacy labels lack direct Mass-use or unmistakable title evidence.'
  end,
  suggestion_review_status = case
    when cardinality(proposals.proposed_parts) > 0 then 'needs-review'
    else 'evidence-backed'
  end
from proposals
where proposals.id = song.id;

create or replace function public.clear_song_suggestion_proposal_on_edit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.suggestion_parts is distinct from old.suggestion_parts then
    new.suggestion_proposed_parts := array[]::text[];
    new.suggestion_proposal_confidence := '';
    new.suggestion_proposal_reason := '';
    new.suggestion_review_status := 'reviewed';
  end if;
  return new;
end;
$$;

create trigger songs_clear_suggestion_proposal_on_edit
before update of suggestion_parts on public.songs
for each row execute function public.clear_song_suggestion_proposal_on_edit();

create function public.review_song_suggestion_parts(
  p_song_id uuid,
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

  if not coalesce(p_suggestion_parts, array[]::text[]) <@ array[
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'recessional'
  ]::text[] then
    raise exception 'Invalid suggestion part';
  end if;

  update public.songs
  set suggestion_parts = coalesce(p_suggestion_parts, array[]::text[]),
      suggestion_proposed_parts = array[]::text[],
      suggestion_proposal_confidence = '',
      suggestion_proposal_reason = '',
      suggestion_review_status = 'reviewed',
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_song_id;

  if not found then raise exception 'Song not found'; end if;
end;
$$;

revoke execute on function public.review_song_suggestion_parts(uuid, text[])
  from public, anon;
grant execute on function public.review_song_suggestion_parts(uuid, text[])
  to authenticated;
