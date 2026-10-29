import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  if (profile?.household_id) redirect("/");
  return <OnboardingForm defaultName={profile?.display_name ?? ""} invite={invite} />;
}
