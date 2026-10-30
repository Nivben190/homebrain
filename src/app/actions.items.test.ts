import { beforeAll, describe, expect, it, vi } from "vitest";
import { app, homeWith, Redirect, signIn, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const A = await import("./actions");
const { sealToken } = await import("@/lib/subs/gmail");

beforeAll(startApp, 120_000);

async function space(householdId: string, fields: Record<string, unknown> = {}) {
  const cols = { household_id: householdId, title: "Space", ...fields };
  const keys = Object.keys(cols);
  const [{ id }] = await sql<{ id: string }>(
    `insert into sections (${keys.join(",")}) values (${keys.map((k, i) => (k === "schema" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(",")}) returning id`,
    keys.map((k) => (k === "schema" ? JSON.stringify(cols[k as keyof typeof cols]) : cols[k as keyof typeof cols])),
  );
  return id;
}
async function item(sectionId: string, title: string, props: Record<string, unknown> = {}, extra = "") {
  const [{ id }] = await sql<{ id: string }>(`insert into items (section_id, title, props${extra ? ", due_at" : ""}) values ($1, $2, $3${extra ? ", $4" : ""}) returning id`, extra ? [sectionId, title, props, extra] : [sectionId, title, props]);
  return id;
}

describe("quick add", () => {
  it("adds to a space with its day and time on the date property", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { schema: [{ id: "when", name: "When", type: "date" }] });
    expect(await A.quickAdd({ sectionId: s, title: " Vet ", day: "2026-11-02", time: "10:30", assigneeId: home.users.owner })).toEqual({ ok: true });
    const [row] = await sql<{ title: string; props: Record<string, string>; due_at: Date; assignee_id: string }>(`select title, props, due_at, assignee_id from items where section_id = $1`, [s]);
    expect(row.title).toBe("Vet");
    expect(row.props.when).toBe("2026-11-02T10:30");
    expect(new Date(row.due_at).toISOString()).toBe("2026-11-02T08:30:00.000Z"); // Asia/Jerusalem, winter
    expect(row.assignee_id).toBe(home.users.owner);
  });

  it("refuses an empty title or someone else's space", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    const theirs = await space(other.householdId);
    signIn(home.users.owner);
    expect(await A.quickAdd({ sectionId: theirs, title: "x", day: null, time: null, assigneeId: null })).toEqual({ ok: false, error: "no space" });
    expect(await A.quickAdd({ sectionId: theirs, title: "  ", day: null, time: null, assigneeId: null })).toEqual({ ok: false, error: "empty" });
  });

  it("commitments get their commit fields", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { view: "commit" });
    expect(await A.quickAdd({ sectionId: s, title: "Gym 3x a week", day: null, time: null, assigneeId: null })).toEqual({ ok: true });
    const [row] = await sql<{ props: Record<string, unknown> }>(`select props from items where section_id = $1`, [s]);
    expect(Object.keys(row.props).length).toBeGreaterThan(0);
  });
});

describe("spaces", () => {
  it("reorders as dragged; a child can't", async () => {
    const home = await homeWith(["owner", "child"]);
    const a = await space(home.householdId, { title: "A" });
    const b = await space(home.householdId, { title: "B" });
    expect(await A.reorderSections([b, a])).toEqual({ ok: true });
    expect(await sql(`select title from sections where household_id = $1 order by position`, [home.householdId])).toEqual([{ title: "B" }, { title: "A" }]);
    expect(await A.reorderSections(["not-a-uuid"])).toEqual({ ok: false, error: "Invalid order" });
    signIn(home.users.child);
    await A.reorderSections([a, b]);
    expect(await sql(`select title from sections where household_id = $1 order by position`, [home.householdId])).toEqual([{ title: "B" }, { title: "A" }]);
  });

  it("links a routine to one of this home's pets only", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    const [{ id: theirPet }] = await sql<{ id: string }>(`insert into pets (household_id, name) values ($1, 'Their dog') returning id`, [other.householdId]);
    signIn(home.users.owner);
    const s = await space(home.householdId, { view: "tracker" });
    const [{ id: pet }] = await sql<{ id: string }>(`insert into pets (household_id, name) values ($1, 'Rex') returning id`, [home.householdId]);
    expect(await A.linkRoutine(s, pet)).toEqual({ ok: true });
    expect(await A.linkRoutine(s, theirPet)).toEqual({ ok: false, error: "not allowed" });
    expect(await sql(`select pet_id from sections where id = $1`, [s])).toEqual([{ pet_id: pet }]);
  });

  it("moving to tomorrow keeps the time the date carried, in the home's timezone", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId, { schema: [{ id: "when", name: "When", type: "date" }] });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const id = await item(s, "Dentist", { when: `${today}T10:30` }, new Date().toISOString());
    expect(await A.moveItemToTomorrow(id)).toEqual({ ok: true });
    const [row] = await sql<{ props: { when: string }; due_at: Date }>(`select props, due_at from items where id = $1`, [id]);
    expect(row.props.when).toMatch(/T10:30$/);
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(row.due_at))).toBe("10:30");
  });

  it("moves a dated item to tomorrow", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId);
    const id = await item(s, "Call", {}, "2026-01-01T09:00:00Z");
    expect(await A.moveItemToTomorrow(id)).toEqual({ ok: true });
    const [row] = await sql<{ due_at: Date }>(`select due_at from items where id = $1`, [id]);
    expect(new Date(row.due_at).toISOString()).toBe("2026-01-02T09:00:00.000Z");
  });
});

