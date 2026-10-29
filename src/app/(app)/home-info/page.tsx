import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { readHomeInfo, type HomeInfo } from "@/lib/home-info";
import { HomeInfoCard } from "@/components/home/HomeInfoCard";
import { GuestLinks } from "@/components/home/GuestLinks";

export default async function HomeInfoPage() {
  const { supabase, profile, household } = await requireHome();
  const t = await getT();
  const [{ data }, { data: links }, { data: spaces }] = await Promise.all([
    supabase.from("home_info").select("wifi_name,wifi_password,info,guest_fields").eq("household_id", household.id).maybeSingle<HomeInfo>(),
    supabase.from("guest_links").select("token,label,expires_at,sections(icon,title)").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).returns<{ token: string; label: string; expires_at: string; sections: { icon: string; title: string } | null }[]>(),
    supabase.from("sections").select("id,icon,title").is("owner_id", null).order("position"),
  ]);
  return (
    <div className="safe-top">
      <Link href="/me" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.settings.title}
      </Link>
      <h1 className="text-[30px] font-extrabold tracking-tight">🏠 {t.homeInfo.title}</h1>
      <p className="mt-1 text-muted">{t.homeInfo.intro}</p>
      <GuestLinks links={(links ?? []).map((l) => ({ token: l.token, label: l.label, expires_at: l.expires_at, space: l.sections ? `${l.sections.icon} ${l.sections.title}` : null }))} spaces={spaces ?? []} />
      <HomeInfoCard initial={readHomeInfo(data)} owner={profile.role === "owner"} />
    </div>
  );
}
