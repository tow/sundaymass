-- rollout: expand
-- A plan can say what it is ("Filipino Mass"), which matters once plans are made for
-- dates the calendar alone does not explain. The label is public, like the rest of a
-- plan's business data, and is kept trimmed and short enough for a page heading.

alter table public.plans
  add column occasion_label text
  constraint plans_occasion_label_shape check (
    occasion_label is null
    or (occasion_label = btrim(occasion_label) and length(occasion_label) between 1 and 80)
  );

grant select (occasion_label) on public.plans to anon, authenticated;

create function public.save_plan_occasion_label(
  p_plan_date date,
  p_label text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if auth.uid() is null or not exists (
    select 1 from public.editors where user_id = auth.uid()
  ) then
    raise exception 'Editor access required';
  end if;

  if p_plan_date is null then
    raise exception 'Plan date required';
  end if;

  if length(label) > 80 then
    raise exception 'Occasion label must be 80 characters or fewer';
  end if;

  insert into public.plans (plan_date, occasion_label, updated_at, updated_by)
  values (p_plan_date, label, now(), auth.uid())
  -- Reading excluded.* needs column SELECT, which browser roles lack on the audit fields.
  on conflict (plan_date) do update
  set occasion_label = excluded.occasion_label,
      updated_at = now(),
      updated_by = auth.uid();
end;
$$;

revoke execute on function public.save_plan_occasion_label(date, text) from public, anon;
grant execute on function public.save_plan_occasion_label(date, text) to authenticated;
