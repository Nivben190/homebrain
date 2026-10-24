/**
 * Who a reminder about a space's item can go to: everyone in the household
 * for a shared space, only the owner for a private one. The timezone is the
 * first eligible person's (the household default otherwise).
 */
export function reminderAudience<M extends { user_id: string; timezone: string }>(members: M[], section: { owner_id: string | null }) {
  const eligible = section.owner_id ? members.filter((m) => m.user_id === section.owner_id) : members;
  return { eligible, timeZone: eligible[0]?.timezone ?? "Asia/Jerusalem" };
}
