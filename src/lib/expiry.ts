// Documents with expiry dates (roadmap 3.7): heads-ups 60, 30 and 7 days ahead.

export const EXPIRY_PROP = "_expiry";

/** Spaces whose first date property is an expiry: documents, the shelter kit, warranties. */
export const EXPIRY_TEMPLATES = ["documents", "shelter-kit", "receipts"];
export const STAGES = [60, 30, 7] as const;
export type Stage = (typeof STAGES)[number];

/** Which stages were already sent, and for which expiry date (a renewed date starts over). */
export interface ExpirySent {
  for: string;
  sent: number[];
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The stage to send today, or null. Missed stages collapse into the nearest one. */
export function expiryStage(expires: string, today: string, state: ExpirySent | null): Stage | null {
  const left = daysBetween(today, expires.slice(0, 10));
  if (left < 0) return null;
  const sent = state?.for === expires.slice(0, 10) ? state.sent : [];
  const due = STAGES.filter((s) => left <= s);
  const nearest = due[due.length - 1];
  if (nearest === undefined || sent.includes(nearest)) return null;
  return nearest;
}
