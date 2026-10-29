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
      <PageHeader title={t.sections.title} action={<NewSectionButton householdId={household.id} userId={user.id} timeZone={profile.timezone} />} />
      <SearchBox spaces={(sections ?? []).map((s) => ({ id: s.id, icon: s.icon, title: s.title }))} />
      <SpacesGrid sections={sections ?? []} counts={Object.fromEntries(counts)} />
    </>
  );
}
