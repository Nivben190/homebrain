// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { app, homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import { addDays, todayKey } from "@/lib/engine/habits";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { DayCard } = await import("@/components/today/DayCard");
const { GoogleReconnect } = await import("@/components/today/GoogleReconnect");
const { default: IphonePage } = await import("@/app/(app)/me/iphone/page");
const { default: JoinPage } = await import("@/app/join/[token]/page");
const { default: CalendarPage } = await import("@/app/(app)/calendar/page");
const { default: MoneyPage } = await import("@/app/(app)/money/page");
const { default: BrainPage } = await import("@/app/(app)/brain/page");
const { default: WeeklyPage } = await import("@/app/(app)/weekly/page");

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.cookies.clear();
  router.replace.mockClear();
});

const TZ = "Asia/Jerusalem";
const today = () => todayKey(TZ);
const noHoly = { now: false, candles: null, havdalah: null, erevDay: null, holidays: [] };

describe("Today's day card", () => {
  it("weather, a hot-day walk window, and candles tomorrow", async () => {
    const t = today();
    const tomorrow = addDays(t, 1);
    const ui = await DayCard({
      weather: { day: t, max: 34, min: 24, rain: 40, code: 0 },
      advice: { hot: true, windows: ["<09:00", ">18:00"], peakFeels: 38 },
      holy: { ...noHoly, candles: `${tomorrow}T16:40:00+03:00`, havdalah: null, erevDay: tomorrow },
      today: t,
      locale: "en",
      place: "Tel Aviv",
    });
    const { t: d } = renderUi(ui!);
    expect(screen.getByText("34°")).toBeInTheDocument();
    expect(screen.getByText(/🌧️ 40%/)).toBeInTheDocument();
    expect(screen.getByText(d.daily.hotWalk.replace("{w}", "before 09:00 or after 18:00"))).toBeInTheDocument();
    expect(screen.getByText(`🕯️ ${d.daily.candles.replace("{t}", "16:40")} (${d.daily.tomorrow})`)).toBeInTheDocument();
    expect(screen.queryByText(/Tel Aviv/)).not.toBeInTheDocument();
  });

  it("during Shabbat: havdalah; a chag in a few days, in Hebrew for Hebrew speakers", async () => {
    const t = today();
    app.cookies.set("hb_locale", "he");
    const ui = await DayCard({ weather: null, advice: null, holy: { ...noHoly, now: true, havdalah: `${t}T17:45:00+03:00`, holidays: [{ day: addDays(t, 3), title: "Sukkot", hebrew: "סוכות" }] }, today: t, locale: "he", place: "" });
    const { t: d } = renderUi(ui!, "he");
    expect(screen.getByText(new RegExp(d.daily.havdalah.replace("{t}", "17:45")))).toBeInTheDocument();
    expect(screen.getByText(`🎉 ${d.daily.chagIn.replace("{name}", "סוכות").replace("{n}", "3")}`)).toBeInTheDocument();
  });

  it("nothing to say: no card; only weather: the place", async () => {
    expect(await DayCard({ weather: null, advice: null, holy: noHoly, today: today(), locale: "en", place: "Haifa" })).toBeNull();
    renderUi((await DayCard({ weather: { day: today(), max: 22, min: 15, rain: 0, code: 0 }, advice: { hot: false, windows: [], peakFeels: 22 }, holy: noHoly, today: today(), locale: "en", place: "Haifa" }))!);
    expect(screen.getByText("📍 Haifa")).toBeInTheDocument();
  });
});

describe("Google reconnect on Today (roadmap 1.9)", () => {
  it("each ended connection gets its own Reconnect, pointing at its own Google sign-in", async () => {
    const ui = await GoogleReconnect({
      expired: [
        { key: "gcal", what: "Google Calendar", href: "/api/google/calendar" },
        { key: "s1", what: "Gmail in 💳 Subs", href: "/api/google/connect?section=s1" },
      ],
    });
    const { t } = renderUi(ui!);
    const links = screen.getAllByRole("link", { name: t.subs.reconnect });
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/api/google/calendar", "/api/google/connect?section=s1"]);
    expect(screen.getByText(t.today.googleGone.replace("{what}", "Google Calendar"))).toBeInTheDocument();
  });

  it("all connected: nothing", async () => {
    expect(await GoogleReconnect({ expired: [] })).toBeNull();
  });
});

