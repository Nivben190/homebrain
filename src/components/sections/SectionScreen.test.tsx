// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

const { SectionScreen } = await import("./SectionScreen");
const { idbQueue } = await import("@/lib/offline-queue");

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  app.failNext = false;
});

async function open(view: string, fields: Record<string, unknown> = {}, items: string[] = []) {
  const home = await homeWith(["owner", "adult"]);
  const [section] = await sql<Section>(`insert into sections (household_id, title, view, owner_id) values ($1, 'Groceries', $2, $3) returning *`, [home.householdId, view, (fields.owner_id as string) ?? null]);
  for (const [n, title] of items.entries()) await sql(`insert into items (section_id, title, position) values ($1, $2, $3)`, [section.id, title, n]);
  const rows = await sql<Item>(`select * from items where section_id = $1`, [section.id]);
  const members = [
    { id: home.users.owner, name: "Owner", emoji: "🦊" },
    { id: home.users.adult, name: "Adult", emoji: "🐻" },
  ];
  const ui = renderUi(
    <SectionScreen initialSection={section} initialItems={rows.map((r) => ({ ...r, created_at: String(r.created_at) }))} initialCheckins={[]} userId={home.users.owner} members={members} timeZone="Asia/Jerusalem" launch={{ notes: "l1.notes", checkin: "l1.checkin" }} />,
  );
  return { ...ui, home, section };
}
/** Gone from the screen, once its exit animation has played. */
const gone = (text: string) => waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument(), { timeout: 3000 });
const dbItems = (sectionId: string) => sql<{ title: string; done: boolean }>(`select title, done from items where section_id = $1 order by position`, [sectionId]);

describe("a checklist space", () => {
  it("adds an item from the bar, and it's in the database", async () => {
    const { user, t, section } = await open("checklist");
    await user.type(screen.getByPlaceholderText(t.sections.addItem), "Milk{Enter}");
    expect(await screen.findByText("Milk")).toBeInTheDocument();
    await waitFor(async () => expect(await dbItems(section.id)).toEqual([{ title: "Milk", done: false }]));
  });

  it("ticks an item, which moves under 'show done' and saves", async () => {
    const { user, t, section } = await open("checklist", {}, ["Eggs", "Bread"]);
    await user.click(screen.getByRole("checkbox", { name: "Eggs" }));
    await waitFor(async () => expect(await dbItems(section.id)).toEqual([{ title: "Eggs", done: true }, { title: "Bread", done: false }]));
    await user.click(screen.getByText(new RegExp(t.sections.showDone)));
    // (The row leaving the open list may still be animating out.)
    expect(screen.getAllByRole("checkbox", { name: "Eggs" }).at(-1)).toHaveAttribute("aria-checked", "true");
  });

  it("delete waits for Undo; undone, the item stays", async () => {
    const { user, t, section } = await open("checklist", {}, ["Soap"]);
    await user.click(screen.getByRole("button", { name: t.common.edit }));
    await user.click(screen.getAllByRole("button", { name: t.common.delete })[0]);
    await gone("Soap");
    await user.click((await screen.findAllByRole("button", { name: t.sections.undo }))[0]);
    expect(await screen.findByText("Soap")).toBeInTheDocument();
    expect(await dbItems(section.id)).toEqual([{ title: "Soap", done: false }]);
  });

  it("delete goes through after the undo window", async () => {
    // Real time: fake timers would also freeze the animation library for the rest of the file.
    const { user, t, section } = await open("checklist", {}, ["Old"]);
    await user.click(screen.getByRole("button", { name: t.common.edit }));
    await user.click(screen.getAllByRole("button", { name: t.common.delete })[0]);
    expect(await dbItems(section.id)).toEqual([{ title: "Old", done: false }]);
    await waitFor(async () => expect(await dbItems(section.id)).toEqual([]), { timeout: 8000, interval: 500 });
  });
});

describe("when a save fails", () => {
  it("refused by the database: the change is undone and it says why, with no pointless Retry", async () => {
    const { user, t, section } = await open("checklist");
    // Someone from another home: the database refuses their writes here.
    signIn((await homeWith(["owner"])).users.owner);
    await user.type(screen.getByPlaceholderText(t.sections.addItem), "Tea{Enter}");
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.sections.retry })).not.toBeInTheDocument();
    await gone("Tea");
    expect(await dbItems(section.id)).toEqual([]);
  });

  it("a passing server error: Retry saves it", async () => {
    const { user, t, section } = await open("checklist");
    app.failNext = true;
    await user.type(screen.getByPlaceholderText(t.sections.addItem), "Jam{Enter}");
    await user.click(await screen.findByRole("button", { name: t.sections.retry }));
    await waitFor(async () => expect(await dbItems(section.id)).toEqual([{ title: "Jam", done: false }]));
    expect(screen.getByText("Jam")).toBeInTheDocument();
  });

  it("no signal: the change stays and waits in the offline queue", async () => {
    const { user, t } = await open("checklist");
    app.offline = true;
    await user.type(screen.getByPlaceholderText(t.sections.addItem), "Batteries{Enter}");
    expect(await screen.findByText("Batteries")).toBeInTheDocument();
    await waitFor(async () => expect((await idbQueue.all()).map((q) => q.op.values?.title)).toContain("Batteries"));
    expect(screen.queryByText(new RegExp(t.sections.saveFailed))).not.toBeInTheDocument();
  });
});

