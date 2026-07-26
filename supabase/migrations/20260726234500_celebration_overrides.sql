alter table public.plans
  add column if not exists celebration_override jsonb;

create or replace function public.save_celebration_override(
  p_sunday date,
  p_override jsonb
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

  if p_override is null
    or jsonb_typeof(p_override) <> 'object'
    or nullif(p_override->>'id', '') is null
    or nullif(p_override->>'name', '') is null
    or nullif(p_override->>'sourceDate', '') is null
    or jsonb_typeof(p_override->'readings') <> 'object'
    or nullif(p_override->'readings'->>'first', '') is null
    or nullif(p_override->'readings'->>'psalm', '') is null
    or nullif(p_override->'readings'->>'gospel', '') is null
    or length(p_override::text) > 8192
  then
    raise exception 'Invalid celebration override';
  end if;

  insert into public.plans (
    sunday,
    choices,
    reading_overrides,
    celebration_override,
    updated_at,
    updated_by
  )
  values (
    p_sunday,
    '{}'::jsonb,
    '{}'::jsonb,
    p_override,
    now(),
    auth.uid()
  )
  on conflict (sunday) do update
  set celebration_override = excluded.celebration_override,
      reading_overrides = '{}'::jsonb,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_celebration_override(
  p_sunday date
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

  update public.plans
  set celebration_override = null,
      reading_overrides = '{}'::jsonb,
      updated_at = now(),
      updated_by = auth.uid()
  where sunday = p_sunday;
end;
$$;

revoke execute on function public.save_celebration_override(date, jsonb) from public, anon;
revoke execute on function public.clear_celebration_override(date) from public, anon;
grant execute on function public.save_celebration_override(date, jsonb) to authenticated;
grant execute on function public.clear_celebration_override(date) to authenticated;
