// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { homeWith, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { HomeInfoCard } = await import("./HomeInfoCard");

beforeAll(startApp, 120_000);

const empty = { wifi_name: null, wifi_password: null, info: { accounts: [], contacts: [], vet: { name: "", phone: "" }, notes: "" }, guest_fields: ["wifi", "contacts", "vet"] as ("wifi" | "contacts" | "vet" | "notes")[] };
/** The "Saved" toast, whatever mark it carries. */
const saved_ = (t: { settings: { saved: string } }) => new RegExp(t.settings.saved);
const saved = (householdId: string) => sql<{ wifi_name: string; wifi_password: string }>(`select wifi_name, wifi_password from home_info where household_id = $1`, [householdId]);

describe("home info card, through the real save", () => {
  it("saves the Wi-Fi, then saves a changed password again (the reported bug)", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<HomeInfoCard initial={empty} owner />);
    await user.type(screen.getByLabelText(t.homeInfo.wifiName), "HomeNet");
    await user.type(screen.getByLabelText(t.homeInfo.wifiPassword), "first-pass");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await screen.findByText(saved_(t));
    expect(await saved(home.householdId)).toEqual([{ wifi_name: "HomeNet", wifi_password: "first-pass" }]);

    const password = screen.getByLabelText(t.homeInfo.wifiPassword);
    await user.clear(password);
    await user.type(password, "second-pass");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(async () => expect(await saved(home.householdId)).toEqual([{ wifi_name: "HomeNet", wifi_password: "second-pass" }]));
    expect(screen.getByRole("img", { name: t.homeInfo.wifiQr })).toBeInTheDocument();
  });

  it("contacts, vet, notes and what guests see all save", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<HomeInfoCard initial={empty} owner />);
    await user.click(screen.getAllByRole("button", { name: new RegExp(t.common.add) })[0]);
    await user.type(screen.getAllByLabelText(t.homeInfo.who)[0], "Mom");
    await user.type(screen.getAllByLabelText(t.homeInfo.phone)[0], "050-1234567");
    await user.type(screen.getByLabelText(t.homeInfo.vet), "Dr. Paws");
    await user.click(screen.getByRole("button", { name: t.homeInfo.fields.notes }));
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await screen.findByText(saved_(t));
    const [row] = await sql<{ info: { contacts: unknown[]; vet: { name: string } }; guest_fields: string[] }>(`select info, guest_fields from home_info where household_id = $1`, [home.householdId]);
    expect(row.info.contacts).toEqual([{ label: "Mom", phone: "050-1234567" }]);
    expect(row.info.vet.name).toBe("Dr. Paws");
    expect(row.guest_fields).toEqual(["wifi", "contacts", "vet", "notes"]);
  });

  it("a child sees the save refused, not a false 'Saved'", async () => {
    const home = await homeWith(["owner", "child"]);
    signIn(home.users.child);
    const { user, t } = renderUi(<HomeInfoCard initial={empty} owner={false} />);
    await user.type(screen.getByLabelText(t.homeInfo.wifiName), "Kid");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(() => expect(screen.queryByText(saved_(t))).not.toBeInTheDocument());
    expect(await saved(home.householdId)).toEqual([]);
    expect(screen.queryByText(t.homeInfo.showSecrets)).not.toBeInTheDocument();
  });

  it("the owner reveals, edits and saves the sealed secrets", async () => {
    await homeWith(["owner"]);
    const { user, t } = renderUi(<HomeInfoCard initial={empty} owner />);
    await user.click(screen.getByRole("button", { name: t.homeInfo.showSecrets }));
    const box = await screen.findByRole("textbox", { name: "" }, { timeout: 3000 }).catch(() => screen.getAllByRole("textbox").at(-1)!);
    await user.type(box, "Alarm 4321");
    await user.click(screen.getAllByRole("button", { name: t.common.save }).at(-1)!);
    await screen.findByText(saved_(t));
  });
});
