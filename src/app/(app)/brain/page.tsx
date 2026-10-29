import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { RecipeGallery } from "@/components/brain/RecipeGallery";
import { AutomationToggle } from "@/components/brain/AutomationToggle";
import { ACTION_META, describeTrigger } from "@/lib/registry/automation";
import type { Automation } from "@/lib/db-types";

export default async function BrainPage() {
  const { supabase, user, profile, members } = await requireHome();
  const t = await getT();
  const [{ data }, { data: log }] = await Promise.all([
    supabase.from("automations").select("*").order("created_at").returns<Automation[]>(),
    supabase.from("automation_log").select("id,automation_id,status,reason,at").order("at", { ascending: false }).limit(20),
  ]);
  const automations = data ?? [];
  const fmt = new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader
        title={t.brain.title}
        subtitle={t.brain.subtitle}
        action={
          <Link href="/brain/new" aria-label={t.brain.new} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_8px_20px_-6px_var(--accent)] transition active:scale-90">
            <Plus className="size-6" strokeWidth={2.6} />
          </Link>
        }
      />
      <SectionTitle>{t.brain.recipes}</SectionTitle>
      <RecipeGallery />
      <SectionTitle>{t.brain.title}</SectionTitle>
      {automations.length === 0 && <Card className="py-10 text-center text-muted">{t.brain.empty}</Card>}
      <div className="space-y-3">
        {automations.map((a) => {
          const target = a.target_user_id !== user.id ? members.find((m) => m.user_id === a.target_user_id) : null;
          return (
            <div key={a.id} className={`glass flex items-center gap-3 rounded-3xl p-4 transition ${a.enabled ? "" : "opacity-55"}`}>
              <Link href={`/brain/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl">{a.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-bold">
                    {a.name} {target && <span className="text-sm font-medium text-muted">→ {target.emoji}</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">{describeTrigger(a.trigger, t)}</span>
                  <span className="mt-1 flex items-center gap-1 text-sm">
                    {a.actions.map((x, i) => (
                      <span key={i}>{ACTION_META[x.type]?.icon}</span>
                    ))}
                    {a.enabled && a.next_run_at && (
                      <span className="ms-1 rounded-lg bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                        {t.brain.next} {fmt.format(new Date(a.next_run_at))}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
              <AutomationToggle id={a.id} enabled={a.enabled} />
            </div>
          );
        })}
      </div>

      <SectionTitle>{t.brain.activity}</SectionTitle>
      {(log ?? []).length === 0 ? (
        <Card className="py-6 text-center text-sm text-muted">{t.brain.activityEmpty}</Card>
      ) : (
        <Card className="divide-y divide-card-border p-0">
          {(log ?? []).map((l) => {
            const a = automations.find((x) => x.id === l.automation_id);
            const icon = l.status === "fired" ? "✅" : l.status === "skipped" ? "⏭️" : "⚠️";
            return (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span>{a?.icon ?? "⚡"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a?.name ?? "—"}</span>
                  <span className="block truncate text-xs text-muted">
                    {icon} {t.brain.status[l.status] ?? l.status}
                    {l.reason && l.status !== "fired" ? ` · ${t.brain.reasons[l.reason] ?? l.reason}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{fmt.format(new Date(l.at))}</span>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
