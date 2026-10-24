import { requireHome } from "@/lib/session";
import { TabBar } from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireHome();
  return (
    <>
      <main className="mx-auto max-w-lg px-4 pb-32">{children}</main>
      <TabBar />
    </>
  );
}
