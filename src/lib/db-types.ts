// Row shapes for the tables in supabase/migrations. Kept by hand (small schema);
// regenerate with `supabase gen types` if it grows.
import type { Action, Condition, RenderedAction, Trigger } from "./engine/types";
import type { PropertyDef } from "./registry/properties";

export interface Household {
  id: string;
  name: string;
  invite_code: string;
}

export interface Profile {
  user_id: string;
  household_id: string | null;
  display_name: string;
  emoji: string;
  locale: "en" | "he";
  timezone: string;
  phone: string | null;
  email: string | null;
  wake_mode: "shortcut" | "fixed" | "first_open";
  wake_time: string | null;
  hook_token: string;
  ics_token: string;
  lat: number | null;
  lon: number | null;
  place: string | null;
  briefing: boolean;
  wrapup: boolean;
  wrapup_time: string;
  quiet_shabbat: boolean;
  shabbat_shop: boolean;
  quiet_from: string | null;
  quiet_to: string | null;
  muted_sections: string[];
  digest: boolean;
  role: Role;
}

export type Role = "owner" | "adult" | "teen" | "child" | "guest";

/** Columns any household member may read (everything but the secret tokens). */
export const PUBLIC_PROFILE_COLUMNS =
  "user_id,household_id,display_name,emoji,locale,timezone,phone,email,wake_mode,wake_time,lat,lon,place,briefing,wrapup,wrapup_time,quiet_shabbat,shabbat_shop,quiet_from,quiet_to,muted_sections,digest,role";

/** A household member as others see them. */
export type Member = Omit<Profile, "hook_token" | "ics_token">;

export interface Pet {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  breed: string | null;
  birthday: string | null;
  chip: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  food_bag_kg: number | null;
  daily_grams: number | null;
  bag_started: string | null;
  food_alerted_bag: string | null;
  notes: string | null;
  created_at: string;
}

export interface PetWeight {
  id: string;
  pet_id: string;
  day: string;
  kg: number;
}

export interface RequestRow {
  id: string;
  household_id: string;
  from_user: string;
  to_user: string;
  text: string;
  due_day: string | null;
  status: "open" | "doing" | "done" | "declined";
  created_at: string;
  updated_at: string;
}

export type SectionView = "list" | "checklist" | "notes" | "tracker" | "gallery" | "dates" | "subscriptions" | "wheel" | "commit" | "spend" | "fridge";

export interface Section {
  pet_id?: string | null;
  id: string;
  household_id: string;
  owner_id: string | null;
  slug: string | null;
  title: string;
  icon: string;
  color: string;
  view: SectionView;
  schema: PropertyDef[];
  position: number;
  created_at: string;
  template?: string | null;
  /** Title of the Apple Note this list syncs with. */
  notes_link?: string | null;
  /** The linked note as of the last sync (normalized line → ticked). */
  notes_state?: Record<string, boolean> | null;
  /** Per-type settings, e.g. a Spending space's card digits. */
  settings?: { cards?: string[]; lastScan?: string } | null;
}

export interface Item {
  id: string;
  section_id: string;
  title: string;
  props: Record<string, unknown>;
  done: boolean;
  position: number;
  due_at: string | null;
  remind_at: string | null;
  gcal_event_id?: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Automation {
  id: string;
  household_id: string;
  owner_id: string;
  target_user_id: string;
  name: string;
  icon: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  next_run_at: string | null;
  created_at: string;
}

export interface Run {
  id: string;
  automation_id: string | null;
  user_id: string;
  household_id: string;
  title: string;
  body: string;
  icon: string;
  rendered: RenderedAction[];
  fired_at: string;
  acknowledged_at: string | null;
  done_at: string | null;
  item_id: string | null;
}

export interface CheckinRow {
  id: string;
  item_id: string;
  user_id: string | null;
  day: string;
  status: "done" | "skipped";
  note: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  automation_id: string;
  user_id: string;
  run_at: string;
  context: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  attempts?: number;
}
