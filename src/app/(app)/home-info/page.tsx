import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { readHomeInfo, type HomeInfo } from "@/lib/home-info";
import { HomeInfoCard } from "@/components/home/HomeInfoCard";

export default async function HomeInfoPage() {
  const { supabase, profile, household } = await requireHome();
  const t = await getT();
  const { data } = await supabase.from("home_info").select("wifi_name,wifi_password,info,guest_fields").eq("household_id", household.id).maybeSingle<HomeInfo>();
  return (
    <div className="safe-top">
      <Link href="/me" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.settings.title}
      </Link>
      <h1 className="text-[30px] font-extrabold tracking-tight">🏠 {t.homeInfo.title}</h1>
      <p className="mt-1 text-muted">{t.homeInfo.intro}</p>
      <HomeInfoCard initial={readHomeInfo(data)} owner={profile.role === "owner"} />
    </div>
  );
}
