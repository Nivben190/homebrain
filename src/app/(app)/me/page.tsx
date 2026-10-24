import { requireHome } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/url";
import { SettingsScreen } from "@/components/settings/SettingsScreen";

export default async function MePage() {
  const { user, profile, household, members } = await requireHome();
  // Inboxes this user connected (one per Subscriptions space).
  const { data: gmail } = await createSupabaseAdmin().from("gmail_connections").select("section_id,email,status,sections(title,icon)").eq("user_id", user.id).returns<{ section_id: string; email: string | null; status: string; sections: { title: string; icon: string } | null }[]>();
  const { data: gcal } = await createSupabaseAdmin().from("calendar_connections").select("email,status").eq("user_id", user.id).maybeSingle();
  const origin = await appOrigin();
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
      gcal={gcal ? { email: gcal.email, expired: gcal.status === "expired" } : null}
      gmail={(gmail ?? []).map((g) => ({ sectionId: g.section_id, email: g.email, expired: g.status === "expired", space: `${g.sections?.icon ?? "💳"} ${g.sections?.title ?? ""}` }))}
      daily={{
        place: profile.place,
        briefing: profile.briefing,
        wrapup: profile.wrapup,
        wrapup_time: profile.wrapup_time,
        quiet_shabbat: profile.quiet_shabbat,
        shabbat_shop: profile.shabbat_shop,
      }}
    />
  );
}
