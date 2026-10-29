import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTx } from "@/lib/spend";
import { spendBetween } from "@/lib/money";

export interface WeekModel {
  done: { actor: string | null; count: number }[];
  sessions: { title: string; done: number }[];
  spent: number;
  spentBefore: number;
  coming: { title: string; due_at: string; section_id: string }[];
  requests: { text: string; from_user: string; to_user: string }[];
}

/** The Sunday check-in page: the last 7 days and the next 7 (roadmap 3.8). Reads with whatever client it's given. */
export async function loadWeek(db: SupabaseClient, householdId: string, now = new Date()): Promise<WeekModel> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);
  const [{ data: activity }, { data: checkins }, { data: spend }, { data: coming }, { data: requests }] = await Promise.all([
    db.from("activity").select("actor,kind").eq("household_id", householdId).in("kind", ["ticked", "checked_in"]).gte("at", weekAgo.toISOString()),
    db.from("checkins").select("items!inner(title,sections!inner(household_id))").eq("items.sections.household_id", householdId).eq("status", "done").gte("created_at", weekAgo.toISOString()).returns<{ items: { title: string } }[]>(),
    db.from("items").select("props,sections!inner(view,household_id)").eq("sections.household_id", householdId).eq("sections.view", "spend").gte("created_at", twoWeeksAgo.toISOString()),
    db.from("items").select("title,due_at,section_id,sections!inner(household_id)").eq("sections.household_id", householdId).eq("done", false).gte("due_at", now.toISOString()).lt("due_at", weekAhead.toISOString()).order("due_at").limit(15),
    db.from("requests").select("text,from_user,to_user").eq("household_id", householdId).in("status", ["open", "doing"]),
  ]);

  const byActor = new Map<string | null, number>();
  for (const a of activity ?? []) byActor.set(a.actor, (byActor.get(a.actor) ?? 0) + 1);
  const bySession = new Map<string, number>();
  for (const c of checkins ?? []) bySession.set(c.items.title, (bySession.get(c.items.title) ?? 0) + 1);
  const txs = (spend ?? []).flatMap((i) => {
    const tx = readTx(i.props);
    return tx ? [tx] : [];
  });

  return {
    done: [...byActor].map(([actor, count]) => ({ actor, count })).sort((a, b) => b.count - a.count),
    sessions: [...bySession].map(([title, done]) => ({ title, done })).sort((a, b) => b.done - a.done),
    spent: spendBetween(txs, weekAgo, now),
    spentBefore: spendBetween(txs, twoWeeksAgo, weekAgo),
    coming: (coming ?? []).map((c) => ({ title: c.title, due_at: c.due_at, section_id: c.section_id })),
    requests: requests ?? [],
  };
}
