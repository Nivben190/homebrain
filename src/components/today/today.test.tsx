// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { app, broadcast, homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { Item, Run } from "@/lib/db-types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { WrapupScreen } = await import("./WrapupScreen");
const { AlarmSheet } = await import("./QuickAlarm");
const { RunCard } = await import("./RunCard");
const { ActivityStrip } = await import("./ActivityStrip");
const { AwakeButton } = await import("./AwakeButton");
const { todayKey } = await import("@/lib/engine/habits");
const { TodayPractice } = await import("./TodayPractice");
const { OfflineSync } = await import("@/components/OfflineSync");
const { PushPrompt } = await import("./PushPrompt");
const { QuickActions } = await import("./QuickActions");
const { OnThisDay } = await import("./OnThisDay");
const { AppBadge } = await import("./AppBadge");
const { idbQueue } = await import("@/lib/offline-queue");

const TZ = "Asia/Jerusalem";

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  router.refresh.mockClear();
});

describe("evening wrap-up", () => {
  async function day() {
    const home = await homeWith(["owner", "adult"]);
    const [{ id: habits }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Habits', 'tracker') returning id`, [home.householdId]);
    const [{ id: lists }] = await sql<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Errands') returning id`, [home.householdId]);
    const item = async (section: string, title: string, due: string | null = null) => (await sql<{ id: string }>(`insert into items (section_id, title, due_at) values ($1, $2, $3) returning id`, [section, title, due]))[0].id;
    const due = new Date().toISOString();
    const ids = {
      run: await item(habits, "Run"),
      read: await item(habits, "Read"),
      bank: await item(lists, "Call the bank", due),
      post: await item(lists, "Post office", due),
      ask: (await sql<{ id: string }>(`insert into requests (household_id, from_user, to_user, text) values ($1, $2, $3, 'Buy bread') returning id`, [home.householdId, home.users.adult, home.users.owner]))[0].id,
    };
    const ui = renderUi(
      <WrapupScreen
        score={{ done: 1, total: 6, left: 5 }}
        sessions={[{ id: ids.run, title: "Run", icon: "🏃", done: false }, { id: ids.read, title: "Read", icon: "📖", done: false }]}
        due={[{ id: ids.bank, title: "Call the bank", done: false }, { id: ids.post, title: "Post office", done: false }, { id: crypto.randomUUID(), title: "Watered plants", icon: "🪴", done: true }]}
        requests={[{ id: ids.ask, title: "Buy bread", done: false }]}
        tomorrowFirst={{ title: "Gym", icon: "🏋️", time: "07:15" }}
        timeZone={TZ}
      />,
    );
    return { ...ui, home, ids, due };
  }
  const card = (title: string) => within(screen.getByText(new RegExp(title)).closest(".glass") as HTMLElement);
  const gone = (title: string) => waitFor(() => expect(screen.queryByText(new RegExp(title))).not.toBeInTheDocument(), { timeout: 3000 });

  it("done, skip, tomorrow and a request: each saved, each leaves the list", async () => {
    const { user, t, ids, due } = await day();
    expect(screen.getByText(t.daily.wrapupBody.replace("{done}", "1").replace("{total}", "6").replace("{left}", "5"))).toBeInTheDocument();
    await user.click(card("Run").getByRole("button", { name: new RegExp(t.daily.done) }));
    await user.click(card("Read").getByRole("button", { name: new RegExp(t.daily.skip) }));
    await user.click(card("Call the bank").getByRole("button", { name: t.daily.moveTomorrow }));
    await user.click(card("Post office").getByRole("button", { name: new RegExp(t.daily.done) }));
    await user.click(card("Buy bread").getByRole("button", { name: new RegExp(t.daily.done) }));
    await gone("Buy bread");
    const today = todayKey(TZ);
    await waitFor(async () => {
      expect(await sql(`select item_id, day::text, status from checkins where item_id = any($1) order by status`, [[ids.run, ids.read]])).toEqual([
        { item_id: ids.run, day: today, status: "done" },
        { item_id: ids.read, day: today, status: "skipped" },
      ]);
      const [bank] = await sql<{ due_at: Date }>(`select due_at from items where id = $1`, [ids.bank]);
      expect(new Date(bank.due_at).getTime() - Date.parse(due)).toBe(86_400_000);
      expect(await sql(`select done from items where id = $1`, [ids.post])).toEqual([{ done: true }]);
      expect(await sql(`select status from requests where id = $1`, [ids.ask])).toEqual([{ status: "done" }]);
    });
    expect(screen.getByText(t.daily.wrapupAllDone)).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("not saved (no signal, or no longer there): it stays on the list and says why", async () => {
    const { user, t, ids } = await day();
    app.offline = true;
    await user.click(card("Run").getByRole("button", { name: new RegExp(t.daily.done) }));
    expect(await screen.findByText(t.failures.offline)).toBeInTheDocument();
    expect(screen.getByText(/Run/)).toBeInTheDocument();
    app.offline = false;
    await sql(`delete from requests where id = $1`, [ids.ask]);
    await user.click(card("Buy bread").getByRole("button", { name: new RegExp(t.daily.done) }));
    expect(await screen.findByText(t.failures.generic)).toBeInTheDocument();
    expect(screen.getByText(/Buy bread/)).toBeInTheDocument();
  });

  it("one that became someone else's private item can't be ticked; it says so", async () => {
    const { user, t, ids, home } = await day();
    await sql(`update sections set owner_id = $1 where id = (select section_id from items where id = $2)`, [home.users.adult, ids.bank]);
    await user.click(card("Call the bank").getByRole("button", { name: new RegExp(t.daily.done) }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(screen.getByText(/Call the bank/)).toBeInTheDocument();
  });

  it("suggests tomorrow's alarm 45 minutes ahead, never before 05:00", async () => {
    const { t, unmount } = await day();
    expect(screen.getByRole("link", { name: new RegExp(t.daily.setAlarm.replace("{time}", "06:30")) })).toBeInTheDocument();
    unmount();
    renderUi(<WrapupScreen score={{ done: 0, total: 0, left: 0 }} sessions={[]} due={[]} requests={[]} tomorrowFirst={{ title: "Flight", icon: "✈️", time: "05:10" }} timeZone={TZ} />);
    expect(screen.getByRole("link", { name: new RegExp(t.daily.setAlarm.replace("{time}", "05:00")) })).toBeInTheDocument();
    expect(screen.getByText(t.daily.wrapupEmpty)).toBeInTheDocument();
  });
});

describe("alarm sheet", () => {
  it("remembers the last time and name; presets and 'in N hours' pick the time", async () => {
    localStorage.setItem("hb:last-alarm", "06:30");
    localStorage.setItem("hb:last-alarm-label", "Gym");
    const onClose = vi.fn();
    const { user, t } = renderUi(<AlarmSheet open onClose={onClose} />);
    expect(screen.getByLabelText(t.actions.time)).toHaveValue("06:30");
    expect(screen.getByLabelText(t.alarm.name)).toHaveValue("Gym");
    await user.click(screen.getByRole("button", { name: "08:00" }));
    expect(screen.getByRole("button", { name: "08:00" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: `+1 ${t.alarm.hours}` }));
    const later = (screen.getByLabelText(t.actions.time) as HTMLInputElement).value;
    expect(later).toMatch(/^\d\d:\d[05]$/);
    await user.click(screen.getByRole("button", { name: new RegExp(t.alarm.set) }));
    expect(localStorage.getItem("hb:last-alarm")).toBe(later);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("automation cards on Today", () => {
  async function run(rendered: unknown[]) {
    const home = await homeWith(["owner"]);
    const [row] = await sql<Run>(`insert into runs (user_id, household_id, title, body, icon, rendered) values ($1, $2, 'Water plants', 'The balcony ones', '🪴', $3) returning *`, [home.users.owner, home.householdId, JSON.stringify(rendered)]);
    return { home, row: { ...row, fired_at: String(row.fired_at) } as Run };
  }

  it("shows notes and links; 'done' is saved and the card leaves", async () => {
    const { row } = await run([{ kind: "note", icon: "💧", text: "Half a can each" }, { kind: "link", icon: "🛒", label: "List", href: "/sections/x" }, { kind: "done", label: "Watered" }]);
    const { user, t } = renderUi(<RunCard run={row} />);
    expect(screen.getByText("Half a can each")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /List/ })).toHaveAttribute("href", "/sections/x");
    await user.click(screen.getByRole("button", { name: /Watered/ }));
    expect(screen.getByRole("button", { name: new RegExp(t.run.completed) })).toBeInTheDocument();
    await waitFor(async () => expect((await sql<{ done: boolean }>(`select done_at is not null as done from runs where id = $1`, [row.id]))[0].done).toBe(true));
    await waitFor(() => expect(screen.queryByText("Water plants")).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it("dismissing hides it and marks it seen", async () => {
    const { row } = await run([]);
    const { user, t } = renderUi(<RunCard run={row} />);
    await user.click(screen.getByRole("button", { name: t.common.dismiss }));
    expect(screen.queryByText("Water plants")).not.toBeInTheDocument();
    await waitFor(async () => expect((await sql<{ seen: boolean }>(`select acknowledged_at is not null as seen from runs where id = $1`, [row.id]))[0].seen).toBe(true));
  });
});

describe("what's happening at home", () => {
  it("the partner's last few things, live; 'at the store' while it's fresh; the day's list on tap", async () => {
    const home = await homeWith(["owner", "adult"]);
    const members = [
      { id: home.users.owner, name: "Niv", emoji: "🦊" },
      { id: home.users.adult, name: "Dana", emoji: "🐻" },
    ];
    const now = new Date().toISOString();
    const initial = [
      { id: 1, actor: home.users.adult, kind: "ticked", title: "Milk", at: now },
      { id: 2, actor: home.users.owner, kind: "added", title: "Mine", at: now },
    ];
    const { user, t } = renderUi(<ActivityStrip initial={initial} userId={home.users.owner} members={members} />);
    expect(screen.getByText("🐻 Dana ticked Milk")).toBeInTheDocument();
    expect(screen.queryByText(/Mine/)).not.toBeInTheDocument();
    act(() => broadcast("activity", "INSERT", { new: { id: 3, actor: home.users.adult, kind: "arrive_store", title: null, at: new Date().toISOString() } }));
    expect(await screen.findByText(new RegExp(t.activity.atStore.replace("{name}", "🐻 Dana")))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Dana/ }));
    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText(/Niv added Mine/)).toBeInTheDocument();
    expect(sheet.getByText(/Dana reached the store/)).toBeInTheDocument();
  });

  it("nothing from anyone else: nothing shown", async () => {
    const home = await homeWith(["owner"]);
    renderUi(<ActivityStrip initial={[{ id: 1, actor: home.users.owner, kind: "added", title: "x", at: new Date().toISOString() }]} userId={home.users.owner} members={[]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("I'm awake", () => {
  it("the button starts the morning and runs the wake automations", async () => {
    const home = await homeWith(["owner"]);
    await sql(`insert into automations (household_id, owner_id, target_user_id, name, trigger, actions) values ($1, $2, $2, 'Morning', '{"type":"event","event":"wake"}', '[{"type":"push","title":"Good morning","body":"Hi"}]')`, [home.householdId, home.users.owner]);
    app.pushes = [];
    const { user, t } = renderUi(<AwakeButton firstOpen={false} />);
    await user.click(screen.getByRole("button", { name: new RegExp(t.today.awake) }));
    expect(await screen.findByText(t.today.awakeDone)).toBeInTheDocument();
    await waitFor(() => expect(app.pushes.map((p) => p.payload.title)).toContainEqual(expect.stringContaining("Good morning")));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("first open of the day fires it by itself only for people who chose that", async () => {
    const home = await homeWith(["owner"]);
    const { t, unmount } = renderUi(<AwakeButton firstOpen />);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByText(t.today.awakeDone)).not.toBeInTheDocument();
    unmount();
    await sql(`update profiles set wake_mode = 'first_open' where user_id = $1`, [home.users.owner]);
    await sql(`insert into automations (household_id, owner_id, target_user_id, name, trigger, actions) values ($1, $2, $2, 'Morning', '{"type":"event","event":"wake"}', '[{"type":"push","title":"Up","body":"Hi"}]')`, [home.householdId, home.users.owner]);
    renderUi(<AwakeButton firstOpen />);
    expect(await screen.findByText(t.today.awakeDone)).toBeInTheDocument();
    signIn(null);
  });
});


describe("today's habits", () => {
  async function practice() {
    const home = await homeWith(["owner", "adult"]);
    const [{ id: s }] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Habits', 'tracker') returning id`, [home.householdId]);
    const items = await sql<Item>(`insert into items (section_id, title) values ($1, 'Stretch'), ($1, 'Floss') returning *`, [s]);
    const members = [{ id: home.users.owner, name: "Niv", emoji: "🦊" }];
    const ui = renderUi(<TodayPractice items={items.map((i) => ({ ...i, created_at: String(i.created_at) }))} initialCheckins={[]} members={members} userId={home.users.owner} timeZone={TZ} />);
    return { ...ui, home, items };
  }
  const checkins = (ids: string[]) => sql<{ title: string; status: string }>(`select i.title, c.status from checkins c join items i on i.id = c.item_id where c.item_id = any($1) order by i.title`, [ids]);
  const doneToday = (t: { tracker: { doneTodayCount: string } }, n: number) => (name: string) => name.includes(t.tracker.doneTodayCount.replace("{n}", String(n)));

  it("a check-in settles into 'done today', and undo brings it back", async () => {
    const { user, t, items } = await practice();
    await user.click(screen.getAllByRole("button", { name: t.tracker.checkIn })[0]);
    await waitFor(async () => expect(await checkins(items.map((i) => i.id))).toEqual([{ title: "Stretch", status: "done" }]));
    await user.click(await screen.findByRole("button", { name: doneToday(t, 1) }, { timeout: 3000 }));
    await user.click(await screen.findByRole("button", { name: t.tracker.undo }));
    await waitFor(async () => expect(await checkins(items.map((i) => i.id))).toEqual([]));
  });

  it("the partner's check-in arrives live", async () => {
    const { t, items, home } = await practice();
    const row = { id: crypto.randomUUID(), item_id: items[1].id, user_id: home.users.adult, day: todayKey(TZ), status: "done", note: null, created_at: new Date().toISOString() };
    act(() => broadcast("checkins", "INSERT", { new: row }));
    expect(await screen.findByRole("button", { name: doneToday(t, 1) })).toBeInTheDocument();
    act(() => broadcast("checkins", "DELETE", { old: row }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.tracker.checkIn })).toHaveLength(2), { timeout: 3000 });
  });

  it("with no signal it waits in the queue, and goes up once back online", async () => {
    const { user, t, items } = await practice();
    app.offline = true;
    await user.click(screen.getAllByRole("button", { name: t.tracker.checkIn })[0]);
    await waitFor(async () => expect(await idbQueue.all()).toHaveLength(1));
    expect(await checkins(items.map((i) => i.id))).toEqual([]);
    app.offline = false;
    renderUi(<OfflineSync />);
    await waitFor(async () => expect(await checkins(items.map((i) => i.id))).toEqual([{ title: "Stretch", status: "done" }]));
    expect(await idbQueue.all()).toEqual([]);
  });

  it("refused (it was deleted meanwhile): undone, and said in plain words", async () => {
    const { user, t, items } = await practice();
    await sql(`delete from items where id = $1`, [items[0].id]);
    await user.click(screen.getAllByRole("button", { name: t.tracker.checkIn })[0]);
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.tracker.checkIn })).toHaveLength(2), { timeout: 3000 });
  });
});

describe("offline banner", () => {
  it("says it's offline, and how many changes wait", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await idbQueue.add({ table: "items", action: "update", values: { done: true }, match: { id: crypto.randomUUID() } });
      const { t } = renderUi(<OfflineSync />);
      expect(await screen.findByText(t.offline.waiting.replace("{n}", "1"))).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      for (const { key } of await idbQueue.all()) await idbQueue.remove(key);
    }
  });
});

describe("notifications", () => {
  function phone({ permission = "default", grant = "granted", ios = false } = {}) {
    let current: unknown = null;
    const sub = { toJSON: () => ({ endpoint: `https://push.test/${crypto.randomUUID()}`, keys: { p256dh: "key", auth: "auth" } }) };
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = sub) } };
    vi.stubGlobal("Notification", { permission, requestPermission: async () => grant });
    vi.stubGlobal("PushManager", function PushManager() {});
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { ready: Promise.resolve(reg), getRegistration: async () => reg } });
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => (ios ? "Mozilla/5.0 (iPhone)" : "Mozilla/5.0 (X11)") });
    window.matchMedia = (() => ({ matches: false })) as never;
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BElz-dGVzdC1rZXk";
  }

  it("asks once, and saves this phone for pushes", async () => {
    const home = await homeWith(["owner"]);
    phone();
    const { user, t } = renderUi(<PushPrompt />);
    await user.click(await screen.findByRole("button", { name: t.settings.enable }));
    await waitFor(() => expect(screen.queryByText(t.today.enablePush)).not.toBeInTheDocument(), { timeout: 3000 });
    expect(await sql(`select device_label from push_subscriptions where user_id = $1`, [home.users.owner])).toHaveLength(1);
  });

  it("on an iPhone outside the Home Screen it explains how to install first", async () => {
    await homeWith(["owner"]);
    phone({ ios: true });
    const { t } = renderUi(<PushPrompt />);
    expect(await screen.findByText(t.today.installHint)).toBeInTheDocument();
  });

  it("said no, or already said no before: nothing to show", async () => {
    await homeWith(["owner"]);
    phone({ permission: "denied" });
    const { t, unmount } = renderUi(<PushPrompt />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(t.today.enablePush)).not.toBeInTheDocument();
    unmount();
    phone({ grant: "denied" });
    const again = renderUi(<PushPrompt />);
    await again.user.click(await screen.findByRole("button", { name: t.settings.enable }));
    await waitFor(() => expect(screen.queryByText(t.today.enablePush)).not.toBeInTheDocument(), { timeout: 3000 });
  });

  it("a family tablet: the next person to turn on pushes gets them", async () => {
    const home = await homeWith(["owner", "adult"]);
    const sub = { endpoint: "https://push.test/shared-tablet", keys: { p256dh: "key", auth: "auth" } };
    const { savePushSubscription } = await import("@/app/actions");
    expect(await savePushSubscription(sub, "iPad")).toEqual({ ok: true });
    signIn(home.users.adult);
    expect(await savePushSubscription(sub, "iPad")).toEqual({ ok: true });
    expect(await sql(`select user_id from push_subscriptions where endpoint = $1`, [sub.endpoint])).toEqual([{ user_id: home.users.adult }]);
  });
});

