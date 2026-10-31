import { redirect } from "next/navigation";
import { MeScreen } from "./MeScreen";

export default async function MePage({ searchParams }: { searchParams?: Promise<{ calendar?: string }> }) {
  // Google Calendar's connect flow comes back here; its result shows under Connections.
  const { calendar } = (await searchParams) ?? {};
  if (calendar) redirect(`/me/connections?calendar=${encodeURIComponent(calendar)}`);
  return <MeScreen part="menu" />;
}

