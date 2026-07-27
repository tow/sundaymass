-- RLS already prevents non-editors from changing plans, but an UPDATE which can see
-- no rows succeeds as a silent no-op. Check membership explicitly so the application
-- never reports a reading override as saved or cleared when the caller is unauthorized.
create or replace function public.save_reading_override(
  p_sunday date,
  p_slot text,
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

  insert into public.plans (sunday, reading_overrides, updated_at, updated_by)
  values (
    p_sunday,
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
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;

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
