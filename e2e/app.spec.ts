import { expect, test } from "@playwright/test";
import { REAL, newHome, phone, signIn, sql, watchErrors } from "./helpers";

// Whole-app checks in a real browser, each in its own throwaway home. They need
// the stand-in Supabase (the default), not a real deployment.
test.skip(!!REAL, "Runs against the stand-in Supabase only");

const space = async (householdId: string, title: string, view = "checklist", template: string | null = null) =>
  (await sql<{ id: string }>(`insert into sections (household_id, title, view, template) values ($1, $2, $3, $4) returning id`, [householdId, title, view, template]))[0].id;

test("every main screen opens without errors", async ({ page }) => {
  test.setTimeout(300_000); // each screen compiles on first visit in dev
  const home = await newHome(["owner", "adult"]);
  const list = await space(home.householdId, "Groceries", "checklist", "groceries");
  await sql(`insert into items (section_id, title) values ($1, 'Milk')`, [list]);
  const [pet] = await sql<{ id: string }>(`insert into pets (household_id, name, emoji, food_bag_kg, daily_grams, bag_started) values ($1, 'Rex', '🐕', 12, 300, now()::date) returning id`, [home.householdId]);
  const check = watchErrors(page);
  await signIn(page, home.people.owner);
  for (const [path, heading] of [
    ["/", null],
    ["/sections", "Spaces"],
    [`/sections/${list}`, "Groceries"],
    ["/brain", null],
    ["/brain/new", null],
    ["/calendar", "Calendar"],
    ["/money", "Money"],
    ["/weekly", null],
    ["/meals", null],
    ["/home-info", null],
    ["/me", null],
    ["/me/iphone", null],
    [`/pets/${pet.id}`, "Rex"],
    ["/pets/new", null],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("main, nav").first()).toBeVisible();
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
  check();
});

test("Today greets you and shows what's on, with the tab bar", async ({ page }) => {
  const home = await newHome(["owner"]);
  const list = await space(home.householdId, "Errands");
  await sql(`insert into items (section_id, title, due_at) values ($1, 'Pick up the parcel', now() + interval '2 hours')`, [list]);
  const check = watchErrors(page);
  await signIn(page, home.people.owner);
  await page.goto("/");
  await expect(page.getByText(/Good (morning|afternoon|evening|night)|Hi|Hello/i).first()).toBeVisible();
  await expect(page.getByText("Pick up the parcel")).toBeVisible();
  await expect(page.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  check();
});

test("ask your partner, and they mark it done on their phone", async ({ page, browser }) => {
  const home = await newHome(["owner", "adult"]);
  await signIn(page, home.people.owner);
  await page.goto("/");
  await page.getByRole("button", { name: "Ask Dan" }).click();
  await page.getByPlaceholder(/Can you buy milk/).fill("Take out the recycling");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Waiting on Dan:")).toBeVisible();

  const dan = await phone(browser, home.people.adult);
  await dan.goto("/");
  await dan.waitForLoadState("networkidle");
  await expect(dan.getByText("Take out the recycling")).toBeVisible();
  await dan.getByRole("button", { name: "Done ✓" }).click();
  await expect.poll(async () => (await sql<{ status: string }>(`select status from requests where household_id = $1`, [home.householdId]))[0]?.status).toBe("done");
  await dan.context().close();
});

test("no signal: a tick waits on the phone, then goes up once back online", async ({ page, context }) => {
  const home = await newHome(["owner"]);
  const list = await space(home.householdId, "Shopping");
  await sql(`insert into items (section_id, title) values ($1, 'Bread')`, [list]);
  await signIn(page, home.people.owner);
  await page.goto(`/sections/${list}`);
  await expect(page.getByText("Bread")).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("checkbox").first().click();
  await expect(page.getByRole("status")).toContainText(/1/);
  expect((await sql<{ done: boolean }>(`select done from items where section_id = $1`, [list]))[0].done).toBe(false);

  await context.setOffline(false);
  await expect.poll(async () => (await sql<{ done: boolean }>(`select done from items where section_id = $1`, [list]))[0].done, { timeout: 20_000 }).toBe(true);
});

test("swipe a fridge item aside to delete it", async ({ page }) => {
  const home = await newHome(["owner"]);
  const fridge = await space(home.householdId, "Fridge", "fridge", "fridge");
  await sql(`insert into items (section_id, title) values ($1, 'Yogurt')`, [fridge]);
  await signIn(page, home.people.owner);
  await page.goto(`/sections/${fridge}`);
  const row = page.getByText("Yogurt");
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.mouse.down();
  for (let dx = 10; dx <= 140; dx += 10) await page.mouse.move(box.x + box.width / 2 + 60 - dx, box.y + box.height / 2);
  await page.mouse.up();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => (await sql(`select 1 from items where section_id = $1`, [fridge])).length, { timeout: 15_000 }).toBe(0);
});

test("Hebrew: the whole app reads right to left", async ({ page }) => {
  const home = await newHome(["owner"]);
  await sql(`update profiles set locale = 'he' where user_id = $1`, [home.people.owner.id]);
  await signIn(page, home.people.owner);
  await page.goto("/sections");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "מרחבים" })).toBeVisible();
});
