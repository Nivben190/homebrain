import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getDict, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n";
import { PUBLIC_PROFILE_COLUMNS, type Household, type Member, type Profile } from "@/lib/db-types";

/**
 * Current user + profile + household, deduped per request.
 * Fast path: the JWT is verified locally (getClaims, asymmetric keys) and one
 * query returns every profile RLS lets us see — ourselves plus our partner —
 * each with its household embedded. Secret tokens aren't readable that way;
 * our own come from my_tokens().
 */
export const getSession = cache(async () => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, user: null, profile: null, household: null, members: [] as Member[] };
  const user = { id: userId, email: (data.claims.email as string | undefined) ?? null };

  const [{ data: rows }, { data: tokens }] = await Promise.all([
    supabase.from("profiles").select(`${PUBLIC_PROFILE_COLUMNS}, households(*)`).returns<(Member & { households: Household | null })[]>(),
    supabase.rpc("my_tokens").maybeSingle<Pick<Profile, "hook_token" | "ics_token">>(),
  ]);
  const strip = ({ households: _h, ...p }: Member & { households: Household | null }): Member => p; // eslint-disable-line @typescript-eslint/no-unused-vars
  const mine = rows?.find((r) => r.user_id === userId) ?? null;
  const profile: Profile | null = mine && tokens ? { ...strip(mine), ...tokens } : null;
  const household = mine?.households ?? null;
  const members = household ? (rows ?? []).filter((r) => r.household_id === household.id).map(strip) : [];
  return { supabase, user, profile, household, members };
});

/** For pages inside the app: requires a user with a household. */
export async function requireHome() {
  const s = await getSession();
  if (!s.user) redirect("/login");
  if (!s.profile?.household_id || !s.household) redirect("/onboarding");
  // Everyone else in the home, any number of them (roadmap 3.1).
  const others = s.members.filter((m) => m.user_id !== s.user!.id);
  return { ...s, user: s.user, profile: s.profile, household: s.household, others };
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
