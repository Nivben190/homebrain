import { requireHome } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/url";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { tickHealth, type EngineStatus } from "@/lib/health";

export default async function MePage() {
  const { supabase, user, profile, household, members } = await requireHome();
  const admin = createSupabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data: gmail }, { data: gcal }, { data: engine }, { count: failedJobs }, origin, { data: spaces }] = await Promise.all([
    // Inboxes this user connected (one per Subscriptions space).
    admin.from("gmail_connections").select("section_id,email,status,sections(title,icon)").eq("user_id", user.id).returns<{ section_id: string; email: string | null; status: string; sections: { title: string; icon: string } | null }[]>(),
    admin.from("calendar_connections").select("email,status").eq("user_id", user.id).maybeSingle(),
    admin.from("engine_status").select("last_tick_at,failed_phases").maybeSingle<EngineStatus>(),
    admin.from("jobs").select("id", { count: "exact", head: true }).in("user_id", members.map((m) => m.user_id)).eq("status", "failed").gte("created_at", weekAgo),
    appOrigin(),
    supabase.from("sections").select("id,icon,title").order("position"),
  ]);
  const expiredGoogle = (gmail ?? []).filter((g) => g.status === "expired").length + (gcal?.status === "expired" ? 1 : 0);
  return (
    <SettingsScreen
      profile={{
        display_name: profile.display_name,
        emoji: profile.emoji,
        phone: profile.phone ?? "",
        timezone: profile.timezone,
        wake_mode: profile.wake_mode,
        wake_time: profile.wake_time?.slice(0, 5) ?? "07:00",
        email: profile.email ?? "",
      }}
      household={{ name: household.name, invite_code: household.invite_code }}
      members={members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }))}
      feedUrl={`${origin}/api/cal/${profile.ics_token}.ics`}
      spaces={spaces ?? []}
      partners={members.filter((m) => m.user_id !== user.id).map((m) => m.display_name)}
      brain={{ ...tickHealth(engine), failedJobs: failedJobs ?? 0, expiredGoogle }}
      gcal={gcal ?{ email: gcal.email, expired: gcal.status === "expired" } : null}
      gmail={(gmail ?? []).map((g) => ({ sectionId: g.section_id, email: g.email, expired: g.status === "expired", space: `${g.sections?.icon ?? "💳"} ${g.sections?.title ?? ""}` }))}
      daily={{
        place: profile.place,
        briefing: profile.briefing,
        wrapup: profile.wrapup,
        wrapup_time: profile.wrapup_time,
        quiet_shabbat: profile.quiet_shabbat,
        shabbat_shop: profile.shabbat_shop,
        quiet_from: profile.quiet_from,
        quiet_to: profile.quiet_to,
        muted_sections: profile.muted_sections ?? [],
        digest: profile.digest,
      }}
    />
  );
}
