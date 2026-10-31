import { notFound } from "next/navigation";
import { getT, requireHome } from "@/lib/session";
import { AutomationEditor } from "@/components/brain/AutomationEditor";
import type { Automation, Section } from "@/lib/db-types";
import type { AutomationDef } from "@/lib/engine/types";

const BLANK: AutomationDef = {
  name: "",
  icon: "⚡",
  enabled: true,
  trigger: { type: "schedule", days: [0, 1, 2, 3, 4], times: ["09:00"] },
  conditions: [],
  actions: [{ type: "push", title: "", body: "" }],
};

/** "Automate this" from a space: a reminder that opens it, ready to set a schedule for. */
function forSpace(space: Pick<Section, "id" | "title" | "icon">, open: string): AutomationDef {
  return {
    ...BLANK,
    name: space.title,
    icon: space.icon,
    actions: [
      { type: "push", title: `${space.icon} ${space.title}`, body: "" },
      { type: "open_section", sectionId: space.id, label: open },
    ],
  };
}

export default async function AutomationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ section?: string }> }) {
  const { id } = await params;
  const { section: fromSpace } = (await searchParams) ?? {};
  const t = await getT();
  const { supabase, user, members } = await requireHome();
  let automation: Automation | null = null;
  if (id !== "new") {
    const { data } = await supabase.from("automations").select("*").eq("id", id).maybeSingle<Automation>();
    if (!data) notFound();
    automation = data;
  }
  const { data: sections } = await supabase.from("sections").select("id,title,icon").order("position").returns<Pick<Section, "id" | "title" | "icon">[]>();

  return (
    <AutomationEditor
      id={automation?.id ?? null}
      initial={
        automation
          ? { name: automation.name, icon: automation.icon, enabled: automation.enabled, trigger: automation.trigger, conditions: automation.conditions, actions: automation.actions }
          : (() => {
              const space = fromSpace ? sections?.find((s) => s.id === fromSpace) : null;
              return space ? forSpace(space, t.sections.automateOpen) : BLANK;
            })()
      }
      initialTarget={automation?.target_user_id ?? user.id}
      userId={user.id}
      members={members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }))}
      sections={sections ?? []}
    />
  );
}
