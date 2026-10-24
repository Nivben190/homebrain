-- Signed-out callers never need these; handle_new_user is only for the auth trigger.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
-- my_household_id stays executable: every RLS policy calls it (returns null when signed out).

-- Indexes for the lookups the engine and screens actually do.
create index if not exists automations_target_idx on public.automations (target_user_id) where enabled;
create index if not exists automations_owner_idx on public.automations (owner_id);
create index if not exists runs_automation_user_idx on public.runs (automation_id, user_id, fired_at desc);
create index if not exists profiles_household_idx on public.profiles (household_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists jobs_automation_idx on public.jobs (automation_id);