describe("meals", () => {
  it("plans a meal, stores ingredients, and shops for what's missing", async () => {
    const home = await homeWith(["owner"]);
    const recipes = await space(home.householdId, { template: "recipes", view: "gallery" });
    const groceries = await space(home.householdId, { template: "groceries", view: "checklist" });
    const fridge = await space(home.householdId, { view: "fridge" });
    const pasta = await item(recipes, "Pasta");
    await item(fridge, "Tomatoes");
    await item(groceries, "Basil");
    expect(await A.saveIngredients(pasta, "Pasta\nTomatoes\nBasil\nParmesan")).toEqual({ ok: true });
    expect(await A.planMeal("2026-11-02", pasta)).toEqual({ ok: true });
    expect(await A.planMeal("2026-11-02", pasta)).toEqual({ ok: true });
    const res = await A.shopForPlan("2026-11-01", "2026-11-07");
    expect(res).toEqual({ ok: true, data: { added: ["Pasta", "Parmesan"] } });
    expect((await sql(`select title from items where section_id = $1 order by title`, [groceries])).map((r) => r.title)).toEqual(["Basil", "Parmesan", "Pasta"]);
    expect(await A.planMeal("2026-11-02", null)).toEqual({ ok: true });
    expect(await sql(`select 1 from meal_plan where household_id = $1`, [home.householdId])).toEqual([]);
    expect(await A.planMeal("Monday", pasta)).toEqual({ ok: false, error: "bad day" });
  });
});

describe("money", () => {
  it("sets and clears budgets; sets a bill's amount", async () => {
    const home = await homeWith(["owner", "child"]);
    expect(await A.setBudget("food", 1500)).toEqual({ ok: true });
    expect(await A.setBudget("food", 1800)).toEqual({ ok: true });
    expect(await sql(`select amount::int from money_budgets where household_id = $1`, [home.householdId])).toEqual([{ amount: 1800 }]);
    expect(await A.setBudget("food", null)).toEqual({ ok: true });
    expect(await sql(`select 1 from money_budgets where household_id = $1`, [home.householdId])).toEqual([]);
    expect(await A.setBudget("Food!", 1)).toEqual({ ok: false, error: "bad input" });
    expect(await A.setBudget("food", -1)).toEqual({ ok: false, error: "bad input" });
    const bills = await space(home.householdId, { template: "bills" });
    const bill = await item(bills, "Electric", { keep: 1 });
    expect(await A.setBillAmount(bill, 420)).toEqual({ ok: true });
    expect((await sql<{ props: Record<string, unknown> }>(`select props from items where id = $1`, [bill]))[0].props).toMatchObject({ keep: 1 });
    signIn(home.users.child);
    expect((await A.setBudget("fun", 5)).ok).toBe(false);
  });
});

describe("guest links", () => {
  it("a sitter link ticks only its own space, until revoked", async () => {
    const home = await homeWith(["owner"]);
    const walks = await space(home.householdId, { title: "Walks" });
    const privateSpace = await space(home.householdId, { owner_id: home.users.owner });
    const elsewhere = await space(home.householdId, { title: "Other" });
    const walk = await item(walks, "Evening walk");
    const other = await item(elsewhere, "Not yours");
    expect(await A.createGuestLink({ sectionId: privateSpace, includeInfo: false, days: 3, label: "Dana" })).toEqual({ ok: false, error: "not allowed" });
    const link = await A.createGuestLink({ sectionId: walks, includeInfo: true, days: 99, label: " Dana " });
    if (!link.ok) throw new Error(link.error);
    signIn(null);
    expect(await A.guestTick(link.data.token, walk)).toEqual({ ok: true });
    expect(await sql(`select done from items where id = $1`, [walk])).toEqual([{ done: true }]);
    expect(await A.guestTick(link.data.token, other)).toEqual({ ok: false, error: "not allowed" });
    expect(await A.guestTick("nope", walk)).toEqual({ ok: false, error: "expired" });
    signIn(home.users.owner);
    expect(await A.revokeGuestLink(link.data.token)).toEqual({ ok: true });
    expect(await A.guestTick(link.data.token, walk)).toEqual({ ok: false, error: "expired" });
  });

  it("on a tracker, a guest's tick is today's check-in under their name", async () => {
    const home = await homeWith(["owner"]);
    const tracker = await space(home.householdId, { view: "tracker" });
    const meds = await item(tracker, "Meds");
    const link = await A.createGuestLink({ sectionId: tracker, includeInfo: false, days: 1, label: "" });
    if (!link.ok) throw new Error(link.error);
    expect(await A.guestTick(link.data.token, meds)).toEqual({ ok: true });
    expect(await sql(`select user_id, guest_label from checkins where item_id = $1`, [meds])).toEqual([{ user_id: null, guest_label: "Guest" }]);
  });

  it("children and guests can't make links", async () => {
    const home = await homeWith(["owner", "child"]);
    signIn(home.users.child);
    expect(await A.createGuestLink({ sectionId: null, includeInfo: true, days: 1, label: "" })).toEqual({ ok: false, error: "not allowed" });
  });
});

