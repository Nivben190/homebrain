// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { Item, Section } from "@/lib/db-types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));
// jsdom has no canvas: photos go up as they are.
vi.mock("@/lib/photos", async (actual) => ({ ...(await actual<typeof import("@/lib/photos")>()), resizeImage: async (f: Blob) => f }));

const { SectionScreen } = await import("./SectionScreen");
const { todayKey } = await import("@/lib/engine/habits");

const TZ = "Asia/Jerusalem";

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  app.failNext = false;
  vi.stubGlobal("confirm", () => true);
  URL.createObjectURL = () => `blob:${crypto.randomUUID()}`;
  URL.revokeObjectURL = () => {};
});

/** A space of the given view with these items, opened as its owner. */
async function open(view: string, items: { title: string; props?: Record<string, unknown> }[] = [], extra: Record<string, unknown> = {}, as = "owner") {
  const home = await homeWith(["owner", as === "owner" ? "adult" : as]);
  signIn(home.users[as]);
  const [section] = await sql<Section>(`insert into sections (household_id, title, view) values ($1, 'Space', $2) returning *`, [home.householdId, view]);
  for (const [n, it] of items.entries()) await sql(`insert into items (section_id, title, position, props) values ($1, $2, $3, $4)`, [section.id, it.title, n, JSON.stringify(it.props ?? {})]);
  const rows = await sql<Item>(`select * from items where section_id = $1 order by position`, [section.id]);
  const members = [
    { id: home.users.owner, name: "Owner", emoji: "🦊" },
    { id: home.users.adult, name: "Adult", emoji: "🐻" },
  ];
  const ui = renderUi(
    <SectionScreen
      initialSection={section}
      initialItems={rows.map((r) => ({ ...r, created_at: String(r.created_at) }))}
      initialCheckins={[]}
      userId={home.users[as]}
      members={members}
      timeZone={TZ}
      launch={{ notes: "l1.notes", checkin: "l1.checkin" }}
      {...extra}
    />,
  );
  return { ...ui, home, section, rows };
}
const props = async (sectionId: string) => (await sql<{ title: string; props: Record<string, unknown> }>(`select title, props from items where section_id = $1 order by position`, [sectionId]));

describe("habit tracker", () => {
  const daily = { _habit: { repeat: { kind: "interval", every: 1, start: "2026-01-01" }, time: "18:00", nudge: true, outdoor: false } };

  it("a new habit opens its schedule; weekdays and a time save with the next reminder", async () => {
    const { user, t, section } = await open("tracker");
    await user.type(screen.getByPlaceholderText(t.sections.addItem), "Run{Enter}");
    await user.click(await screen.findByRole("button", { name: t.tracker.weekly }));
    await user.click(screen.getByRole("button", { name: t.weekdaysShort[1] }));
    await user.click(screen.getByRole("button", { name: t.common.saveChanges }));
    await waitFor(async () => {
      const [row] = await sql<{ props: { _habit: { repeat: { kind: string; days: number[] } } }; remind_at: unknown }>(`select props, remind_at from items where section_id = $1`, [section.id]);
      expect(row.props._habit.repeat).toEqual({ kind: "weekly", days: [0, 2, 3, 4] });
      expect(row.remind_at).not.toBeNull();
    });
  });

  it("checks in from the card, celebrates, and undo removes it", async () => {
    const { user, t, rows } = await open("tracker", [{ title: "Stretch", props: daily }]);
    await user.click(screen.getByRole("button", { name: t.tracker.checkIn }));
    const today = todayKey(TZ);
    await waitFor(async () => expect(await sql(`select day::text, status from checkins where item_id = $1`, [rows[0].id])).toEqual([{ day: today, status: "done" }]));
    expect(screen.getByText(new RegExp(t.tracker.doneToday))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.tracker.undo }));
    await waitFor(async () => expect(await sql(`select 1 from checkins where item_id = $1`, [rows[0].id])).toEqual([]));
  });

  it("skipping today from the sheet keeps the streak and is saved as skipped", async () => {
    const { user, t, rows } = await open("tracker", [{ title: "Read", props: daily }]);
    await user.click(screen.getByText("Read"));
    await user.click(await screen.findByRole("button", { name: t.tracker.skip }));
    await waitFor(async () => expect(await sql(`select status from checkins where item_id = $1`, [rows[0].id])).toEqual([{ status: "skipped" }]));
  });

  it("a habit with no schedule says so and can still be ticked", async () => {
    const { t } = await open("tracker", [{ title: "Floss" }]);
    expect(screen.getByText(t.tracker.noSchedule)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.tracker.checkIn })).toBeInTheDocument();
  });
});