describe("iPhone setup page", () => {
  it("shows my keys and my Shortcuts' last runs, never my partner's", async () => {
    const home = await homeWith(["owner", "adult"]);
    await sql(`insert into hook_keys (user_id, purpose, key_hash, last_used_at) values ($1, 'spend', 'x', now()), ($2, 'capture', 'y', now())`, [home.users.owner, home.users.adult]);
    await sql(`insert into events (user_id, type) values ($1, 'wake')`, [home.users.adult]);
    const { t } = renderUi(await IphonePage());
    const card = (title: string) => screen.getByRole("heading", { name: new RegExp(title) }).closest("div")!;
    expect(within(card(t.iphone.spendTitle)).getByRole("button", { name: t.keys.rotate })).toBeInTheDocument();
    expect(within(card(t.iphone.siriTitle)).getByRole("button", { name: t.keys.create })).toBeInTheDocument();
    expect(within(card(t.iphone.wakeTitle)).getByText(t.iphone.never)).toBeInTheDocument();
    expect(screen.getByText(`${location.origin}/api/hooks/spend`.replace(location.origin, "http://localhost:3000"))).toBeInTheDocument();
  });

  it("warns while the old shared token is still in use", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set hook_token_used_at = now() - interval '1 day' where user_id = $1`, [home.users.owner]);
    const { t } = renderUi(await IphonePage());
    expect(screen.getByRole("alert")).toHaveTextContent(t.keys.legacy.split("{when}")[0].trim());
  });

  it("the alarm test button is in the person's language", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update profiles set locale = 'he' where user_id = $1`, [home.users.owner]);
    const { t } = renderUi(await IphonePage(), "he");
    expect(screen.getByRole("link", { name: new RegExp(t.iphone.alarmTest) })).toBeInTheDocument();
  });
});

describe("invite link page", () => {
  const invite = async (householdId: string, extra = "") => (await sql<{ token: string }>(`insert into household_invites (household_id) values ($1) returning token`, [householdId]))[0].token + extra;
  const open = async (token: string) => JoinPage({ params: Promise.resolve({ token }) });

  it("signed out: the home's name and who invited, with sign up and sign in", async () => {
    const home = await homeWith(["owner"]);
    await sql(`update households set name = 'Beach house' where id = $1`, [home.householdId]);
    const token = (await sql<{ token: string }>(`insert into household_invites (household_id, created_by) values ($1, $2) returning token`, [home.householdId, home.users.owner]))[0].token;
    signIn(null);
    const { t } = renderUi(await open(token));
    expect(screen.getByRole("heading")).toHaveTextContent(t.join.title.replace("{home}", "Beach house"));
    expect(screen.getByRole("link", { name: t.join.signUp })).toHaveAttribute("href", `/login?invite=${token}`);
    expect(screen.getByRole("link", { name: t.join.signIn })).toHaveAttribute("href", `/login?invite=${token}&mode=signin`);
  });

  it("used, expired or made up: one calm message", async () => {
    const home = await homeWith(["owner"]);
    signIn(null);
    const used = await invite(home.householdId);
    await sql(`update household_invites set used_at = now() where token = $1`, [used]);
    const expired = await invite(home.householdId);
    await sql(`update household_invites set expires_at = now() - interval '1 minute' where token = $1`, [expired]);
    for (const token of [used, expired, "not-a-token", "a".repeat(32)]) {
      const { t, unmount } = renderUi(await open(token));
      expect(screen.getByText(new RegExp(t.join.expired))).toBeInTheDocument();
      unmount();
    }
  });

  it("already in that home: straight to Today; signed in without a home: to onboarding", async () => {
    const home = await homeWith(["owner"]);
    const token = await invite(home.householdId);
    await expect(open(token)).rejects.toThrow("redirect /");
    const [{ id }] = await sql<{ id: string }>(`insert into auth.users (email) values ('new@test') returning id`);
    signIn(id);
    await expect(open(token)).rejects.toThrow(`redirect /onboarding?invite=${token}`);
  });

  it("from another home: move, with a named switch, and a refusal in plain words", async () => {
    const home = await homeWith(["owner"]);
    const token = await invite(home.householdId);
    await homeWith(["owner"]);
    const { user, t } = renderUi(await open(token));
    expect(screen.getByRole("switch", { name: t.join.bring })).toHaveAttribute("aria-checked", "true");
    await sql(`update household_invites set used_at = now() where token = $1`, [token]);
    await user.click(screen.getByRole("button", { name: t.join.move }));
    expect(await screen.findByText(t.join.expired)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("calendar page", () => {
  it("a week of dated things, colored by person, with my partner's private ones left out", async () => {
    const home = await homeWith(["owner", "adult"]);
    const [shared] = await sql<{ id: string }>(`insert into sections (household_id, title, icon) values ($1, 'Errands', '🧾') returning id`, [home.householdId]);
    const [theirs] = await sql<{ id: string }>(`insert into sections (household_id, title, owner_id) values ($1, 'Secret', $2) returning id`, [home.householdId, home.users.adult]);
    const at = new Date(Date.parse(`${addDays(today(), 2)}T07:30:00Z`)).toISOString();
    const local = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(at));
    await sql(`insert into items (section_id, title, due_at, assignee_id) values ($1, 'Dentist', $3, $4), ($2, 'Surprise party', $3, null)`, [shared.id, theirs.id, at, home.users.adult]);
    const { t } = renderUi(await CalendarPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole("region")).toHaveLength(7);
    const dentist = screen.getByText("Dentist").closest("li")!;
    expect(dentist).toHaveTextContent(local);
    expect(within(dentist).getByRole("link")).toHaveAttribute("href", `/sections/${shared.id}`);
    expect(screen.queryByText("Surprise party")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t.calendar.connectGoogle) })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.calendar.thisWeek })).not.toBeInTheDocument();
  });

  it("next week, and a back-to-this-week link", async () => {
    await homeWith(["owner"]);
    const { t } = renderUi(await CalendarPage({ searchParams: Promise.resolve({ w: "1" }) }));
    expect(screen.getByRole("link", { name: t.calendar.thisWeek })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: t.calendar.next })).toHaveAttribute("href", "/calendar?w=2");
    expect(screen.getAllByText(t.calendar.free).length).toBeGreaterThan(0);
  });
});

