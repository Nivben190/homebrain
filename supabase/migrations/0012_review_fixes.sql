-- Fixes from the code review (tickets 01, 03, 04).

-- ---------------------------------------------------------------------------
-- 01: members can read each other's profile, but never the secret tokens.
-- my_tokens() returns your own; 0014 then hides the columns (applied after the app
-- switched to my_tokens(), so the running app never loses its profile).
-- ---------------------------------------------------------------------------
create or replace function public.my_tokens()
returns table (hook_token text, ics_token text)
language sql stable security definer set search_path = public as $$
  select hook_token, ics_token from public.profiles where user_id = auth.uid()
$$;
revoke execute on function public.my_tokens() from public, anon;
grant execute on function public.my_tokens() to authenticated;

-- ---------------------------------------------------------------------------
-- 03: only the recipient changes a request, and only its status.
-- ---------------------------------------------------------------------------
drop policy if exists "requests: update" on public.requests;
create policy "requests: recipient updates" on public.requests
  for update using (to_user = (select auth.uid()) and household_id = (select public.my_household_id()))
  with check (to_user = (select auth.uid()) and household_id = (select public.my_household_id()));
revoke update on public.requests from anon, authenticated;
grant update (status, updated_at) on public.requests to authenticated;

-- ---------------------------------------------------------------------------
-- 04: job lease. A job running longer than 5 minutes is claimable again;
-- after 3 attempts it is marked failed.
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts int not null default 0;

create or replace function public.claim_due_jobs(p_limit int default 50)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set status = 'failed', error = coalesce(error, 'lease expired too many times')
  where status = 'running' and claimed_at < now() - interval '5 minutes' and attempts >= 3;

  return query
  update public.jobs j set status = 'running', claimed_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where run_at <= now()
      and (status = 'pending' or (status = 'running' and claimed_at < now() - interval '5 minutes'))
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end $$;
revoke execute on function public.claim_due_jobs(int) from public, anon, authenticated;