describe("spin the wheel", () => {
  const wheel = (labels: string[], extra: Record<string, unknown> = {}) => ({ _wheel: { options: labels.map((label) => ({ label })), ...extra } });

  it("a new wheel opens its options; saved, it spins to a winner and remembers 'we did it'", async () => {
    const { user, t, section } = await open("wheel");
    await user.type(screen.getByPlaceholderText(t.wheel.addPlaceholder), "Dinner{Enter}");
    await user.type(await screen.findByPlaceholderText(`${t.wheel.option} 1`), "Pizza");
    await user.type(screen.getByPlaceholderText(`${t.wheel.option} 2`), "Sushi");
    await user.click(screen.getByRole("button", { name: t.wheel.done }));
    await waitFor(async () => expect((await props(section.id))[0].props).toEqual(wheel(["Pizza", "Sushi"])));
    await user.click(screen.getByRole("button", { name: new RegExp(t.wheel.spin) }));
    const done = await screen.findByRole("button", { name: t.wheel.weDidIt }, { timeout: 8000 });
    await user.click(done);
    await waitFor(async () => {
      const spec = (await props(section.id))[0].props._wheel as { last: string; options: { label: string; doneDay?: string }[] };
      expect(["Pizza", "Sushi"]).toContain(spec.last);
      expect(spec.options.find((o) => o.label === spec.last)!.doneDay).toBe(todayKey(TZ));
    });
  }, 30_000);

  it("fewer than two options can't spin; deleting needs a second tap", async () => {
    const { user, t, section } = await open("wheel", [{ title: "Movies", props: wheel(["Up"]) }]);
    expect(screen.getByText(t.wheel.needTwo)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(t.wheel.spin) })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: t.wheel.edit }));
    await user.click(screen.getByRole("button", { name: t.wheel.delete }));
    expect(await props(section.id)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: new RegExp(t.wheel.delete) }));
    expect(await screen.findByText(t.wheel.empty)).toBeInTheDocument();
    // Gone for good once the undo window closes.
    await waitFor(async () => expect(await props(section.id)).toEqual([]), { timeout: 8000 });
  }, 20_000);

  it("picks between wheels; a recently done option sits out", async () => {
    const today = todayKey(TZ);
    const { user, t } = await open("wheel", [
      { title: "Dinner", props: wheel(["Pizza", "Tacos"]) },
      { title: "Trips", props: { _wheel: { options: [{ label: "Beach", doneDay: today }, { label: "Hike" }] } } },
    ]);
    await user.click(screen.getByRole("button", { name: "Trips" }));
    expect(screen.getByText(new RegExp(`Beach · `))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.wheel.resting.replace("{days}", "21")))).toBeInTheDocument();
  });
});