describe("the item sheet", () => {
  async function withDate() {
    const home = await homeWith(["owner"]);
    const schema = [{ id: "when", name: "When", type: "date" }];
    const [section] = await sql<Section>(`insert into sections (household_id, title, view, schema) values ($1, 'House', 'checklist', $2) returning *`, [home.householdId, JSON.stringify(schema)]);
    const [item] = await sql<Item>(`insert into items (section_id, title) values ($1, 'Fix tap') returning *`, [section.id]);
    const ui = renderUi(<SectionScreen initialSection={section} initialItems={[{ ...item, created_at: String(item.created_at) }]} initialCheckins={[]} userId={home.users.owner} members={[]} timeZone="Asia/Jerusalem" launch={{ notes: "", checkin: "" }} />);
    await ui.user.click(screen.getByText("Fix tap"));
    return { ...ui, section, item };
  }
  const row = (id: string) => sql<{ title: string; done: boolean; props: Record<string, unknown>; due_at: Date | null; remind_at: Date | null }>(`select title, done, props, due_at, remind_at from items where id = $1`, [id]);

  it("renames and takes notes, saved when the sheet closes", async () => {
    const { user, t, item } = await withDate();
    const title = screen.getByDisplayValue("Fix tap");
    await user.clear(title);
    await user.type(title, "Fix kitchen tap");
    await user.type(screen.getByLabelText(t.sections.notes), "Washer is 1/2 inch");
    await user.click(screen.getByRole("button", { name: t.common.close }));
    await waitFor(async () => expect((await row(item.id))[0]).toMatchObject({ title: "Fix kitchen tap", props: { _notes: "Washer is 1/2 inch" } }));
  });

  it("a date makes it due at 09:00 Israel time, and it can remind a day before", async () => {
    const { user, t, item } = await withDate();
    const date = screen.getByLabelText("When");
    await user.clear(date);
    await user.type(date, "2026-11-03");
    await waitFor(async () => expect(new Date((await row(item.id))[0].due_at!).toISOString()).toBe("2026-11-03T07:00:00.000Z"));
    await user.click(screen.getByRole("button", { name: t.sections.remindLead[1440] }));
    expect(screen.getByRole("button", { name: t.sections.remindLead[1440] })).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect(new Date((await row(item.id))[0].remind_at!).toISOString()).toBe("2026-11-02T07:00:00.000Z"));
  });

  it("done from the sheet, and delete from the sheet", async () => {
    const { user, t, item } = await withDate();
    await user.click(screen.getByRole("button", { name: new RegExp(t.common.done) }));
    await waitFor(async () => expect((await row(item.id))[0].done).toBe(true));
    await user.click(screen.getAllByRole("button", { name: t.common.delete }).at(-1)!);
    await gone("Fix tap");
  });
});

describe("other kinds of space", () => {
  it("a private space says so; an empty one says it's empty", async () => {
    const home = await homeWith(["owner"]);
    const [section] = await sql<Section>(`insert into sections (household_id, title, view, owner_id) values ($1, 'Diary', 'notes', $2) returning *`, [home.householdId, home.users.owner]);
    const { t } = renderUi(<SectionScreen initialSection={section} initialItems={[]} initialCheckins={[]} userId={home.users.owner} members={[]} timeZone="Asia/Jerusalem" launch={{ notes: "", checkin: "" }} />);
    expect(screen.getByText(new RegExp(t.common.private))).toBeInTheDocument();
    expect(screen.getByText(t.sections.empty)).toBeInTheDocument();
  });

  it("each view renders its items without crashing", async () => {
    for (const view of ["list", "notes", "tracker", "gallery", "dates", "subscriptions", "commit", "fridge", "spend", "wheel"]) {
      const { unmount } = await open(view, {}, [`${view} item`]);
      const header = screen.getByRole("heading", { level: 1 });
      expect(within(header).getByText("Groceries")).toBeInTheDocument();
      unmount();
    }
  });
});
