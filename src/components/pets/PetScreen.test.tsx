// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { app, homeWith, router, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import { todayKey } from "@/lib/engine/habits";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));

const { default: PetPage } = await import("@/app/(app)/pets/[id]/page");

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  router.refresh.mockClear();
  router.replace.mockClear();
  vi.stubGlobal("confirm", () => true);
});

const TZ = "Asia/Jerusalem";
const today = () => todayKey(TZ);

/** The pet page as the server renders it, for the signed-in member. */
async function petPage(extra: Record<string, unknown> = {}, roles = ["owner"]) {
  const home = await homeWith(roles);
  const cols = { name: "Rex", emoji: "🐕", food_bag_kg: 12, daily_grams: 300, bag_started: "2026-01-01", vet_name: "Dr. Paws", vet_phone: "050-123-4567", ...extra };
  const keys = Object.keys(cols);
  const [pet] = await sql<{ id: string }>(`insert into pets (household_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`, [home.householdId, ...Object.values(cols)]);
  const render = async () => renderUi(await PetPage({ params: Promise.resolve({ id: pet.id }) }));
  return { home, pet, render };
}
const flash = (text: string) => screen.findByText(text, { selector: "div.fixed" });

describe("pet page", () => {
  it("shows food left, the vet with call and WhatsApp, and the pet switcher", async () => {
    const { pet, home, render } = await petPage({ bag_started: today() });
    await sql(`insert into pets (household_id, name, emoji) values ($1, 'Mitzi', '🐈')`, [home.householdId]);
    const { t } = await render();
    expect(screen.getByRole("heading", { name: "Rex" })).toBeInTheDocument();
    expect(screen.getByText(t.pets.daysLeft.replace("{n}", "40"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.pets.call })).toHaveAttribute("href", "tel:050-123-4567");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/972501234567$/));
    const nav = screen.getByRole("navigation", { name: t.pets.switch });
    expect(within(nav).getByRole("link", { name: /Rex/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /Mitzi/ })).not.toHaveAttribute("aria-current");
  });

  it("a new bag starts today; out of food goes on the dog list once", async () => {
    const { pet, home, render } = await petPage();
    const [list] = await sql<{ id: string }>(`insert into sections (household_id, title, template) values ($1, 'Dog stuff', 'dog-supplies') returning id`, [home.householdId]);
    const { user, t } = await render();
    expect(screen.getByText(t.pets.daysLeft.replace("{n}", "0"))).toHaveClass("text-danger");
    await user.click(screen.getByRole("button", { name: new RegExp(t.pets.newBag) }));
    await waitFor(async () => expect((await sql<{ d: string }>(`select bag_started::text as d from pets where id = $1`, [pet.id]))[0].d).toBe(today()));
    await user.click(screen.getByRole("button", { name: new RegExp(t.pets.reorder) }));
    expect(await flash(t.pets.added)).toBeInTheDocument();
    await sql(`update items set done = true where section_id = $1`, [list.id]);
    await user.click(screen.getByRole("button", { name: new RegExp(t.pets.reorder) }));
    await waitFor(async () => expect(await sql(`select title from items where section_id = $1 and not done`, [list.id])).toHaveLength(1));
    expect(await sql(`select 1 from items where section_id = $1`, [list.id])).toHaveLength(1);
  });

  it("no shopping list to put food on: says so instead of 'added'", async () => {
    const { render } = await petPage();
    const { user, t } = await render();
    await user.click(screen.getByRole("button", { name: new RegExp(t.pets.reorder) }));
    expect(await screen.findByText(t.pets.noList)).toBeInTheDocument();
    expect(screen.queryByText(t.pets.added)).not.toBeInTheDocument();
  });

  it("logs today's weight, and the chart follows", async () => {
    const { pet, render } = await petPage();
    await sql(`insert into pet_weights (pet_id, day, kg) values ($1, '2026-09-01', 30), ($1, '2026-10-01', 31.5)`, [pet.id]);
    const { user, t } = await render();
    expect(screen.getByText("31.5")).toBeInTheDocument();
    expect(document.querySelector("polyline")).not.toBeNull();
    const box = screen.getByRole("spinbutton", { name: t.pets.addWeight });
    await user.type(box, "32.2");
    await user.click(screen.getByRole("button", { name: t.common.add }));
    await waitFor(async () => expect(await sql(`select kg::float as kg from pet_weights where pet_id = $1 and day = $2`, [pet.id, today()])).toEqual([{ kg: 32.2 }]));
    expect(box).toHaveValue(null);
  });

  it("a routine can be pinned to one pet when there are several", async () => {
    const { pet, home, render } = await petPage();
    await sql(`insert into pets (household_id, name, emoji) values ($1, 'Bolt', '🐩')`, [home.householdId]);
    const [walks] = await sql<{ id: string }>(`insert into sections (household_id, title, template, view) values ($1, 'Walks', 'dog-walks', 'checklist') returning id`, [home.householdId]);
    await sql(`insert into items (section_id, title) values ($1, 'Evening walk')`, [walks.id]);
    const { user, t } = await render();
    expect(screen.getByRole("link", { name: /Walks/ })).toHaveTextContent("Evening walk");
    const pin = screen.getByRole("button", { name: t.pets.onlyFor.replace("{name}", "Rex") });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await user.click(pin);
    await waitFor(async () => expect((await sql<{ p: string }>(`select pet_id as p from sections where id = $1`, [walks.id]))[0].p).toBe(pet.id));
  });

  it("deleting asks, then the pet is gone and you're back on Today", async () => {
    const { pet, render } = await petPage();
    const { user, t } = await render();
    await user.click(screen.getByRole("button", { name: t.pets.edit }));
    await user.click(await screen.findByRole("button", { name: t.common.delete }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(await sql(`select 1 from pets where id = $1`, [pet.id])).toEqual([]);
  });

  it("when a change doesn't save (the pet was removed meanwhile), it says so instead of ✓", async () => {
    const { pet, render } = await petPage();
    const { user, t } = await render();
    await sql(`delete from pets where id = $1`, [pet.id]);
    await user.click(screen.getByRole("button", { name: new RegExp(t.pets.newBag) }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(screen.queryByText("✓", { selector: "div.fixed" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.pets.edit }));
    await user.click(await screen.findByRole("button", { name: t.common.delete }));
    expect(await screen.findAllByText(t.failures.denied)).not.toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("another home's pet is not found", async () => {
    const { pet } = await petPage();
    await homeWith(["owner"]);
    await expect(PetPage({ params: Promise.resolve({ id: pet.id }) })).rejects.toThrow("404");
  });
});