describe("commitments", () => {
  const commitOf = async (sectionId: string) => (await props(sectionId)).map((r) => ({ title: r.title, ...(r.props._commit as Record<string, unknown>) }) as Record<string, unknown>);

  it("reads 'under 300 this month' from the words; logging past the limit breaks it", async () => {
    const { user, t, section } = await open("commit");
    const input = screen.getAllByPlaceholderText(t.commit.addPlaceholder)[0];
    await user.type(input, "no more than 300 on Cibus this month");
    await user.click(screen.getByRole("button", { name: t.common.add }));
    await waitFor(async () => expect((await commitOf(section.id))[0]).toMatchObject({ period: "month", limit: 300 }));
    await user.type(await screen.findByPlaceholderText(t.commit.amount), "350");
    await user.click(screen.getByRole("button", { name: `+ ${t.commit.log}` }));
    expect(await screen.findByText(new RegExp(t.commit.over.replace("{over}", "")))).toBeInTheDocument();
    await waitFor(async () => expect((await commitOf(section.id))[0].log).toMatchObject([{ amount: 350 }]));
  });

  it("a did-it commitment: 'made it' closes it; 'commit again' starts a new one", async () => {
    const { user, t, section } = await open("commit");
    await user.type(screen.getAllByPlaceholderText(t.commit.addPlaceholder)[0], "Laundry");
    await user.click(screen.getByRole("button", { name: t.commit.periods.week }));
    await user.click(screen.getByRole("button", { name: t.common.add }));
    await user.click(await screen.findByRole("button", { name: new RegExp(t.commit.kept) }));
    await waitFor(async () => expect(await sql(`select done, remind_at, props->'_commit'->>'result' as result from items where section_id = $1`, [section.id])).toEqual([{ done: true, remind_at: null, result: "kept" }]));
    expect(await screen.findByText("100%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.commit.again }));
    await waitFor(async () => expect((await commitOf(section.id)).map((c) => c.period)).toEqual(["week", "week"]));
  });

  it("a broken one keeps the lesson", async () => {
    const { user, t, section } = await open("commit");
    await user.type(screen.getAllByPlaceholderText(t.commit.addPlaceholder)[0], "No sugar today");
    await user.click(screen.getByRole("button", { name: t.common.add }));
    await user.click(await screen.findByRole("button", { name: t.commit.broken }));
    const lesson = await screen.findByPlaceholderText(t.commit.lessonPlaceholder);
    await user.type(lesson, "Keep fruit at home");
    await user.tab();
    await waitFor(async () => expect((await commitOf(section.id))[0]).toMatchObject({ result: "broken", lesson: "Keep fruit at home" }));
    expect(await screen.findByText("Keep fruit at home")).toBeInTheDocument();
  });
});

describe("reminder calendar", () => {
  const on = (date: string, extra: Record<string, unknown> = {}) => ({ _dates: { date, repeat: "once", from: "00:00", until: "21:00", every: 0, ahead: 0, carry: false, ...extra } });

  it("a new reminder opens its sheet; yearly with a week's heads-up saves its alert", async () => {
    const { user, t, section } = await open("dates");
    await user.type(screen.getByPlaceholderText(t.dates.addPlaceholder), "Mom's birthday{Enter}");
    await user.click(await screen.findByRole("button", { name: t.dates.yearly }));
    await user.click(screen.getByRole("button", { name: t.dates.weekBefore }));
    await user.click(screen.getByRole("button", { name: t.common.saveChanges }));
    await waitFor(async () => {
      const [row] = await sql<{ props: { _dates: Record<string, unknown> }; due_at: unknown }>(`select props, due_at from items where section_id = $1`, [section.id]);
      expect(row.props._dates).toMatchObject({ repeat: "yearly", ahead: 7, date: todayKey(TZ) });
      expect(row.due_at).not.toBeNull();
    });
  });

  it("today's reminder: 'no more needed' marks it handled and done; undo reopens it", async () => {
    const today = todayKey(TZ);
    const { user, t, rows } = await open("dates", [{ title: "Pay rent", props: on(today) }]);
    await user.click(screen.getAllByRole("button", { name: new RegExp(t.dates.stop) })[0]);
    await waitFor(async () => {
      expect(await sql(`select day::text, status from checkins where item_id = $1`, [rows[0].id])).toEqual([{ day: today, status: "done" }]);
      expect(await sql(`select done from items where id = $1`, [rows[0].id])).toEqual([{ done: true }]);
    });
    await user.click(screen.getByText(new RegExp(t.sections.showDone)));
    await user.click(screen.getAllByText("Pay rent").at(-1)!);
    await user.click(await screen.findByRole("button", { name: new RegExp(t.dates.undo) }));
    await waitFor(async () => expect(await sql(`select 1 from checkins where item_id = $1`, [rows[0].id])).toEqual([]));
  });

  it("gift ideas save as you add and tick them", async () => {
    const { user, t, rows } = await open("dates", [{ title: "Anniversary", props: on("2027-03-01", { repeat: "yearly" }) }]);
    await user.click(screen.getAllByText("Anniversary")[0]);
    await user.type(await screen.findByPlaceholderText(t.dates.giftAdd), "Concert tickets{Enter}");
    await waitFor(async () => expect(await sql(`select props->'_gifts' as g from items where id = $1`, [rows[0].id])).toEqual([{ g: [{ text: "Concert tickets" }] }]));
    await user.click(screen.getByRole("button", { name: "Concert tickets" }));
    await waitFor(async () => expect(await sql(`select props->'_gifts' as g from items where id = $1`, [rows[0].id])).toEqual([{ g: [{ text: "Concert tickets", done: true }] }]));
  });

  it("tapping a heading in the sheet changes nothing under it", async () => {
    const { user, t } = await open("dates", [{ title: "Vet", props: on("2027-02-01", { ahead: 7, every: 3 }) }]);
    await user.click(screen.getAllByText("Vet")[0]);
    await user.click(await screen.findByText(t.dates.ahead));
    await user.click(screen.getByText(t.dates.alerts));
    await user.click(screen.getByText(t.dates.gifts));
    expect(screen.getByRole("button", { name: t.dates.weekBefore })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: t.dates.alerts })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.common.saveChanges })).not.toBeInTheDocument();
  });

  it("the month grid: other days, other months, and back to today", async () => {
    const { user, t } = await open("dates", [{ title: "Dentist", props: on("2027-01-15") }]);
    await user.click(screen.getByRole("button", { name: t.common.nextMonth }));
    await user.click(screen.getByRole("button", { name: t.common.previousMonth }));
    await user.click(screen.getByRole("button", { name: t.common.nextMonth }));
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText(new RegExp(t.dates.nothingOn))).toBeInTheDocument();
    expect(screen.getByText(t.dates.upcoming)).toBeInTheDocument();
    expect(screen.getByText("Dentist")).toBeInTheDocument();
  });

  it("an undated one (from a template) asks for a date", async () => {
    const { t } = await open("dates", [{ title: "Car test" }]);
    expect(screen.getByText(t.dates.noDate)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.dates.setDate))).toBeInTheDocument();
  });
});

