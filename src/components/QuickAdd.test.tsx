// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { homeWith, router, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { QuickAdd, QUICK_ADD_OPEN } = await import("./QuickAdd");

beforeAll(startApp, 120_000);
beforeEach(() => localStorage.clear());

const jerusalem = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

async function setup() {
  const home = await homeWith(["owner", "adult"]);
  const add = async (title: string, template: string | null, view = "checklist") =>
    (await sql<{ id: string }>(`insert into sections (household_id, title, template, view, icon) values ($1, $2, $3, $4, '📋') returning id`, [home.householdId, title, template, view]))[0].id;
  const groceries = await add("Groceries", "groceries");
  const house = await add("House to-do", "house");
  const spaces = [
    { id: groceries, title: "Groceries", template: "groceries", view: "checklist", icon: "🛒" },
    { id: house, title: "House to-do", template: "house", view: "checklist", icon: "🏠" },
  ];
  const members = [
    { id: home.users.owner, name: "Niv", emoji: "🦊" },
    { id: home.users.adult, name: "Dana", emoji: "🐻" },
  ];
  const ui = renderUi(<QuickAdd spaces={spaces} members={members} timeZone="Asia/Jerusalem" />);
  return { ...ui, home, groceries, house };
}

describe("quick add", () => {
  it("reads the day and time from the text and adds it to the chosen space", async () => {
    const { user, t, house, home } = await setup();
    await user.click(screen.getByRole("button", { name: t.quickAdd.title }));
    await user.type(screen.getByPlaceholderText(t.quickAdd.placeholder), "call plumber tomorrow 10:30");
    expect(screen.getByText(/10:30/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(t.quickAdd.pickSpace), house);
    await user.selectOptions(screen.getByLabelText(t.quickAdd.pickPerson), screen.getByRole("option", { name: /Dana/ }));
    await user.click(screen.getByRole("button", { name: t.quickAdd.add }));
    expect(await screen.findByText(new RegExp(t.quickAdd.added.replace("{space}", ".*")))).toBeInTheDocument();
    const [row] = await sql<{ title: string; due_at: Date; assignee_id: string }>(`select title, due_at, assignee_id from items where section_id = $1`, [house]);
    expect(row.assignee_id).toBe(home.users.adult);
    expect(row.title).toBe("call plumber");
    const tomorrow = jerusalem(new Date(Date.now() + 86_400_000));
    expect(jerusalem(new Date(row.due_at))).toBe(tomorrow);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("remembers where you put the same thing last time", async () => {
    const first = await setup();
    await first.user.click(screen.getByRole("button", { name: first.t.quickAdd.title }));
    await first.user.type(screen.getByPlaceholderText(first.t.quickAdd.placeholder), "batteries");
    await first.user.selectOptions(screen.getByLabelText(first.t.quickAdd.pickSpace), first.house);
    await first.user.click(screen.getByRole("button", { name: first.t.quickAdd.add }));
    await waitFor(async () => expect(await sql(`select 1 from items where section_id = $1`, [first.house])).toHaveLength(1));
    await first.user.type(screen.getByPlaceholderText(first.t.quickAdd.placeholder), "batteries");
    expect(screen.getByLabelText(first.t.quickAdd.pickSpace)).toHaveValue(first.house);
  });

  it("can't add an empty line; a calendar day opens it with that day picked", async () => {
    const { user, t } = await setup();
    window.dispatchEvent(new CustomEvent(QUICK_ADD_OPEN, { detail: { day: "2026-12-24" } }));
    expect(await screen.findByLabelText(t.quickAdd.pickDay)).toHaveValue("2026-12-24");
    expect(screen.getByRole("button", { name: t.quickAdd.add })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(t.quickAdd.placeholder), "  ");
    expect(screen.getByRole("button", { name: t.quickAdd.add })).toBeDisabled();
  });
});
