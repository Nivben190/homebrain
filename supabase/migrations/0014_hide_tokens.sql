-- 01 (second half): household members can read every profile column except the secret tokens.
revoke select on public.profiles from anon, authenticated;
grant select (
  user_id, household_id, display_name, emoji, locale, timezone, phone, email,
  wake_mode, wake_time, created_at, lat, lon, place, briefing, wrapup,
  wrapup_time, quiet_shabbat, shabbat_shop
) on public.profiles to authenticated;
