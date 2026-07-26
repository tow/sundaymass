create table if not exists public.plans (
  sunday date primary key,
  choices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.editors enable row level security;

drop policy if exists "Plans are public" on public.plans;
create policy "Plans are public"
  on public.plans for select
  to anon, authenticated
  using (true);

drop policy if exists "Editors can create plans" on public.plans;
create policy "Editors can create plans"
  on public.plans for insert
  to authenticated
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

drop policy if exists "Editors can update plans" on public.plans;
create policy "Editors can update plans"
  on public.plans for update
  to authenticated
  using (
    exists (select 1 from public.editors where user_id = auth.uid())
  )
  with check (
    updated_by = auth.uid()
    and exists (select 1 from public.editors where user_id = auth.uid())
  );

drop policy if exists "Editors can see their own membership" on public.editors;
create policy "Editors can see their own membership"
  on public.editors for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.save_music_choice(
  p_sunday date,
  p_part text,
  p_song text,
  p_youtube_url text
)
returns void
language sql
set search_path = public
as $$
  insert into public.plans (sunday, choices, updated_at, updated_by)
  values (
    p_sunday,
    jsonb_build_object(
      p_part,
      jsonb_build_object(
        'song', coalesce(p_song, ''),
        'youtubeUrl', coalesce(p_youtube_url, '')
      )
    ),
    now(),
    auth.uid()
  )
  on conflict (sunday) do update
  set choices = coalesce(public.plans.choices, '{}'::jsonb) || excluded.choices,
      updated_at = now(),
      updated_by = auth.uid();
$$;

grant select on public.plans to anon, authenticated;
grant insert, update on public.plans to authenticated;
grant select on public.editors to authenticated;
revoke execute on function public.save_music_choice(date, text, text, text) from public, anon;
grant execute on function public.save_music_choice(date, text, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plans'
  ) then
    alter publication supabase_realtime add table public.plans;
  end if;
end
$$;
