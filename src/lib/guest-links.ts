// Sitter and guest links (roadmap 3.3).

export interface GuestLink {
  token: string;
  household_id: string;
  section_id: string | null;
  include_info: boolean;
  label: string;
  expires_at: string;
  revoked_at: string | null;
}

export const isGuestToken = (s: string) => /^[0-9a-f]{32}$/.test(s);

export function guestLinkOpen(link: Pick<GuestLink, "expires_at" | "revoked_at"> | null, now = new Date()): boolean {
  return !!link && !link.revoked_at && new Date(link.expires_at) > now;
}

/** A guest may tick only open items of the one space the link names. */
export function guestMayTick(link: Pick<GuestLink, "section_id">, item: { section_id: string } | null) {
  return !!item && !!link.section_id && item.section_id === link.section_id;
}

export const GUEST_LINK_DAYS = [1, 3, 7, 14] as const;