describe("Today tiles", () => {
  it("alarm, ask (named when there's one person), and the dog with food days left", async () => {
    await homeWith(["owner"]);
    const { user, t } = renderUi(<QuickActions others={[{ id: "u2", name: "Dana", emoji: "🐻" }]} pets={[{ id: "p1", name: "Rex", emoji: "🐕", daysLeft: 3 }]} />);
    expect(screen.getByRole("link", { name: /Rex/ })).toHaveAttribute("href", "/pets/p1");
    expect(screen.getByText(new RegExp(t.pets.daysLeft.replace("{n}", "3")))).toHaveClass("text-danger");
    await user.click(screen.getByRole("button", { name: t.ask.button.replace("{name}", "Dana") }));
    expect(await screen.findByPlaceholderText(t.ask.placeholder)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.alarm.title }));
    expect(await screen.findByLabelText(t.alarm.name)).toBeInTheDocument();
  });

  it("no one else and no pet: no ask tile, and 'add a pet'", async () => {
    const { t } = renderUi(<QuickActions others={[]} pets={[]} />);
    expect(screen.queryByRole("button", { name: t.ask.buttonAny })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t.pets.add) })).toHaveAttribute("href", "/pets/new");
  });

  it("on this day: a year ago and years ago, linking to the space", async () => {
    const { t } = renderUi(
      <OnThisDay
        memories={[
          { id: "m1", sectionId: "s1", title: "Beach", years: 1, icon: "📸", color: "sky", cover: null },
          { id: "m2", sectionId: "s1", title: "Wedding", years: 3, icon: "📸", color: "sky", cover: null },
        ]}
      />,
    );
    expect(screen.getByText(t.memories.yearAgo)).toBeInTheDocument();
    expect(screen.getByText(t.memories.yearsAgo.replace("{n}", "3"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Beach/ })).toHaveAttribute("href", "/sections/s1");
  });

  it("the Home Screen badge follows the waiting count", async () => {
    const set = vi.fn(async () => {});
    const clear = vi.fn(async () => {});
    Object.assign(navigator, { setAppBadge: set, clearAppBadge: clear });
    const { rerender } = renderUi(<AppBadge count={2} />);
    rerender(<AppBadge count={0} />);
    expect(set).toHaveBeenCalledWith(2);
    expect(clear).toHaveBeenCalled();
  });
});
