import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { AutomationToggle } from "@/components/brain/AutomationToggle";
import { ACTION_META, describeTrigger } from "@/lib/registry/automation";
import type { Automation } from "@/lib/db-types";

export default async function BrainPage() {
  const { supabase, user, profile, members } = await requireHome();
  const t = await getT();
  const { data } = await supabase.from("automations").select("*").order("created_at").returns<Automation[]>();
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
    </>
  );
}
