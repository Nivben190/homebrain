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
