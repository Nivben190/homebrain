import { requireHome } from "@/lib/session";
import { TabBar } from "@/components/TabBar";
import { OfflineSync } from "@/components/OfflineSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, members } = await requireHome();
  const { data: spaces } = await supabase.from("sections").select("id,title,icon,template,view").order("position");
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pb-32">{children}</main>
      <OfflineSync />
      <TabBar spaces={spaces ?? []} members={members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }))} timeZone={profile.timezone} />
    </>
  );
}