describe("smart fridge", () => {
  const fridge = (level: string, staple = false) => ({ _fridge: { level, staple } });
  const state = async (sectionId: string) => (await props(sectionId)).map((r) => ({ title: r.title, ...(r.props._fridge as object) }));

  it("a product added by hand is a full staple; its level steps down and the star toggles", async () => {
    const { user, t, section } = await open("fridge");
    await user.type(screen.getByPlaceholderText(t.fridge.addPlaceholder), "Milk{Enter}");
    await waitFor(async () => expect(await state(section.id)).toEqual([{ title: "Milk", level: "full", staple: true }]));
    await user.click(await screen.findByRole("button", { name: t.fridge.levels.full }));
    await user.click(screen.getByRole("button", { name: t.fridge.staple }));
    await waitFor(async () => expect(await state(section.id)).toEqual([{ title: "Milk", level: "half", staple: false }]));
  });

  it("what's missing goes on the shared shopping list once", async () => {
    const { user, home } = await open("fridge", [
      { title: "Eggs", props: fridge("out") },
      { title: "Butter", props: fridge("low", true) },
      { title: "Jam", props: fridge("low") },
    ]);
    const [{ id: list }] = await sql<{ id: string }>(`insert into sections (household_id, title, template) values ($1, 'Groceries', 'groceries') returning id`, [home.householdId]);
    await sql(`insert into items (section_id, title) values ($1, 'eggs')`, [list]);
    for (const name of ["Eggs", "Butter"]) await user.click(screen.getByRole("button", { name: new RegExp(`${name}$`) }));
    expect(screen.queryByRole("button", { name: /Jam$/ })).not.toBeInTheDocument();
    await waitFor(async () => expect((await sql<{ title: string }>(`select title from items where section_id = $1 order by title`, [list])).map((r) => r.title)).toEqual(["Butter", "eggs"]));
    expect(screen.getByRole("button", { name: /Butter$/ })).toBeDisabled();
  });

  it("scans up to four photos together and reports what it saw; a failure and the daily limit say so", async () => {
    const { user, t } = await open("fridge");
    const file = () => new File(["x"], "shelf.jpg", { type: "image/jpeg" });
    const picker = document.querySelector<HTMLInputElement>("input[type=file]")!;
    await user.upload(picker, file());
    await user.upload(picker, file());
    await user.click(screen.getAllByRole("button", { name: t.common.delete })[0]);
    await user.upload(picker, file());
    app.respond = (url) => (url.endsWith("/api/fridge/scan") ? { seen: 7, added: ["Kale"], toBuy: ["Milk", "Eggs"] } : undefined);
    await user.click(screen.getByRole("button", { name: new RegExp(t.fridge.scanN.replace("{n}", "2")) }));
    expect(await screen.findByText(t.fridge.result.replace("{seen}", "7").replace("{added}", "1").replace("{buy}", "2"))).toBeInTheDocument();
    expect(app.outbound.filter((u) => u.endsWith("/api/fridge/scan"))).toHaveLength(1);

    await user.upload(picker, file());
    app.respond = (url) => (url.endsWith("/api/fridge/scan") ? new Response("{}", { status: 429 }) : undefined);
    await user.click(screen.getByRole("button", { name: new RegExp(t.fridge.scanN.replace("{n}", "1")) }));
    expect(await screen.findByText(t.fridge.limit)).toBeInTheDocument();
    app.respond = (url) => (url.endsWith("/api/fridge/scan") ? new Response(JSON.stringify({ error: "x" }), { status: 500 }) : undefined);
    await user.click(screen.getByRole("button", { name: new RegExp(t.fridge.scanN.replace("{n}", "1")) }));
    expect(await screen.findByText(t.fridge.failed)).toBeInTheDocument();
  });
});

