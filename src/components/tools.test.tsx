// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { app, homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { Section } from "@/lib/db-types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));

const { SearchBox } = await import("@/components/sections/SearchBox");
const { SpacesGrid } = await import("@/components/sections/SpacesGrid");
const { MoneyEditor } = await import("@/components/money/MoneyEditor");
const { HookKeyField } = await import("@/components/settings/HookKey");
const { reorderSections, setBudget } = await import("@/app/actions");

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  app.failNext = false;
  router.refresh.mockClear();
  localStorage.clear();
});

const space = async (householdId: string, title: string, extra: { owner_id?: string; position?: number } = {}) =>
  (await sql<Section>(`insert into sections (household_id, title, owner_id, position) values ($1, $2, $3, $4) returning *`, [householdId, title, extra.owner_id ?? null, extra.position ?? 0]))[0];
const item = (sectionId: string, title: string, props: Record<string, unknown> = {}) => sql(`insert into items (section_id, title, props) values ($1, $2, $3)`, [sectionId, title, JSON.stringify(props)]);

describe("search", () => {
  async function house() {
    const home = await homeWith(["owner", "adult"]);
    const other = await homeWith(["owner"]);
    signIn(home.users.owner);
    const kitchen = await space(home.householdId, "Kitchen");
    const theirs = await space(home.householdId, "Dana's", { owner_id: home.users.adult });
    const away = await space(other.householdId, "Elsewhere");
    await item(kitchen.id, "Olive oil", { _notes: "the green bottle" });
    await item(kitchen.id, "Beach towels", { _photos: [{ path: "a/b/item/x.jpg", kind: "image", thumb: "a/b/item/x_t.jpg" }] });
    await item(kitchen.id, "Save 15% coupon");
    await item(kitchen.id, "Room 101");
    await item(theirs.id, "Olive soap");
    await item(away.id, "Olive tree");
    const spaces = [kitchen, theirs].map((s) => ({ id: s.id, icon: "🍳", title: s.title }));
    return { home, kitchen, spaces };
  }
  const search = async (user: ReturnType<typeof renderUi>["user"], t: ReturnType<typeof renderUi>["t"], q: string) => {
    const box = screen.getByRole("searchbox", { name: t.search.placeholder });
    await user.clear(box);
    await user.type(box, q);
  };
  const titles = () => screen.queryAllByRole("link").map((a) => a.textContent);

  it("finds by title and notes in the spaces you can see, and links to the space", async () => {
    const { kitchen, spaces } = await house();
    const { user, t } = renderUi(<SearchBox spaces={spaces} />);
    await search(user, t, "olive");
    await waitFor(() => expect(titles()).toEqual(["🍳Olive oilKitchen"]));
    expect(screen.getByRole("link")).toHaveAttribute("href", `/sections/${kitchen.id}`);
    await search(user, t, "green bottle");
    await waitFor(() => expect(titles()).toEqual(["🍳Olive oilKitchen"]));
  });

  it("doesn't match what's behind the scenes: photo files, field names, or % as a wildcard", async () => {
    const { spaces } = await house();
    const { user, t } = renderUi(<SearchBox spaces={spaces} />);
    for (const q of ["image", "jpg", "notes", "photos"]) {
      await search(user, t, q);
      expect(await screen.findByText(t.search.none)).toBeInTheDocument();
    }
    await search(user, t, "5%");
    await waitFor(() => expect(titles()).toEqual(["🍳Save 15% couponKitchen"]));
  });

  it("remembers what you opened, offers it next time, and clears", async () => {
    const { spaces } = await house();
    const { user, t } = renderUi(<SearchBox spaces={spaces} />);
    await search(user, t, "towels");
    await user.click(await screen.findByRole("link", { name: /Beach towels/ }));
    await user.click(screen.getByRole("button", { name: t.search.clear }));
    await user.click(screen.getByRole("searchbox"));
    await user.click(await screen.findByRole("button", { name: "towels" }));
    expect(screen.getByRole("searchbox")).toHaveValue("towels");
    expect(JSON.parse(localStorage.getItem("recent-searches")!)).toEqual(["towels"]);
  });

  it("with no signal it says so instead of 'nothing found'", async () => {
    const { spaces } = await house();
    const { user, t } = renderUi(<SearchBox spaces={spaces} />);
    app.offline = true;
    await search(user, t, "olive");
    expect(await screen.findByText(t.failures.offline)).toBeInTheDocument();
    expect(screen.queryByText(t.search.none)).not.toBeInTheDocument();
  });
});

