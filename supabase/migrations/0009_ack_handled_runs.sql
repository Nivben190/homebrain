-- "Waiting for you" shows runs nobody acknowledged. A reminder about an item is
-- answered wherever the item gets handled — a check-in from the tracker, Today,
-- the wrap-up, the iPhone button, a partner, or ticking the item — so clear
-- every open run about that item for everyone, whichever path did it.

create or replace function public.ack_item_runs(p_item uuid, p_done boolean)
returns void language sql security definer set search_path = public as $$
  update public.runs
  set acknowledged_at = now(),
      done_at = case when p_done then coalesce(done_at, now()) else done_at end
  where item_id = p_item and acknowledged_at is null;
$$;
revoke execute on function public.ack_item_runs(uuid, boolean) from public, anon, authenticated;

create or replace function public.on_checkin_ack_runs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ack_item_runs(new.item_id, new.status = 'done');
  return new;
end;
$$;

drop trigger if exists checkins_ack_runs on public.checkins;
create trigger checkins_ack_runs after insert or update of status on public.checkins
  for each row execute function public.on_checkin_ack_runs();

create or replace function public.on_item_done_ack_runs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done then
    perform public.ack_item_runs(new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists items_done_ack_runs on public.items;
create trigger items_done_ack_runs after update of done on public.items
  for each row execute function public.on_item_done_ack_runs();
