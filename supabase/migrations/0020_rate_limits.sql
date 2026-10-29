-- Rate limits for public endpoints (roadmap 1.4): fixed-window counters,
-- bumped atomically by hit_rate_limit(). Service role only.

create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- True while the bucket is still within p_limit hits in the current window.
create or replace function public.hit_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds), 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits <= p_limit;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

select cron.schedule('home-brain-rate-limits', '23 * * * *', $$
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$);
