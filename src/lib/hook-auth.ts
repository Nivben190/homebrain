import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashKey, legacyAccepted, signLaunch, verifyLaunch, type HookPurpose } from "./hook-keys";

const launchSecret = () => process.env.HOOK_LAUNCH_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** A token the app can hand a Shortcut it launches (the Notes 🔄 button). */
export function launchTokenFor(userId: string, purpose: HookPurpose) {
  return signLaunch(userId, purpose, launchSecret());
}

/**
 * The user behind a Shortcut's token: a live key for this purpose, a launch
 * token the app signed, or (until the cutoff) the old shared hook_token.
 */
export async function authenticateHook(db: SupabaseClient, token: string | null, purpose: HookPurpose): Promise<string | null> {
  if (!token) return null;
  if (token.startsWith("l1.")) return verifyLaunch(token, purpose, launchSecret());

  const { data: key } = await db
    .from("hook_keys")
    .select("id,user_id")
    .eq("key_hash", hashKey(token))
    .eq("purpose", purpose)
    .is("revoked_at", null)
    .maybeSingle<{ id: string; user_id: string }>();
  if (key) {
    await db.from("hook_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    return key.user_id;
  }

  if (!legacyAccepted()) return null;
  const { data: legacy } = await db.from("profiles").select("user_id").eq("hook_token", token).maybeSingle<{ user_id: string }>();
  if (legacy) await db.from("profiles").update({ hook_token_used_at: new Date().toISOString() }).eq("user_id", legacy.user_id);
  return legacy?.user_id ?? null;
}
