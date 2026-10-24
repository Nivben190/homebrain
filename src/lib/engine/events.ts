import type { Automation } from "@/lib/db-types";

/**
 * What an event (e.g. "wake") sets off: automations with no delay fire now,
 * delayed ones become jobs the tick picks up +N minutes later.
 */
export function planEvent(automations: Automation[], userId: string, type: string, now: Date) {
  const plan = { now: [] as Automation[], jobs: [] as { automation_id: string; user_id: string; run_at: string; context: { event: string } }[] };
  for (const a of automations) {
    const delay = a.trigger.type === "event" ? a.trigger.delayMinutes : 0;
    if (delay > 0) {
      plan.jobs.push({ automation_id: a.id, user_id: userId, run_at: new Date(now.getTime() + delay * 60000).toISOString(), context: { event: type } });
    } else {
      plan.now.push(a);
    }
  }
  return plan;
}
