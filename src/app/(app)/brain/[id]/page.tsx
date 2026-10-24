import { notFound } from "next/navigation";
import { requireHome } from "@/lib/session";
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

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
          : BLANK
      }
      initialTarget={automation?.target_user_id ?? user.id}
      userId={user.id}
      members={members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }))}
      sections={sections ?? []}
    />
  );
}
