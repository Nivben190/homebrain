import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/url";
import { getDict } from "@/i18n";
import { exchangeCode, GmailApiDisabled, gmailAddress, GMAIL_SCOPE, GoogleAuthError, readState, sealToken } from "@/lib/subs/gmail";
import { scanGmail } from "@/lib/subs/scan";

export const dynamic = "force-dynamic";
// The first scan reads up to a year of receipts.
export const maxDuration = 120;

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
      .upsert({ section_id: sectionId, user_id: user.id, email, refresh_token: sealToken(tokens.refresh_token), status: "ok", scan_error: null, updated_at: new Date().toISOString() }, { onConflict: "section_id" });
    if (error) throw error;
    // A space still called just "Subscriptions" gets the inbox in its name, so several are easy to tell apart.
    const plain = getDict(profile?.locale ?? "en").views.subscriptions;
    if ([plain, "Subscriptions", "מנויים"].includes(section.title.trim())) {
      await db.from("sections").update({ title: `${section.title.trim()} · ${email.split("@")[0]}` }).eq("id", sectionId);
    }
    const result = await scanGmail(db, sectionId);
    return back(result.ok ? "connected" : result.error, result.ok ? `${email}: found ${result.found}` : "scan");
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
