import { after, NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/url";
import { getDict } from "@/i18n";
import { exchangeCode, GmailApiDisabled, gmailAddress, GMAIL_SCOPE, GoogleAuthError, readState, sealToken } from "@/lib/subs/gmail";
import { FIRST_SCAN_MS, scanGmail } from "@/lib/subs/scan";
import { calendarAccount, CALENDAR_SCOPE, CALENDAR_STATE } from "@/lib/gcal";

export const dynamic = "force-dynamic";
// The first scan reads up to a year of receipts, after the person is already back in the space.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const origin = await appOrigin();
  const db = createSupabaseAdmin();
  const { supabase, user, profile } = await getSession();
  const q = request.nextUrl.searchParams;
  const state = readState(q.get("state") ?? "");
  const sectionId = state?.s ?? "";

  // Each outcome is kept as an event, so a failed connect can be diagnosed later.
  const back = async (result: string, detail?: string) => {
    const userId = user?.id ?? state?.u;
    if (userId) await db.from("events").insert({ user_id: userId, type: "gmail_connect", payload: { result, section: sectionId || null, detail: detail?.slice(0, 500) ?? null } });
    return NextResponse.redirect(`${origin}${sectionId ? `/sections/${sectionId}` : "/sections"}?gmail=${result}`);
  };

  if (!user) return NextResponse.redirect(`${origin}/login`);
  if (state?.s === CALENDAR_STATE && state.u === user.id) return connectCalendar(q, origin, user.id);
  if (q.get("error")) return back("cancelled", q.get("error")!);
  // The signed state must be this user's: nobody can hand you a link that connects your Gmail to their space.
  if (!state || state.u !== user.id) return back("failed", state ? "state: other user" : "state: missing/invalid/expired");
  const { data: section } = await supabase.from("sections").select("id,title,view").eq("id", sectionId).maybeSingle();
  if (section?.view !== "subscriptions") return back("failed", "space gone");
  if (!q.get("code")) return back("failed", "no code");

  try {
    const tokens = await exchangeCode(q.get("code")!, origin);
    // Google lets people untick "Read your email" on the consent screen.
    if (!tokens.scope?.split(" ").includes(GMAIL_SCOPE)) return back("noscope", tokens.scope);
    if (!tokens.refresh_token) return back("failed", "no refresh token");
    const email = await gmailAddress(tokens.access_token!);
    const { error } = await db
      .from("gmail_connections")
      .upsert({ section_id: sectionId, user_id: user.id, email, refresh_token: sealToken(tokens.refresh_token), status: "ok", scan_error: null, updated_at: new Date().toISOString(), retry_after: new Date(Date.now() + FIRST_SCAN_MS).toISOString() }, { onConflict: "section_id" });
    if (error) throw error;
    // A space still called just "Subscriptions" gets the inbox in its name, so several are easy to tell apart.
    const plain = getDict(profile?.locale ?? "en").views.subscriptions;
    if ([plain, "Subscriptions", "מנויים"].includes(section.title.trim())) {
      await db.from("sections").update({ title: `${section.title.trim()} · ${email.split("@")[0]}` }).eq("id", sectionId);
    }
    after(() => scanGmail(db, sectionId));
    return back("connected", email);
  } catch (e) {
    // iOS sometimes opens the return link twice; the second code is already used.
    if (e instanceof GoogleAuthError) {
      const { data: fresh } = await db.from("gmail_connections").select("updated_at").eq("section_id", sectionId).maybeSingle();
      if (fresh && Date.now() - Date.parse(fresh.updated_at) < 3 * 60000) return NextResponse.redirect(`${origin}/sections/${sectionId}`);
    }
    console.error("[gmail] connect failed", e);
    return back(e instanceof GmailApiDisabled ? "apidisabled" : "failed", String(e));
  }
}

/** The Google Calendar branch: store this person's calendar connection, then back to the Me tab. */
async function connectCalendar(q: URLSearchParams, origin: string, userId: string) {
  const back = (result: string) => NextResponse.redirect(`${origin}/me?calendar=${result}`);
  if (q.get("error")) return back("cancelled");
  if (!q.get("code")) return back("failed");
  try {
    const tokens = await exchangeCode(q.get("code")!, origin);
    if (!tokens.scope?.split(" ").includes(CALENDAR_SCOPE)) return back("noscope");
    if (!tokens.refresh_token) return back("failed");
    const email = await calendarAccount(tokens.access_token!);
    const { error } = await createSupabaseAdmin()
      .from("calendar_connections")
      .upsert({ user_id: userId, email, refresh_token: sealToken(tokens.refresh_token), status: "ok", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return back("connected");
  } catch (e) {
    console.error("[calendar] connect failed", e);
    return back("failed");
  }
}