describe("Brain", () => {
  const def = (sectionId?: string) => ({
    name: "Morning",
    trigger: { type: "schedule", days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00"] },
    actions: [{ type: "push", title: "Hi", body: "Morning" }, ...(sectionId ? [{ type: "open_section", sectionId, label: "Open" }] : [])],
  });

  it("saves, toggles, runs and deletes an automation", async () => {
    const home = await homeWith(["owner", "adult"]);
    const s = await space(home.householdId);
    const saved = await A.saveAutomation(null, def(s), home.users.adult);
    expect(saved.ok).toBe(true);
    const [row] = await sql<{ target_user_id: string; next_run_at: Date | null }>(`select target_user_id, next_run_at from automations where id = $1`, [saved.id]);
    expect(row.target_user_id).toBe(home.users.adult);
    expect(row.next_run_at).not.toBeNull();
    expect(await A.toggleAutomation(saved.id!, false)).toEqual({ ok: true });
    expect(await sql(`select enabled, next_run_at from automations where id = $1`, [saved.id])).toEqual([{ enabled: false, next_run_at: null }]);
    app.pushes = [];
    const ran = await A.runAutomationNow(saved.id!);
    expect(ran.ok).toBe(true);
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.adult]);
    await expect(A.deleteAutomation(saved.id!)).rejects.toThrow(Redirect);
    expect(await sql(`select 1 from automations where id = $1`, [saved.id])).toEqual([]);
    expect(await sql(`select count(*)::int as open from runs where automation_id is null and acknowledged_at is null and user_id = $1`, [home.users.adult])).toEqual([{ open: 0 }]);
  });

  it("rejects bad definitions and spaces outside the home", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    const theirs = await space(other.householdId);
    signIn(home.users.owner);
    expect((await A.saveAutomation(null, { name: "" }, home.users.owner)).ok).toBe(false);
    expect(await A.saveAutomation(null, def(theirs), home.users.owner)).toEqual({ ok: false, error: "This automation points at a space outside your home." });
  });

  it("recipes: one-tap add, once per person when it's for both", async () => {
    const home = await homeWith(["owner", "adult"]);
    await space(home.householdId, { view: "wheel" });
    await space(home.householdId, { template: "groceries", view: "checklist" });
    expect(await A.addRecipe("date_night")).toEqual({ ok: true });
    expect(await A.addRecipe("supermarket")).toEqual({ ok: true });
    expect(await A.addRecipe("love_note")).toEqual({ ok: true });
    expect(await sql(`select name, target_user_id = $2 as mine from automations where household_id = $1 order by name, 2`, [home.householdId, home.users.owner])).toEqual([
      { name: "Date night", mine: false },
      { name: "Date night", mine: true },
      { name: "Morning love note", mine: true },
      { name: "Supermarket list", mine: true },
    ]);
    expect(await A.addRecipe("nope" as never)).toEqual({ ok: false, error: "unknown recipe" });
  });
});

