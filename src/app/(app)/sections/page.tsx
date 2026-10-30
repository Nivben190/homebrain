import Link from "next/link";
import { requireHome, getT } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { SpacesGrid } from "@/components/sections/SpacesGrid";
import { NewSectionButton } from "@/components/sections/NewSectionButton";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { SearchBox } from "@/components/sections/SearchBox";
import type { Section } from "@/lib/db-types";

export default async function SectionsPage() {
  const { supabase, household, profile, user } = await requireHome();
  const t = await getT();
  const [{ data: sections }, { data: items }] = await Promise.all([
    supabase.from("sections").select("*").order("position").returns<Section[]>(),
    supabase.from("items").select("section_id").eq("done", false),
  ]);
  const counts = new Map<string, number>();
  for (const i of items ?? []) counts.set(i.section_id, (counts.get(i.section_id) ?? 0) + 1);

  return (
    <>
      <RealtimeRefresh tables={["sections"]} />
      <PageHeader title={t.sections.title} action={["owner", "adult", "teen"].includes(profile.role) ? <NewSectionButton householdId={household.id} userId={user.id} timeZone={profile.timezone} privateOnly={profile.role === "teen"} /> : undefined} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link href="/meals" className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 font-semibold">🍽️ {t.meals.link}</Link>
        <Link href="/calendar" className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 font-semibold">📅 {t.calendar.title}</Link>
        <Link href="/money" className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 font-semibold">💰 {t.money.title}</Link>
        <Link href="/weekly" className="glass flex flex-1 items-center gap-2 rounded-2xl px-3 py-2.5 font-semibold">🗓️ {t.weekly.title}</Link>
      </div>
      <SearchBox spaces={(sections ?? []).map((s) => ({ id: s.id, icon: s.icon, title: s.title }))} />
      <SpacesGrid sections={sections ?? []} counts={Object.fromEntries(counts)} canReorder={["owner", "adult"].includes(profile.role)} />
    </>
  );
}
