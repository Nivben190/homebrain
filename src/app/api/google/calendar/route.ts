import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { appOrigin } from "@/lib/url";
import { gmailConfigured, googleAuthUrl, signState } from "@/lib/subs/gmail";
import { CALENDAR_SCOPE, CALENDAR_STATE } from "@/lib/gcal";

export const dynamic = "force-dynamic";

/** Starts "Connect Google Calendar" from the Me tab; comes back through /api/google/callback. */
export async function GET() {
  const { user } = await getSession();
  const origin = await appOrigin();
  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (!gmailConfigured()) return NextResponse.redirect(`${origin}/me?calendar=setup`);
  return NextResponse.redirect(googleAuthUrl(origin, signState(user.id, CALENDAR_STATE), CALENDAR_SCOPE));
}
