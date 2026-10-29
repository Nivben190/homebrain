-- Column revokes don't beat Supabase's table-wide default grant; grant columns explicitly so `secrets` stays server-only.
revoke all on public.home_info from anon, authenticated;
grant select (household_id, wifi_name, wifi_password, info, guest_fields, updated_at),
      insert (household_id, wifi_name, wifi_password, info, guest_fields, updated_at),
      update (wifi_name, wifi_password, info, guest_fields, updated_at)
  on public.home_info to authenticated;
