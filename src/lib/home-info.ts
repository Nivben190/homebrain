// Home info card (roadmap 3.9): shapes shared by the editor, the guest view and the server.

export interface HomeInfo {
  wifi_name: string | null;
  wifi_password: string | null;
  info: {
    accounts: { label: string; value: string }[];
    contacts: { label: string; phone: string }[];
    vet: { name: string; phone: string };
    notes: string;
  };
  guest_fields: GuestField[];
}

export type GuestField = "wifi" | "contacts" | "vet" | "notes";

export const EMPTY_HOME_INFO: HomeInfo = {
  wifi_name: null,
  wifi_password: null,
  info: { accounts: [], contacts: [], vet: { name: "", phone: "" }, notes: "" },
  guest_fields: ["wifi", "contacts", "vet"],
};

export function readHomeInfo(row: Partial<HomeInfo> | null): HomeInfo {
  return {
    ...EMPTY_HOME_INFO,
    ...row,
    info: { ...EMPTY_HOME_INFO.info, ...(row?.info ?? {}) },
    guest_fields: row?.guest_fields ?? EMPTY_HOME_INFO.guest_fields,
  };
}

/** The standard Wi-Fi join QR payload phones understand (WIFI:T:WPA;S:…;P:…;;). */
export function wifiQr(name: string, password: string | null) {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
  return password ? `WIFI:T:WPA;S:${esc(name)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(name)};;`;
}

/** What a guest link may show: only the fields the home chose, never accounts or secrets. */
export function guestView(info: HomeInfo): Partial<HomeInfo["info"]> & { wifi_name?: string | null; wifi_password?: string | null } {
  const f = new Set(info.guest_fields);
  return {
    ...(f.has("wifi") ? { wifi_name: info.wifi_name, wifi_password: info.wifi_password } : {}),
    ...(f.has("contacts") ? { contacts: info.info.contacts } : {}),
    ...(f.has("vet") ? { vet: info.info.vet } : {}),
    ...(f.has("notes") ? { notes: info.info.notes } : {}),
  };
}
