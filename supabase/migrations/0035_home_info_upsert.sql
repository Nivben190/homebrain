-- Saving the home info card is an upsert, and ON CONFLICT DO UPDATE sets every
-- sent column, household_id included; without UPDATE on it every save after
-- the first failed with "permission denied". RLS still pins the row to your home.
grant update (household_id) on public.home_info to authenticated;
