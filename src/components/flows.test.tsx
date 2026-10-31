// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { OnboardingForm } = await import("@/app/onboarding/OnboardingForm");
const { default: LoginPage } = await import("@/app/login/page");
const { GuestScreen } = await import("@/app/g/[token]/GuestScreen");
const { MealPlanner } = await import("./meals/MealPlanner");
const { PetForm } = await import("./pets/PetForm");
const { createGuestLink } = await import("@/app/actions");

beforeAll(startApp, 120_000);
beforeEach(() => {
  router.replace.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("first steps", () => {
  it("onboarding asks who lives here, creates a home with the spaces that fit, and opens Help me choose", async () => {
    const [{ id }] = await sql<{ id: string }>(`insert into auth.users (email) values ('new-person@test') returning id`);
    signIn(id);
    const { user, t } = renderUi(<OnboardingForm defaultName="" />);
    await user.type(screen.getByLabelText(t.onboarding.name), "Maya");
    await user.type(screen.getByLabelText(t.onboarding.homeName), "The Nest");
    await user.click(screen.getByRole("button", { name: t.onboarding.kinds.solo }));
    await user.click(screen.getByRole("switch", { name: t.onboarding.dog }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.onboarding.start) }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sections?find=1"));
    expect((await sql<{ template: string }>(`select template from sections s join profiles p on p.household_id = s.household_id where p.user_id = $1 and template is not null order by s.position`, [id])).map((s) => s.template)).toEqual(["groceries", "cleaning", "dog-care"]);
    const [p] = await sql<{ display_name: string; role: string; name: string }>(`select p.display_name, p.role, h.name from profiles p join households h on h.id = p.household_id where p.user_id = $1`, [id]);
    expect(p).toEqual({ display_name: "Maya", role: "owner", name: "The Nest" });
  });

  it("onboarding with a wrong code says so and stays", async () => {
    const [{ id }] = await sql<{ id: string }>(`insert into auth.users (email) values ('lost-person@test') returning id`);
    signIn(id);
    const { user, t } = renderUi(<OnboardingForm defaultName="Lost" invite="NOPE0000" />);
    await user.click(screen.getByRole("button", { name: new RegExp(t.onboarding.join) }));
    await waitFor(() => expect(document.querySelector(".text-danger")).not.toBeNull());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("login: an invited person creates an account and is signed in; a wrong password is refused", async () => {
    const home = await homeWith(["owner"]);
    const [{ invite_code }] = await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [home.householdId]);
    signIn(null);
    window.history.replaceState(null, "", `/login?invite=${invite_code}`);
    const { user, t, unmount } = renderUi(<LoginPage />);
    await user.type(screen.getByPlaceholderText(t.login.email), "Friend@Example.com");
    await user.type(screen.getByPlaceholderText(t.login.newPassword), "longenough");
    // The mode switch and the submit button share the label; submit is the last.
    await user.click(screen.getAllByRole("button", { name: new RegExp(t.login.createAccount) }).at(-1)!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(await sql(`select 1 from auth.users where email = 'friend@example.com'`)).toHaveLength(1);
    unmount();

    window.history.replaceState(null, "", "/login");
    renderUi(<LoginPage />);
    await user.type(screen.getByPlaceholderText(t.login.email), "friend@example.com");
    await user.type(screen.getByPlaceholderText(t.login.password), "wrong-one");
    await user.click(screen.getAllByRole("button", { name: new RegExp(t.login.signIn) }).at(-1)!);
    expect(await screen.findByText(t.failures.invalidLogin)).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});

describe("the sitter's page", () => {
  it("a guest ticks a walk; it stays ticked and is saved", async () => {
    const home = await homeWith(["owner"]);
    const [{ id: s }] = await sql<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Walks') returning id`, [home.householdId]);
    const [{ id: walk }] = await sql<{ id: string }>(`insert into items (section_id, title) values ($1, 'Evening walk') returning id`, [s]);
    const link = await createGuestLink({ sectionId: s, includeInfo: false, days: 1, label: "Dana" });
    if (!link.ok) throw new Error(link.error);
    signIn(null);
    const { user } = renderUi(<GuestScreen token={link.data.token} home="Our home" label="Dana" expiresAt={new Date(Date.now() + 86_400_000).toISOString()} section={{ title: "Walks", icon: "🐕", tracker: false }} items={[{ id: walk, title: "Evening walk", done: false }]} info={null} />);
    expect(screen.getByText(/Dana/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Evening walk/ }));
    await waitFor(async () => expect(await sql(`select done from items where id = $1`, [walk])).toEqual([{ done: true }]));
    expect(screen.getByRole("button", { name: /Evening walk/ })).toBeDisabled();
  });

  it("an expired link undoes the tick and says it has expired", async () => {
    signIn(null);
    const { user, t } = renderUi(<GuestScreen token={"0".repeat(32)} home="Home" label="" expiresAt={new Date().toISOString()} section={{ title: "Walks", icon: "🐕", tracker: false }} items={[{ id: crypto.randomUUID(), title: "Walk", done: false }]} info={null} />);
    await user.click(screen.getByRole("button", { name: /Walk/ }));
    expect(await screen.findByText(t.guest.expired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Walk/ })).toBeEnabled();
  });
});

describe("meals and pets", () => {
  it("plans the week and puts what's missing on the list", async () => {
    const home = await homeWith(["owner"]);
    const [{ id: recipes }] = await sql<{ id: string }>(`insert into sections (household_id, title, template, view) values ($1, 'Recipes', 'recipes', 'gallery') returning id`, [home.householdId]);
    const [{ id: groceries }] = await sql<{ id: string }>(`insert into sections (household_id, title, template, view) values ($1, 'Groceries', 'groceries', 'checklist') returning id`, [home.householdId]);
    const [{ id: pasta }] = await sql<{ id: string }>(`insert into items (section_id, title, props) values ($1, 'Pasta', '{"_ingredients":["Pasta","Basil"]}') returning id`, [recipes]);
    const days = ["2026-11-02", "2026-11-03"];
    const { user, t } = renderUi(<MealPlanner days={days} recipes={[{ id: pasta, title: "Pasta", ingredients: ["Pasta", "Basil"] }]} plan={{}} />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], pasta);
    await waitFor(async () => expect(await sql(`select day::text from meal_plan where household_id = $1`, [home.householdId])).toEqual([{ day: "2026-11-02" }]));
    await user.click(screen.getByRole("button", { name: new RegExp(t.meals.shop) }));
    await waitFor(async () => expect((await sql(`select title from items where section_id = $1 order by title`, [groceries])).map((r) => r.title)).toEqual(["Basil", "Pasta"]));
  });

  it("a new pet with a food bag starts counting the bag", async () => {
    const home = await homeWith(["owner"]);
    const { user, t } = renderUi(<PetForm />);
    await user.type(screen.getByLabelText(t.pets.name), "Rex");
    await user.type(screen.getByLabelText(`🦴 ${t.pets.bagKg}`), "12");
    await user.type(screen.getByLabelText(t.pets.dailyGrams), "300");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(async () => expect(await sql(`select name, food_bag_kg::float as kg, bag_started is not null as counting from pets where household_id = $1`, [home.householdId])).toEqual([{ name: "Rex", kg: 12, counting: true }]));
    expect(router.replace.mock.calls[0][0]).toMatch(/^\/pets\//);
  });
});