describe("runs and dates", () => {
  it("marking a tracker reminder done checks today in; undo removes it", async () => {
    const home = await homeWith(["owner"]);
    const tracker = await space(home.householdId, { view: "tracker" });
    const meds = await item(tracker, "Meds");
    const [{ id: run }] = await sql<{ id: string }>(`insert into runs (user_id, household_id, title, item_id) values ($1, $2, 'Meds', $3) returning id`, [home.users.owner, home.householdId, meds]);
    await A.markRun(run, true);
    expect(await sql(`select status from checkins where item_id = $1`, [meds])).toEqual([{ status: "done" }]);
    await A.markRun(run, false);
    expect(await sql(`select 1 from checkins where item_id = $1`, [meds])).toEqual([]);
    await A.dismissRun(run);
    expect((await sql<{ acknowledged_at: unknown }>(`select acknowledged_at from runs where id = $1`, [run]))[0].acknowledged_at).not.toBeNull();
  });

  it("handling a one-time date finishes the item; un-handling reopens it", async () => {
    const home = await homeWith(["owner"]);
    const dates = await space(home.householdId, { view: "dates" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const id = await item(dates, "Passport", { _dates: { date: today, repeat: "once", from: "09:00", until: "21:00", every: 2, ahead: 0, carry: false } });
    await A.handleDate(id, true);
    expect(await sql(`select done from items where id = $1`, [id])).toEqual([{ done: true }]);
    await A.handleDate(id, false);
    expect(await sql(`select done from items where id = $1`, [id])).toEqual([{ done: false }]);
  });

  it("the wake button fires wake automations", async () => {
    const home = await homeWith(["owner"]);
    await sql(`insert into automations (household_id, owner_id, target_user_id, name, trigger, actions, enabled) values ($1, $2, $2, 'Wake', '{"type":"event","event":"wake","delayMinutes":0}', '[{"type":"push","title":"Up","body":"Morning"}]', true)`, [home.householdId, home.users.owner]);
    expect(await A.emitEvent("wake", "button")).toMatchObject({ fired: 1 });
    expect(await A.emitEvent("wake", "first_open")).toEqual({ fired: 0 });
  });
});

describe("pets", () => {
  it("saves a pet, logs weight, starts a bag, reorders food, deletes", async () => {
    const home = await homeWith(["owner"]);
    const supplies = await space(home.householdId, { template: "dog-supplies", view: "checklist" });
    const saved = await A.savePet(null, { name: "Rex", daily_grams: 300, food_bag_kg: 12 });
    expect(saved.ok).toBe(true);
    expect((await A.savePet(saved.id!, { name: "Rexy" })).ok).toBe(true);
    expect(await A.logPetWeight(saved.id!, 21.5)).toEqual({ ok: true });
    expect(await A.logPetWeight(saved.id!, 22)).toEqual({ ok: true });
    expect(await A.logPetWeight(saved.id!, 0)).toEqual({ ok: false, error: "Invalid weight" });
    expect(await sql(`select kg::float from pet_weights where pet_id = $1`, [saved.id])).toEqual([{ kg: 22 }]);
    expect(await A.newFoodBag(saved.id!)).toEqual({ ok: true });
    expect(await A.reorderFood(saved.id!)).toEqual({ ok: true });
    expect(await A.reorderFood(saved.id!)).toEqual({ ok: true });
    expect(await sql(`select count(*)::int as n from items where section_id = $1`, [supplies])).toEqual([{ n: 1 }]);
    await expect(A.deletePet(saved.id!)).rejects.toThrow(Redirect);
    expect(await sql(`select 1 from pets where id = $1`, [saved.id])).toEqual([]);
    expect((await A.savePet(null, { name: "" })).ok).toBe(false);
  });
});

describe("Google", () => {
  it("disconnecting Gmail revokes access only when no other space uses the inbox", async () => {
    const home = await homeWith(["owner"]);
    const a = await space(home.householdId, { view: "subscriptions" });
    const b = await space(home.householdId, { view: "subscriptions" });
    for (const s of [a, b]) await sql(`insert into gmail_connections (section_id, user_id, email, refresh_token) values ($1, $2, 'me@gmail.com', $3)`, [s, home.users.owner, sealToken("rt")]);
    app.outbound = [];
    expect(await A.disconnectGmail(a)).toEqual({ ok: true });
    expect(app.outbound.filter((u) => u.includes("revoke"))).toEqual([]);
    expect(await A.disconnectGmail(b)).toEqual({ ok: true });
    expect(app.outbound.filter((u) => u.includes("revoke"))).toHaveLength(1);
    expect(await A.disconnectGmail(b)).toEqual({ ok: true });
  });

  it("calendar: not connected is said plainly; disconnect revokes", async () => {
    const home = await homeWith(["owner"]);
    const s = await space(home.householdId);
    const id = await item(s, "Dentist", {}, "2026-11-03T08:00:00Z");
    expect(await A.syncItemToCalendar(id)).toEqual({ ok: false, error: "not_connected" });
    await sql(`insert into calendar_connections (user_id, email, refresh_token) values ($1, 'me@gmail.com', $2)`, [home.users.owner, sealToken("rt")]);
    app.outbound = [];
    expect(await A.disconnectCalendar()).toEqual({ ok: true });
    expect(app.outbound.some((u) => u.includes("revoke"))).toBe(true);
    expect(await sql(`select 1 from calendar_connections where user_id = $1`, [home.users.owner])).toEqual([]);
  });
});