describe("spending", () => {
  const tx = (amount: number, at: Date, extra: Record<string, unknown> = {}) => ({ _tx: { amount, currency: "₪", merchant: "x", at: at.toISOString(), category: "groceries", refund: false, key: crypto.randomUUID(), ...extra } });

  it("this month's total, against last month, by category, with refunds", async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10, 12);
    const { t } = await open("spend", [
      { title: "Shufersal", props: tx(200, now, { card: "4321" }) },
      { title: "Paz", props: tx(100, now, { category: "fuel" }) },
      { title: "Old", props: tx(50, lastMonth) },
      { title: "Return", props: tx(30, now, { refund: true }) },
    ]);
    // A refund takes its amount off: 200 + 100 − 30.
    expect(screen.getByText("₪270")).toBeInTheDocument();
    expect(screen.getByText(`${t.spend.purchases.replace("{n}", "3")} · ${t.spend.vsLast.replace("{diff}", "+₪220")}`)).toBeInTheDocument();
    expect(screen.getByText(t.spend.categories.fuel)).toBeInTheDocument();
    expect(screen.getByText(/•4321/)).toBeInTheDocument();
    expect(screen.getByText("+₪30")).toBeInTheDocument();
  });

  it("an adult adds and removes a card; only four digits, no repeats", async () => {
    const { user, t, section } = await open("spend");
    const box = screen.getByPlaceholderText("1234");
    const add = screen.getByRole("button", { name: `+ ${t.spend.addCard}` });
    await user.type(box, "12a3");
    expect(add).toBeDisabled();
    await user.type(box, "4{Enter}");
    await waitFor(async () => expect(await sql(`select settings->'cards' as c from sections where id = $1`, [section.id])).toEqual([{ c: ["1234"] }]));
    await user.type(box, "1234");
    expect(add).toBeDisabled();
    await user.clear(box);
    await user.click(screen.getByRole("button", { name: t.common.delete }));
    await waitFor(async () => expect(await sql(`select settings->'cards' as c from sections where id = $1`, [section.id])).toEqual([{ c: [] }]));
  });

  it("a child's card change is refused out loud and undone on screen", async () => {
    const { user, t, section } = await open("spend", [], {}, "child");
    await user.type(screen.getByPlaceholderText("1234"), "5555{Enter}");
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(screen.queryByText("•5555")).not.toBeInTheDocument();
    expect(await sql(`select settings->'cards' as c from sections where id = $1`, [section.id])).toEqual([{ c: null }]);
  });
});
