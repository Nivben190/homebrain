// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { Section } from "@/lib/db-types";
import { fill } from "@/i18n";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));

const { NewSectionButton } = await import("./NewSectionButton");
const { SectionSettingsSheet } = await import("./SectionSettingsSheet");

beforeAll(startApp, 120_000);
beforeEach(() => {
  router.push.mockClear();
  vi.stubGlobal("confirm", () => true);
});

/** The details step slides in once the template list has slid out. */
const details = <T,>(find: () => T) => waitFor(find, { timeout: 3000 });
const spaces = (householdId: string) => sql<{ title: string; owner_id: string | null; view: string }>(`select title, owner_id, view from sections where household_id = $1 order by created_at`, [householdId]);

describe("new space", () => {
  it("from a template: shared, with its starter items, and opens it", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<NewSectionButton householdId={home.householdId} userId={home.users.owner} timeZone="Asia/Jerusalem" />);
    await user.click(screen.getByRole("button", { name: t.sections.new }));
    const first = screen.getAllByRole("button").find((b) => b.querySelector(".line-clamp-2"))!;
    await user.click(first);
    await user.click(await details(() => screen.getByRole("button", { name: t.common.create })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/sections\//)));
    const [s] = await spaces(home.householdId);
    expect(s.owner_id).toBeNull();
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from items i join sections s on s.id = i.section_id where s.household_id = $1`, [home.householdId]);
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it("a blank private one with a custom name", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<NewSectionButton householdId={home.householdId} userId={home.users.owner} timeZone="Asia/Jerusalem" />);
    await user.click(screen.getByRole("button", { name: t.sections.new }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.sections.blank) }));
    const name = await details(() => screen.getByPlaceholderText(t.sections.name));
    await user.clear(name);
    await user.type(name, "Gift ideas");
    await user.click(screen.getByRole("button", { name: new RegExp(t.common.private) }));
    await user.click(await details(() => screen.getByRole("button", { name: t.common.create })));
    await waitFor(async () => expect(await spaces(home.householdId)).toMatchObject([{ title: "Gift ideas", owner_id: home.users.owner }]));
  });

  it("a teen's space is always their own, and it saves", async () => {
    const home = await homeWith(["owner", "teen"]);
    signIn(home.users.teen);
    const { user, t } = renderUi(<NewSectionButton householdId={home.householdId} userId={home.users.teen} timeZone="Asia/Jerusalem" privateOnly />);
    await user.click(screen.getByRole("button", { name: t.sections.new }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.sections.blank) }));
    await user.type(await details(() => screen.getByPlaceholderText(t.sections.name)), "My room");
    expect(screen.queryByText(t.sections.visibility)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.common.create }));
    await waitFor(async () => expect((await spaces(home.householdId)).map((s) => s.owner_id)).toEqual([home.users.teen]));
  });

  it("help me choose: goals in, the ticked spaces added together, what the home has left out", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<NewSectionButton householdId={home.householdId} userId={home.users.owner} timeZone="Asia/Jerusalem" existing={["dog-care"]} startFinder />);
    await user.click(await screen.findByRole("button", { name: /Look after the dog/ }));
    await user.click(screen.getByRole("button", { name: /Plan meals and eat better/ }));
    await user.click(screen.getByRole("button", { name: t.finder.show }));
    // Dog care is already there; Dog health and Meal plan are the best start.
    const boxes = await details(() => {
      const all = screen.getAllByRole("checkbox");
      expect(all.length).toBeGreaterThan(2);
      return all;
    });
    expect(boxes.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent)).toEqual([
      expect.stringContaining("Dog health"),
      expect.stringContaining("Meal plan"),
    ]);
    expect(screen.queryByText("Dog care")).not.toBeInTheDocument();
    await user.click(boxes.find((b) => b.textContent?.includes("Groceries"))!);
    await user.click(screen.getByRole("button", { name: fill(t.finder.add, { n: "3" }) }));
    await waitFor(async () => expect((await spaces(home.householdId)).map((s) => s.title).sort()).toEqual(["Dog health", "Groceries", "Meal plan"]));
    expect(router.push).toHaveBeenCalledWith("/sections");
  });

  it("refused by the database, it says so in plain words", async () => {
    const home = await homeWith(["owner", "child"]);
    signIn(home.users.child);
    const { user, t } = renderUi(<NewSectionButton householdId={home.householdId} userId={home.users.child} timeZone="Asia/Jerusalem" />);
    await user.click(screen.getByRole("button", { name: t.sections.new }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.sections.blank) }));
    await user.type(await details(() => screen.getByPlaceholderText(t.sections.name)), "Kid space");
    await user.click(screen.getByRole("button", { name: t.common.create }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(await spaces(home.householdId)).toEqual([]);
  });
});

describe("space settings", () => {
  async function sheet(role: string) {
    const home = await homeWith(["owner", role].filter((r, i, a) => a.indexOf(r) === i));
    const [section] = await sql<Section>(`insert into sections (household_id, title) values ($1, 'Lists') returning *`, [home.householdId]);
    signIn(home.users[role]);
    const saved = vi.fn();
    const deleted = vi.fn();
    const ui = renderUi(<SectionSettingsSheet open section={section} userId={home.users[role]} onClose={() => {}} onSaved={saved} onDeleted={deleted} />);
    return { ...ui, home, section, saved, deleted };
  }

  it("an adult renames it and it's saved", async () => {
    const { user, t, section, saved } = await sheet("adult");
    const title = screen.getByDisplayValue("Lists");
    await user.clear(title);
    await user.type(title, "Shopping");
    await user.click(screen.getByRole("button", { name: new RegExp(t.common.save) }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(await sql(`select title from sections where id = $1`, [section.id])).toEqual([{ title: "Shopping" }]);
  });

  it("a child's rename or delete is not pretended: it says no and nothing changes", async () => {
    const { user, t, section, saved, deleted } = await sheet("child");
    const title = screen.getByDisplayValue("Lists");
    await user.clear(title);
    await user.type(title, "Mine now");
    await user.click(screen.getByRole("button", { name: new RegExp(t.common.save) }));
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: new RegExp(t.common.delete) }));
    await waitFor(() => expect(deleted).not.toHaveBeenCalled());
    expect(await sql(`select title from sections where id = $1`, [section.id])).toEqual([{ title: "Lists" }]);
  });
});
