alter table public.plans
  add column if not exists reading_overrides jsonb not null default '{}'::jsonb;

create or replace function public.save_reading_override(
  p_sunday date,
  p_slot text,
  p_override jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_slot not in ('first', 'psalm', 'second', 'gospel') then
    raise exception 'Invalid reading slot';
  end if;

  if p_override is null
    or jsonb_typeof(p_override) <> 'object'
    or nullif(p_override->>'citation', '') is null
    or nullif(p_override->>'book', '') is null
    or jsonb_typeof(p_override->'segments') <> 'array'
    or jsonb_array_length(p_override->'segments') = 0
    or length(p_override::text) > 4096
  then
    raise exception 'Invalid reading override';
  end if;

  insert into public.plans (sunday, choices, reading_overrides, updated_at, updated_by)
  values (
    p_sunday,
    '{}'::jsonb,
    jsonb_build_object(p_slot, p_override),
    now(),
    auth.uid()
  )
  on conflict (sunday) do update
  set reading_overrides = coalesce(public.plans.reading_overrides, '{}'::jsonb)
        || excluded.reading_overrides,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

create or replace function public.clear_reading_override(
  p_sunday date,
  p_slot text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_slot is not null and p_slot not in ('first', 'psalm', 'second', 'gospel') then
    raise exception 'Invalid reading slot';
  end if;

  update public.plans
  set reading_overrides = case
        when p_slot is null then '{}'::jsonb
        else coalesce(reading_overrides, '{}'::jsonb) - p_slot
      end,
      updated_at = now(),
      updated_by = auth.uid()
  where sunday = p_sunday;
end;
$$;

revoke execute on function public.save_reading_override(date, text, jsonb) from public, anon;
revoke execute on function public.clear_reading_override(date, text) from public, anon;
grant execute on function public.save_reading_override(date, text, jsonb) to authenticated;
grant execute on function public.clear_reading_override(date, text) to authenticated;