describe("arranging spaces", () => {
  const order = (householdId: string) => sql<{ title: string }>(`select title from sections where household_id = $1 order by position, title`, [householdId]).then((r) => r.map((s) => s.title));

  async function drag(from: string, to: string) {
    const tile = (title: string) => screen.getByRole("link", { name: new RegExp(title) });
    const target = tile(to).closest<HTMLElement>("[data-space]")!;
    document.elementFromPoint = () => target;
    fireEvent.pointerDown(tile(from));
    await new Promise((r) => setTimeout(r, 450));
    fireEvent.pointerMove(target, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(target);
  }

  async function grid(role: string) {
    const home = await homeWith([role, "owner"]);
    const sections = [await space(home.householdId, "A", { position: 0 }), await space(home.householdId, "B", { position: 1 }), await space(home.householdId, "C", { position: 2 })];
    return { home, ui: renderUi(<SpacesGrid sections={sections} counts={{ [sections[0].id]: 2 }} canReorder={["owner", "adult"].includes(role)} />) };
  }

  it("hold a tile, drag it over another, let go: saved for everyone", async () => {
    const { home, ui } = await grid("adult");
    expect(screen.getByRole("link", { name: /A/ })).toHaveTextContent(`2 ${ui.t.sections.items}`);
    await drag("A", "C");
    await waitFor(async () => expect(await order(home.householdId)).toEqual(["B", "C", "A"]));
    expect(screen.getAllByRole("link").map((a) => a.querySelector("p")!.textContent)).toEqual(["B", "C", "A"]);
  });

  it("a quick tap is a tap, not a drag", async () => {
    const { home } = await grid("owner");
    const a = screen.getByRole("link", { name: /A/ });
    fireEvent.pointerDown(a);
    fireEvent.pointerUp(a);
    expect(fireEvent.click(a)).toBe(true);
    expect(await order(home.householdId)).toEqual(["A", "B", "C"]);
  });

  it("a child can't rearrange the home: no hint, no drag, and the server refuses too", async () => {
    const { home, ui } = await grid("child");
    expect(screen.queryByText(ui.t.sections.reorderHint)).not.toBeInTheDocument();
    await drag("A", "C");
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByRole("link").map((a) => a.querySelector("p")!.textContent)).toEqual(["A", "B", "C"]);
    const ids = (await sql<{ id: string }>(`select id from sections where household_id = $1 order by position desc`, [home.householdId])).map((s) => s.id);
    expect(await reorderSections(ids)).toMatchObject({ ok: false });
    expect(await order(home.householdId)).toEqual(["A", "B", "C"]);
  });
});

