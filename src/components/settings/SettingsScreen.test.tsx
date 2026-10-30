// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { homeWith, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { SettingsScreen } = await import("./SettingsScreen");

beforeAll(startApp, 120_000);

const daily = { place: null, briefing: true, wrapup: true, wrapup_time: "21:30", quiet_shabbat: false, shabbat_shop: false, quiet_from: null, quiet_to: null, muted_sections: [], digest: false };
const brain = { ok: true, ageSeconds: 20, failedPhases: [], failedJobs: 0, expiredGoogle: 0 };

async function setup(role = "owner", inviteCode: string | null = "ABCD1234") {
  const home = await homeWith([role]);
  const ui = renderUi(
    <SettingsScreen
      profile={{ display_name: "Niv", emoji: "🦊", phone: "", timezone: "Asia/Jerusalem", wake_mode: "shortcut", wake_time: "07:00", email: "niv@test" }}
      household={{ name: "Our home", invite_code: inviteCode }}
      members={[{ id: home.users[role], name: "Niv", emoji: "🦊" }]}
      feedUrl="https://brain.test/api/cal/tok.ics"
      daily={daily}
      gmail={[]}
      gcal={null}
      brain={brain}
      partners={[]}
      roster={[{ id: home.users[role], name: "Niv", emoji: "🦊", role: role as "owner" }]}
      userId={home.users[role]}
      spaces={[]}
    />,
  );
  const profile = () => sql<Record<string, unknown>>(`select display_name, phone, timezone, wake_mode, wake_time::text, briefing, quiet_shabbat, quiet_from::text, quiet_to::text from profiles where user_id = $1`, [home.users[role]]);
  return { ...ui, home, profile };
}

describe("settings", () => {
  it("name and phone save when you leave the field", async () => {
    const { user, t, profile } = await setup();
    const name = screen.getByLabelText(t.onboarding.name);
    await user.clear(name);
    await user.type(name, "Niv B");
    await user.tab();
    await user.type(screen.getByLabelText(t.onboarding.phone), "0501234567");
    await user.tab();
    await waitFor(async () => expect((await profile())[0]).toMatchObject({ display_name: "Niv B", phone: "0501234567" }));
  });

  it("a fixed wake time saves with the mode", async () => {
    const { user, t, profile } = await setup();
    await user.click(screen.getByLabelText(t.settings.wake_fixed));
    await waitFor(async () => expect((await profile())[0]).toMatchObject({ wake_mode: "fixed" }));
  });

  it("the daily switches save instantly", async () => {
    const { user, t, profile } = await setup();
    await user.click(screen.getByRole("switch", { name: new RegExp(t.settings.briefing) }));
    await user.click(screen.getByRole("switch", { name: new RegExp(t.settings.quietShabbat) }));
    await waitFor(async () => expect((await profile())[0]).toMatchObject({ briefing: false, quiet_shabbat: true }));
  });

  it("quiet hours: each end has its own name and saves", async () => {
    const { user, t, profile } = await setup();
    await user.click(screen.getByRole("switch", { name: new RegExp(t.settings.quietHours) }));
    const until = await screen.findByLabelText(`${t.settings.quietHours} · ${t.common.until}`);
    expect(screen.getByLabelText(`${t.settings.quietHours} · ${t.common.from}`)).toHaveValue("22:00");
    fireEvent.change(until, { target: { value: "06:30" } });
    fireEvent.blur(until);
    await waitFor(async () => expect((await profile())[0]).toMatchObject({ quiet_from: "22:00:00", quiet_to: "06:30:00" }));
  });

  it("an empty name is refused with a message, not saved", async () => {
    const { user, t, profile } = await setup();
    await user.clear(screen.getByLabelText(t.onboarding.name));
    await user.tab();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect((await profile())[0].display_name).not.toBe("");
  });

  it("the invite code shows for owners and adults only", async () => {
    const { t, unmount } = await setup("owner");
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByText(t.settings.invite)).toBeInTheDocument();
    unmount();
    await setup("child", null);
    expect(screen.queryByText(t.settings.invite)).not.toBeInTheDocument();
  });
});
