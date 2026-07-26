drop function if exists public.save_music_choice(date, text, text, text);

create function public.save_music_choice(
  p_sunday date,
  p_part text,
  p_song text,
  p_youtube_url text,
  p_authors text,
  p_copyright_owner text,
  p_copyright_year text,
  p_source text
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
        'youtubeUrl', coalesce(p_youtube_url, ''),
        'authors', coalesce(p_authors, ''),
        'copyrightOwner', coalesce(p_copyright_owner, ''),
        'copyrightYear', coalesce(p_copyright_year, ''),
        'source', coalesce(p_source, '')
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

revoke execute on function public.save_music_choice(date, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_music_choice(date, text, text, text, text, text, text, text) to authenticated;
