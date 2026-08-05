-- rollout: contract
-- Signed-in choir members may suggest songs for a Mass slot: an existing
-- canonical song or free-text details for a new one. Editors review and
-- resolve requests. A request never creates or changes canonical songs,
-- plans, or assignments by itself.

create table public.song_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  title text not null default '' check (length(title) <= 200),
  youtube_video_id text not null default ''
    check (youtube_video_id = '' or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  note text not null default '' check (length(note) <= 2000),
  sunday date,
  part text check (part is null or part in (
    'entrance', 'kyrie', 'gloria', 'psalm', 'acclamation', 'offertory',
    'sanctus', 'memorial', 'amen', 'lordPrayer', 'agnus', 'communion',
    'communion2', 'recessional'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  check (song_id is not null or length(btrim(title)) > 0)
);

create index song_requests_status_created_idx
  on public.song_requests (status, created_at desc);

alter table public.song_requests enable row level security;

create policy "Choir members and editors can read song requests"
  on public.song_requests for select
  to authenticated
  using (
    exists (select 1 from public.choir_members where user_id = auth.uid())
    or exists (select 1 from public.editors where user_id = auth.uid())
  );

create policy "Choir members and editors can create song requests"
  on public.song_requests for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and status = 'pending'
    and (
      exists (select 1 from public.choir_members where user_id = auth.uid())
      or exists (select 1 from public.editors where user_id = auth.uid())
    )
  );

create policy "Editors can resolve song requests"
  on public.song_requests for update
  to authenticated
  using (exists (select 1 from public.editors where user_id = auth.uid()))
  with check (
    resolved_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

-- Requests are choir-internal: no anonymous access, and browser roles never
-- read the Auth user UUID audit columns.
revoke all on public.song_requests from public, anon, authenticated;
grant select (
  id, song_id, title, youtube_video_id, note, sunday, part, status, created_at
) on public.song_requests to authenticated;
grant insert, update on public.song_requests to authenticated;
grant all on public.song_requests to service_role;

create function public.create_song_request(
  p_song_id uuid default null,
  p_title text default '',
  p_youtube_video_id text default '',
  p_note text default '',
  p_sunday date default null,
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
    song_id, title, youtube_video_id, note, sunday, part,
    status, created_at, created_by
  )
  values (
    p_song_id,
    case when p_song_id is null then btrim(coalesce(p_title, '')) else '' end,
    case when p_song_id is null then btrim(coalesce(p_youtube_video_id, '')) else '' end,
    btrim(coalesce(p_note, '')),
    p_sunday,
    p_part,
    'pending',
    now(),
    auth.uid()
  )
  returning id into new_request_id;
  return new_request_id;
end;
$$;

create function public.resolve_song_request(
  p_request_id uuid,
  p_status text
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
  if p_status not in ('accepted', 'declined') then
    raise exception 'Invalid request status';
  end if;

  update public.song_requests
  set status = p_status,
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = p_request_id
    and status = 'pending';
  if not found then
    raise exception 'Request not found';
  end if;
end;
$$;

revoke execute on function public.create_song_request(
  uuid, text, text, text, date, text
) from public, anon;
revoke execute on function public.resolve_song_request(uuid, text)
  from public, anon;
grant execute on function public.create_song_request(
  uuid, text, text, text, date, text
) to authenticated;
grant execute on function public.resolve_song_request(uuid, text)
  to authenticated;
