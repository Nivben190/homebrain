// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { app, broadcast, homeWith, nextNavigationMock, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { AutomationDef } from "@/lib/engine/types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { AutomationToggle } = await import("@/components/brain/AutomationToggle");
const { AutomationEditor } = await import("@/components/brain/AutomationEditor");
const { RecipeGallery } = await import("@/components/brain/RecipeGallery");
const { TabBar } = await import("@/components/TabBar");
const { LanguageSwitch } = await import("@/components/LanguageSwitch");
const { RealtimeRefresh } = await import("@/components/RealtimeRefresh");
const { CalendarAddButton } = await import("@/components/CalendarAddButton");
const { BrainStatusCard } = await import("@/components/settings/BrainStatusCard");
const { NotesSyncHelp } = await import("@/components/settings/NotesSyncHelp");
const { RecheckButton } = await import("@/components/settings/RecheckButton");
const { saveAutomation } = await import("@/app/actions");

beforeAll(startApp, 120_000);
beforeEach(() => {
  router.refresh.mockClear();
  router.push.mockClear();
  vi.stubGlobal("confirm", () => true);
});

const def: AutomationDef = { name: "Morning", icon: "⚡", enabled: true, trigger: { type: "schedule", days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"] }, conditions: [], actions: [{ type: "push", title: "Hi", body: "Morning" }] };
const automation = async (owner: string) => (await saveAutomation(null, def, owner)).id!;
const row = (id: string) => sql<{ enabled: boolean }>(`select enabled from automations where id = $1`, [id]);

describe("Brain on/off", () => {
  it("is named after its automation, and switching it saves", async () => {
    const home = await homeWith(["owner"]);
    const id = await automation(home.users.owner);
    const { user } = renderUi(<AutomationToggle id={id} enabled name="Morning" />);
    const sw = screen.getByRole("switch", { name: "Morning" });
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    await waitFor(async () => expect(await row(id)).toEqual([{ enabled: false }]));
  });

  it("made a child since: it flips back and says so", async () => {
    const home = await homeWith(["adult", "owner"]);
    const id = await automation(home.users.adult);
    await sql(`update profiles set role = 'child' where user_id = $1`, [home.users.adult]);
    const { user, t } = renderUi(<AutomationToggle id={id} enabled name="Morning" />);
    await user.click(screen.getByRole("switch", { name: "Morning" }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Morning" })).toHaveAttribute("aria-checked", "true");
    expect(await row(id)).toEqual([{ enabled: true }]);
  });

  it("a refused delete stays put, says so, and leaves the waiting cards alone", async () => {
    const home = await homeWith(["adult", "owner"]);
    const id = await automation(home.users.adult);
    await sql(`insert into runs (automation_id, user_id, household_id, title) values ($1, $2, $3, 'Hi')`, [id, home.users.owner, home.householdId]);
    await sql(`update profiles set role = 'child' where user_id = $1`, [home.users.adult]);
    const { user, t } = renderUi(<AutomationEditor id={id} initial={def} initialTarget={home.users.adult} userId={home.users.adult} members={[]} sections={[]} />);
    // The editor's own delete, after each step's.
    await user.click(screen.getAllByRole("button", { name: t.common.delete }).at(-1)!);
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(await row(id)).toHaveLength(1);
    expect(await sql(`select 1 from runs where automation_id = $1 and acknowledged_at is null`, [id])).toHaveLength(1);
  });
});

describe("Brain recipes", () => {
  it("one tap adds a routine; one that needs a missing space says what to add", async () => {
    const home = await homeWith(["owner", "adult"]);
    const { user, t } = renderUi(<RecipeGallery />);
    const card = (id: keyof typeof t.brain.recipe) => screen.getByText(t.brain.recipe[id]).parentElement!;
    const { getByRole } = await import("@testing-library/react").then((m) => m.within(card("love_note")));
    await user.click(getByRole("button", { name: t.brain.recipeAdd }));
    expect(await screen.findAllByRole("button", { name: t.brain.recipeAdded })).toHaveLength(1);
    expect(await sql(`select 1 from automations where owner_id = $1`, [home.users.owner])).toHaveLength(1);
    const supermarket = await import("@testing-library/react").then((m) => m.within(card("supermarket")));
    await user.click(supermarket.getByRole("button", { name: t.brain.recipeAdd }));
    expect(await screen.findByText(t.brain.recipeMissing)).toBeInTheDocument();
  });

  it("a refusal is said in plain words", async () => {
    const home = await homeWith(["owner", "child"]);
    signIn(home.users.child);
    const { user, t } = renderUi(<RecipeGallery />);
    const love = (await import("@testing-library/react")).within(screen.getByText(t.brain.recipe.love_note).parentElement!);
    await user.click(love.getByRole("button", { name: t.brain.recipeAdd }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
  });
});

describe("app shell", () => {
  it("the tab bar marks where you are", () => {
    const at = vi.spyOn(nextNavigationMock, "usePathname").mockReturnValue("/sections/abc");
    try {
      const { t } = renderUi(<TabBar spaces={[]} members={[]} timeZone="Asia/Jerusalem" />);
      expect(screen.getByRole("link", { name: t.nav.spaces })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: t.nav.today })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: t.nav.brain })).toHaveAttribute("href", "/brain");
    } finally {
      at.mockRestore();
    }
  });

  it("switching language saves it for this person and on this phone", async () => {
    const home = await homeWith(["owner"]);
    const { user } = renderUi(<LanguageSwitch />);
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "עברית" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(app.cookies.get("hb_locale")).toBe("he");
    expect(await sql(`select locale from profiles where user_id = $1`, [home.users.owner])).toEqual([{ locale: "he" }]);
  });

  it("a change from the other phone refreshes the page, once for a burst", async () => {
    await homeWith(["owner"]);
    const { unmount } = renderUi(<RealtimeRefresh tables={["sections", "items"]} />);
    act(() => {
      broadcast("items", "INSERT", { new: {} });
      broadcast("sections", "UPDATE", { new: {} });
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    unmount();
    expect(app.listeners).toEqual([]);
  });

  it("+ on a calendar day opens quick add for that day", async () => {
    const heard = vi.fn();
    window.addEventListener("quickadd:open", (e) => heard((e as CustomEvent).detail));
    const { user, t } = renderUi(<CalendarAddButton day="2026-11-03" />);
    await user.click(screen.getByRole("button", { name: t.calendar.add }));
    expect(heard).toHaveBeenCalledWith({ day: "2026-11-03" });
  });
});

describe("settings cards", () => {
  it("Brain status: running, stopped, never, and what failed", () => {
    const show = (status: Parameters<typeof BrainStatusCard>[0]["status"]) => {
      const ui = renderUi(<BrainStatusCard status={status} />);
      return { ...ui, s: ui.t.settings };
    };
    let { s, unmount } = show({ ok: true, ageSeconds: 30, failedPhases: [], failedJobs: 0, expiredGoogle: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(s.brainRunning.replace("{ago}", s.justNow));
    expect(screen.getByText(s.noFailures)).toBeInTheDocument();
    unmount();
    ({ s, unmount } = show({ ok: false, ageSeconds: 7200, failedPhases: ["daily"], failedJobs: 3, expiredGoogle: 1 }));
    expect(screen.getByRole("status")).toHaveTextContent(s.brainStopped.replace("{ago}", s.hoursAgo.replace("{n}", "2")));
    expect(screen.getByText(s.phaseFailing.replace("{phases}", "daily"))).toBeInTheDocument();
    expect(screen.getByText(s.failedJobs.replace("{n}", "3"))).toBeInTheDocument();
    expect(screen.getByText(s.googleExpired.replace("{n}", "1"))).toBeInTheDocument();
    unmount();
    ({ s } = show({ ok: false, ageSeconds: null, failedPhases: [], failedJobs: 0, expiredGoogle: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent(s.brainNever);
  });

  it("notes sync help: the steps, the Shortcut's name and address to copy, and its key", async () => {
    await homeWith(["owner"]);
    const { user, t } = renderUi(<NotesSyncHelp defaultOpen keyInfo={{ exists: false, lastUsedAt: null }} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(t.notesSync.steps.length);
    await user.click(screen.getByText(`${window.location.origin}/api/hooks/notes`));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/api/hooks/notes`);
    expect(await screen.findByText(t.common.copied)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.keys.create })).toBeInTheDocument();
  });

  it("re-check reloads the page", async () => {
    const { user, t } = renderUi(<RecheckButton />);
    await user.click(screen.getByRole("button", { name: t.iphone.recheck }));
    expect(router.refresh).toHaveBeenCalled();
  });
});
