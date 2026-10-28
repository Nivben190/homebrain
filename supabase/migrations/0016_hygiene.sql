-- Hygiene from the Supabase advisors (roadmap 0.7).

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys: deletes of users/homes/sections and the joins that
-- follow these columns no longer scan whole tables.
-- ---------------------------------------------------------------------------
create index if not exists items_assignee_idx on public.items (assignee_id);
create index if not exists items_created_by_idx on public.items (created_by);
create index if not exists runs_household_idx on public.runs (household_id);
create index if not exists automations_household_idx on public.automations (household_id);
create index if not exists sections_owner_idx on public.sections (owner_id);
create index if not exists requests_from_idx on public.requests (from_user);
create index if not exists jobs_user_idx on public.jobs (user_id);
create index if not exists gmail_connections_user_idx on public.gmail_connections (user_id);
create index if not exists pet_weights_created_by_idx on public.pet_weights (created_by);
-- google_tokens is no longer read by the app (gmail_connections and
-- calendar_connections replaced it) but still holds a sealed token; it stays
-- until that's revoked at myaccount.google.com/permissions and it's dropped.
create index if not exists google_tokens_section_idx on public.google_tokens (section_id);

-- Notes sync looks links up with ilike, which this lower() index never served.
drop index if exists public.sections_notes_link_idx;

-- ---------------------------------------------------------------------------
-- Trigger functions only run as triggers; nobody needs to call them over the API.
-- my_household_id() stays executable on purpose: every RLS policy calls it.
-- ---------------------------------------------------------------------------
revoke execute on function public.on_checkin_ack_runs() from public, anon, authenticated;
revoke execute on function public.on_item_done_ack_runs() from public, anon, authenticated;
