import { notFound } from "next/navigation";
import { SETTINGS_PARTS, type SettingsPart } from "@/lib/settings-parts";
import { MeScreen } from "../MeScreen";

/** One group of Me (profile, notifications, family, connections, your data) on its own page. */
export default async function MePartPage({ params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  if (!(SETTINGS_PARTS as string[]).includes(part)) notFound();
  return <MeScreen part={part as SettingsPart} />;
}
