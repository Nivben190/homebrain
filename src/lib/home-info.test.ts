import { describe, expect, it } from "vitest";
import { guestView, readHomeInfo, wifiQr } from "./home-info";

describe("home info", () => {
  it("escapes the Wi-Fi QR payload", () => {
    expect(wifiQr("Cohen;Home", 'p:a"ss')).toBe('WIFI:T:WPA;S:Cohen\\;Home;P:p\\:a\\"ss;;');
    expect(wifiQr("Open", null)).toBe("WIFI:T:nopass;S:Open;;");
  });

  it("shows guests only the chosen fields and never accounts", () => {
    const info = readHomeInfo({
      wifi_name: "Home",
      wifi_password: "pw",
      info: { accounts: [{ label: "Electric", value: "123" }], contacts: [{ label: "Mom", phone: "050" }], vet: { name: "Dr", phone: "03" }, notes: "Plants on Fri" },
      guest_fields: ["wifi", "vet"],
    });
    const g = guestView(info);
    expect(g).toEqual({ wifi_name: "Home", wifi_password: "pw", vet: { name: "Dr", phone: "03" } });
    expect(JSON.stringify(g)).not.toContain("Electric");
  });

  it("fills gaps in a partial row", () => expect(readHomeInfo(null).info.contacts).toEqual([]));
});
