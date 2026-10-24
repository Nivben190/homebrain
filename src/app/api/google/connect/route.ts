import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { appOrigin } from "@/lib/url";
import { gmailConfigured, googleAuthUrl, signState } from "@/lib/subs/gmail";

export const dynamic = "force-dynamic";

/** Starts "Connect Gmail" for one Subscriptions space: Google, with a signed state (who + which space). */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getSession();
  const origin = await appOrigin();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  const id = request.nextUrl.searchParams.get("section") ?? "";
  // RLS: only a space this user can see.
  const { data: section } = /^[0-9a-f-]{36}$/.test(id) ? await supabase.from("sections").select("id,view").eq("id", id).maybeSingle() : { data: null };
  if (section?.view !== "subscriptions") return NextResponse.redirect(`${origin}/sections`);
  if (!gmailConfigured()) return NextResponse.redirect(`${origin}/sections/${id}?gmail=setup`);
  return NextResponse.redirect(googleAuthUrl(origin, signState(user.id, id)));
}
