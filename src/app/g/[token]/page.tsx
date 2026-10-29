import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getT } from "@/lib/session";
import { guestLinkOpen, isGuestToken, type GuestLink } from "@/lib/guest-links";
import { guestView, readHomeInfo, type HomeInfo } from "@/lib/home-info";
import { todayKey } from "@/lib/engine/habits";
import { GuestScreen } from "./GuestScreen";

export const dynamic = "force-dynamic";

/** What a sitter or guest sees (roadmap 3.3): one space's tasks and the guest-safe home info. No account. */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  const db = createSupabaseAdmin();
  const { data: link } = isGuestToken(token) ? await db.from("guest_links").select("*").eq("token", token).maybeSingle<GuestLink>() : { data: null };
  if (!link || !guestLinkOpen(link)) {
    return <main className="safe-top mx-auto flex min-h-dvh max-w-md items-center px-6 text-center"><p className="glass w-full rounded-3xl p-5">⌛ {t.guest.expired}</p></main>;
  }

  const [{ data: home }, { data: section }, { data: info }, { data: tz }] = await Promise.all([
    db.from("households").select("name").eq("id", link.household_id).single(),
    link.section_id ? db.from("sections").select("id,title,icon,view").eq("id", link.section_id).maybeSingle() : Promise.resolve({ data: null }),
    link.include_info ? db.from("home_info").select("wifi_name,wifi_password,info,guest_fields").eq("household_id", link.household_id).maybeSingle<HomeInfo>() : Promise.resolve({ data: null }),
    db.from("profiles").select("timezone").eq("household_id", link.household_id).limit(1).maybeSingle(),
  ]);
  const today = todayKey(tz?.timezone ?? "Asia/Jerusalem");
  const { data: items } = section
    ? await db.from("items").select("id,title,done,checkins(day)").eq("section_id", section.id).eq("checkins.day", today).order("position").returns<{ id: string; title: string; done: boolean; checkins: { day: string }[] }[]>()
    : { data: [] };

  return (
    <GuestScreen
      token={token}
      home={home?.name ?? ""}
      label={link.label}
      expiresAt={link.expires_at}
      section={section ? { title: section.title, icon: section.icon, tracker: section.view === "tracker" } : null}
      items={(items ?? []).map((i) => ({ id: i.id, title: i.title, done: section?.view === "tracker" ? i.checkins.length > 0 : i.done }))}
      info={info ? guestView(readHomeInfo(info)) : null}
    />
  );
}
