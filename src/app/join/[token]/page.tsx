import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getSession, getT } from "@/lib/session";
import { fill } from "@/i18n";
import { inviteState, isInviteToken } from "@/lib/signup";
import { MoveHome } from "./MoveHome";

export const dynamic = "force-dynamic";

type Invite = { household_id: string; created_by: string | null; used_at: string | null; expires_at: string; households: { name: string } | null };

/** Landing page of an invite link (roadmap 2.1). Public: the invitee may not have an account yet. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getT();
  const admin = createSupabaseAdmin();
  const { data: invite } = isInviteToken(token)
    ? await admin.from("household_invites").select("household_id,created_by,used_at,expires_at,households(name)").eq("token", token).maybeSingle<Invite>()
    : { data: null };
  const { user, profile, household, members } = await getSession();

  if (invite && profile?.household_id === invite.household_id) redirect("/");
  const shell = (body: React.ReactNode) => <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 pb-10">{body}</main>;
  if (!invite || inviteState(invite) !== "ok") return shell(<p className="glass rounded-3xl p-5 text-center">⌛ {t.join.expired}</p>);

  const home = invite.households?.name ?? "Home";
  const { data: inviter } = invite.created_by ? await admin.from("profiles").select("display_name,emoji").eq("user_id", invite.created_by).maybeSingle() : { data: null };
  const header = (
    <>
      <div className="text-6xl">🏠</div>
      <h1 className="text-3xl font-extrabold tracking-tight">{fill(t.join.title, { home })}</h1>
      {inviter && (
        <p className="text-muted">
          {inviter.emoji} {fill(t.join.invitedBy, { name: inviter.display_name })}
        </p>
      )}
    </>
  );

  if (!user) {
    return shell(
      <>
        {header}
        <Link href={`/login?invite=${token}`} className="flex h-14 items-center justify-center rounded-2xl bg-accent font-semibold text-accent-fg">
          {t.join.signUp}
        </Link>
        <Link href={`/login?invite=${token}&mode=signin`} className="flex h-12 items-center justify-center rounded-2xl bg-sunken font-semibold">
          {t.join.signIn}
        </Link>
      </>,
    );
  }
  if (!profile?.household_id) redirect(`/onboarding?invite=${token}`);
  return shell(
    <>
      {header}
      <MoveHome token={token} home={home} current={household?.name ?? ""} alone={members.length <= 1} />
    </>,
  );
}
