import { notFound } from "next/navigation";
import { requireHome } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { SectionScreen } from "@/components/sections/SectionScreen";
import { launchTokenFor } from "@/lib/hook-auth";
import type { CheckinRow, Item, Section } from "@/lib/db-types";

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, profile, members } = await requireHome();
  const [{ data: section }, { data: items }] = await Promise.all([
    supabase.from("sections").select("*").eq("id", id).maybeSingle<Section>(),
    // Check-ins ride along in the same request (only tracker items have any).
    supabase.from("items").select("*, checkins(*)").eq("section_id", id).order("position").order("created_at").returns<(Item & { checkins: CheckinRow[] })[]>(),
  ]);
  if (!section) notFound();
  const checkins = (items ?? []).flatMap((i) => i.checkins ?? []);
  // gmail_connections is service-role only; read just this space's connection status (RLS already let us see the space).
  const gmail =
    section.view === "subscriptions"
      ? (await createSupabaseAdmin().from("gmail_connections").select("email,status,last_scan_at,scan_stats").eq("section_id", section.id).maybeSingle()).data
      : null;
  return (
    <SectionScreen
      key={section.id}
      initialSection={section}
      initialItems={items ?? []}
      initialCheckins={checkins}
      timeZone={profile.timezone}
      launch={{ notes: launchTokenFor(user.id, "notes"), checkin: launchTokenFor(user.id, "checkin") }}
      gmail={gmail ? { email: gmail.email, status: gmail.status, lastScanAt: gmail.last_scan_at, stats: gmail.scan_stats ?? null } : null}
      userId={user.id}
      members={members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }))}
    />
  );
}