describe("money: bills and budgets", () => {
  const budgets = (householdId: string) => sql<{ category: string; amount: string }>(`select category, amount::text from money_budgets where household_id = $1 order by category`, [householdId]);

  it("a bill's amount and a new budget save when you leave the box; clearing removes the budget", async () => {
    const home = await homeWith(["owner"]);
    const bills = await space(home.householdId, "Bills");
    const [bill] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Electricity') returning id`, [bills.id]);
    const { user, t } = renderUi(<MoneyEditor bills={[{ id: bill.id, title: "Electricity", amount: null }]} budgets={{}} categories={[]} canBudget />);
    await user.type(screen.getByRole("spinbutton", { name: "Electricity" }), "320");
    await user.tab();
    await waitFor(async () => expect((await sql<{ a: number }>(`select (props->>'_amount')::int as a from items where id = $1`, [bill.id]))[0].a).toBe(320));
    expect(await screen.findByText(new RegExp(t.settings.saved))).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: t.money.addBudget }), "groceries");
    const box = screen.getByRole("spinbutton", { name: t.spend.categories.groceries });
    await user.type(box, "1500");
    await user.tab();
    await waitFor(async () => expect(await budgets(home.householdId)).toEqual([{ category: "groceries", amount: "1500" }]));
    await user.clear(box);
    await user.tab();
    await waitFor(async () => expect(await budgets(home.householdId)).toEqual([]));
  });

  it("passing through a box without changing it saves nothing", async () => {
    const home = await homeWith(["owner"]);
    await sql(`insert into money_budgets (household_id, category, amount) values ($1, 'groceries', 900)`, [home.householdId]);
    const { user, t } = renderUi(<MoneyEditor bills={[]} budgets={{ groceries: 900 }} categories={["groceries"]} canBudget />);
    await user.click(screen.getByRole("spinbutton", { name: t.spend.categories.groceries }));
    await user.tab();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(new RegExp(t.settings.saved))).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("budgets are for the grown-ups: a teen sees none to edit, and the server refuses in plain words", async () => {
    const home = await homeWith(["teen", "owner"]);
    const { t } = renderUi(<MoneyEditor bills={[]} budgets={{ groceries: 900 }} categories={["groceries"]} canBudget={false} />);
    expect(screen.queryByRole("combobox", { name: t.money.addBudget })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const res = await setBudget("groceries", 100);
    expect(res.ok).toBe(false);
    expect(await budgets(home.householdId)).toEqual([]);
  });

  it("a refused save shows plain words, not the database's", async () => {
    const home = await homeWith(["owner"]);
    const bills = await space(home.householdId, "Bills");
    const [bill] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Water') returning id`, [bills.id]);
    const { user, t } = renderUi(<MoneyEditor bills={[{ id: bill.id, title: "Water", amount: 80 }]} budgets={{}} categories={[]} canBudget />);
    await sql(`delete from items where id = $1`, [bill.id]);
    const box = screen.getByRole("spinbutton", { name: "Water" });
    await user.clear(box);
    await user.type(box, "90");
    await user.tab();
    expect(await screen.findByText(t.failures.generic)).toBeInTheDocument();
  });
});

describe("Shortcut keys", () => {
  const keys = (userId: string) => sql<{ revoked: boolean }>(`select revoked_at is not null as revoked from hook_keys where user_id = $1 and purpose = 'spend' order by created_at`, [userId]);

  it("create shows the key once; replacing asks first and retires the old one", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<HookKeyField purpose="spend" info={{ exists: false, lastUsedAt: null }} />);
    expect(screen.getByText(new RegExp(t.keys.none))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.keys.create }));
    const shown = await screen.findByText(/^hb_/);
    expect(await keys(home.users.owner)).toEqual([{ revoked: false }]);
    expect(screen.getByText(new RegExp(t.keys.neverUsed))).toBeInTheDocument();
    const first = shown.textContent;

    await user.click(screen.getByRole("button", { name: t.keys.rotate }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.keys.confirmRotate);
    expect(await keys(home.users.owner)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: t.keys.rotate }));
    await waitFor(() => expect(screen.getByText(/^hb_/).textContent).not.toBe(first));
    expect(await keys(home.users.owner)).toEqual([{ revoked: true }, { revoked: false }]);
  });

  it("says when it was last used", async () => {
    await homeWith(["owner"]);
    const { t } = renderUi(<HookKeyField purpose="spend" info={{ exists: true, lastUsedAt: "2026-10-01T09:30:00Z" }} />);
    expect(screen.getByText(/2026/)).toHaveTextContent(t.keys.lastUsed.split("{when}")[0].trim());
  });

  it("a failure is said in plain words", async () => {
    await homeWith(["owner"]);
    const { user, t } = renderUi(<HookKeyField purpose={"nope" as never} info={{ exists: false, lastUsedAt: null }} />);
    await user.click(screen.getByRole("button", { name: t.keys.create }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.failures.generic);
  });
});
