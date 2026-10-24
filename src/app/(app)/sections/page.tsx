import Link from "next/link";
import { Lock } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { IconTile, PageHeader } from "@/components/ui";
import { NewSectionButton } from "@/components/sections/NewSectionButton";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
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
      <div className="grid grid-cols-2 gap-3">
        {(sections ?? []).map((s) => (
          <Link key={s.id} href={`/sections/${s.id}`} className="glass group relative flex aspect-[1.1] flex-col justify-between rounded-[1.75rem] p-4 transition active:scale-[0.97]">
            <div className="flex items-start justify-between">
              <IconTile icon={s.icon} color={s.color} className="size-12 text-2xl" />
              {s.owner_id && <Lock className="size-4 text-faint" />}
            </div>
            <div>
              <p className="line-clamp-2 text-[17px] font-bold leading-tight">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                {counts.get(s.id) ?? 0} {t.sections.items}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
