/**
 * Who may create an account: an email on the allowed list, or anyone holding
 * a valid household invite code. Before any home exists the first person is
 * let in so a fresh deployment can be set up.
 */
export function canSignUp(input: { email: string; allowedEmails?: string; inviteValid: boolean; anyHome: boolean }): boolean {
  const allowed = (input.allowedEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.includes(input.email.toLowerCase())) return true;
  if (input.inviteValid) return true;
  return !input.anyHome && allowed.length === 0;
}

/** Invite links carry a 32-hex token; the household code is 8 characters. */
export const isInviteToken = (s: string) => /^[0-9a-f]{32}$/.test(s);

export type InviteState = "ok" | "missing" | "used" | "expired";

export function inviteState(invite: { used_at: string | null; expires_at: string } | null, now = new Date()): InviteState {
  if (!invite) return "missing";
  if (invite.used_at) return "used";
  return new Date(invite.expires_at) < now ? "expired" : "ok";
}
