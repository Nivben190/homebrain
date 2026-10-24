import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getDict, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n";
import type { Household, Profile } from "@/lib/db-types";

/**
 * Current user + profile + household, deduped per request.
 * Fast path: the JWT is verified locally (getClaims, asymmetric keys) and one
 * query returns every profile RLS lets us see — ourselves plus our partner —
 * each with its household embedded.
 */
export const getSession = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, user: null, profile: null, household: null, members: [] as Profile[] };
  const user = { id: userId, email: (data.claims.email as string | undefined) ?? null };

  const { data: rows } = await supabase.from("profiles").select("*, households(*)").returns<(Profile & { households: Household | null })[]>();
  const strip = ({ households: _h, ...p }: Profile & { households: Household | null }): Profile => p; // eslint-disable-line @typescript-eslint/no-unused-vars
  const mine = rows?.find((r) => r.user_id === userId) ?? null;
  const profile = mine ? strip(mine) : null;
  const household = mine?.households ?? null;
  const members = household ? (rows ?? []).filter((r) => r.household_id === household.id).map(strip) : [];
  return { supabase, user, profile, household, members };
});

/** For pages inside the app: requires a user with a household. */
export async function requireHome() {
  const s = await getSession();
  if (!s.user) redirect("/login");
  if (!s.profile?.household_id || !s.household) redirect("/onboarding");
  const partner = s.members.find((m) => m.user_id !== s.user!.id) ?? null;
  return { ...s, user: s.user, profile: s.profile, household: s.household, partner };
}

export const getLocale = cache(async (): Promise<Locale> => {
  const s = await getSession();
  if (s.profile && isLocale(s.profile.locale)) return s.profile.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "en";
});

export async function getT() {
  return getDict(await getLocale());
}