describe("money page", () => {
  it("the month, by category against budgets, and who owes whom", async () => {
    const home = await homeWith(["owner", "adult"]);
    const [spend] = await sql<{ id: string }>(`insert into sections (household_id, title, view) values ($1, 'Spending', 'spend') returning id`, [home.householdId]);
    const tx = (amount: number, category: string) => JSON.stringify({ _tx: { amount, currency: "₪", merchant: "Shop", at: new Date().toISOString(), category, refund: false, key: String(Math.random()) } });
    await sql(`insert into items (section_id, title, props, created_by) values ($1, 'Shop', $2, $3), ($1, 'Shop', $4, $5)`, [spend.id, tx(300, "groceries"), home.users.owner, tx(100, "groceries"), home.users.adult]);
    await sql(`insert into money_budgets (household_id, category, amount) values ($1, 'groceries', 350), ($1, 'eating', 500)`, [home.householdId]);
    const { t } = renderUi(await MoneyPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/400/, { selector: "p.text-4xl" })).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getByText(t.spend.categories.eating, { selector: "span.font-semibold" })).toBeInTheDocument();
    expect(screen.getByText(/owes/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: t.money.addBudget })).toBeInTheDocument();
  });

  it("a teen sees the month but no budget editing", async () => {
    await homeWith(["teen", "owner"]);
    const { t } = renderUi(await MoneyPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(t.money.empty)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: t.money.addBudget })).not.toBeInTheDocument();
  });
});

describe("Brain page", () => {
  it("my automations with their switches, or an empty note", async () => {
    const home = await homeWith(["owner"]);
    const { t, unmount } = renderUi(await BrainPage());
    expect(screen.getByText(t.brain.empty)).toBeInTheDocument();
    unmount();
    await sql(`insert into automations (household_id, owner_id, target_user_id, name, trigger, actions, enabled) values ($1, $2, $2, 'Bedtime', '{"type":"schedule","days":[0],"times":["22:00"]}', '[]', false)`, [home.householdId, home.users.owner]);
    renderUi(await BrainPage());
    expect(screen.getByRole("switch", { name: "Bedtime" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("weekly check-in page", () => {
  it("a quiet week says so, and links on to money", async () => {
    await homeWith(["owner"]);
    const { t } = renderUi(await WeeklyPage());
    expect(screen.getByText(t.weekly.quiet)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t.money.title) })).toHaveAttribute("href", "/money");
  });
});
