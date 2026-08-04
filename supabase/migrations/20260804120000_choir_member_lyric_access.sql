-- rollout: contract
-- A single administrator-managed Auth identity represents the choir. The browser
-- asks choir members only for its shared password; its fixed email is an
-- implementation detail. Editors retain individual identities and write access.

create table public.choir_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.choir_members enable row level security;

create policy "Choir members can see their own membership"
  on public.choir_members for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.choir_members from public, anon, authenticated;
grant select on public.choir_members to authenticated;
grant all on public.choir_members to service_role;

drop policy "Song lyrics are editor only" on public.song_lyrics;
create policy "Choir members and editors can read song lyrics"
  on public.song_lyrics for select
  to authenticated
  using (
    exists (select 1 from public.choir_members where user_id = auth.uid())
    or exists (select 1 from public.editors where user_id = auth.uid())
  );

drop policy "Weekly song lyrics are editor only" on public.plan_song_lyrics;
create policy "Choir members and editors can read weekly song lyrics"
  on public.plan_song_lyrics for select
  to authenticated
  using (
    exists (select 1 from public.choir_members where user_id = auth.uid())
    or exists (select 1 from public.editors where user_id = auth.uid())
  );

-- Table privileges remain read-only for choir members because both identities use
-- the authenticated PostgREST role. Existing write policies continue to require
-- editor membership, and every mutation RPC repeats that editor check.
