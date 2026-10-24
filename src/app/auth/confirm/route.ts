import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Landing page for links in Supabase auth emails:
 *   ?code=…                    (PKCE link — must open in the browser that asked for it)
 *   ?token_hash=…&type=email   (token-hash link — works in any browser)
 * The 6-digit code typed on /login stays the main path on iPhone, where links
 * open in Safari instead of the installed app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const supabase = await createSupabaseServer();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing code") };

  const target = new URL(error ? "/login" : "/", url.origin);
  if (error) target.searchParams.set("error", error.message);
  return NextResponse.redirect(target);
}
