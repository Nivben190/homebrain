import { expect, test } from "@playwright/test";
import { REAL, newHome, signIn as signInAs } from "./helpers";

const stamp = `e2e-${Date.now()}`;
let who = REAL ?? { email: "", password: "" };

test.skip(!!REAL && (!REAL.email || !REAL.password), "Against a deployment, set E2E_EMAIL and E2E_PASSWORD for a dedicated test account");
test.beforeAll(async () => {
  if (!REAL) who = (await newHome(["owner"])).people.owner;
});

const signIn = (page: Parameters<typeof signInAs>[0]) => signInAs(page, who);

test.describe.serial("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("create a space with a custom property, add and check items", async ({ page }) => {
    await page.goto("/sections");
    await page.getByRole("button", { name: "New space" }).click();
    await page.getByRole("button", { name: /Blank/ }).first().click();
    await page.getByRole("textbox").first().fill(stamp);
    await page.getByRole("button", { name: /^Create/ }).last().click();
    await expect(page.getByRole("heading", { name: stamp })).toBeVisible();

    // A blank space starts as a plain list; make it a checklist, with a custom property.
    await page.getByRole("button", { name: "Space settings" }).click();
    await page.getByRole("button", { name: /Checklist/ }).first().click();
    await page.getByRole("button", { name: /Add property/ }).click();
    await page.getByPlaceholder(/Property name/).fill("Price");
    await page.getByRole("button", { name: /^Save/ }).last().click();

    for (const title of ["Milk", "Eggs"]) {
      await page.getByPlaceholder(/Add an item/).fill(title);
      await page.keyboard.press("Enter");
      await expect(page.getByText(title)).toBeVisible();
    }
    await page.getByRole("checkbox").first().click();
    await expect(page.getByText(/Show done \(1\)/)).toBeVisible();
  });

  test("Hebrew flips the layout to right-to-left", async ({ page }) => {
    await page.goto("/me");
    await page.getByRole("button", { name: "עברית" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("build an automation in the editor", async ({ page }) => {
    await page.goto("/brain/new");
    await page.getByPlaceholder(/name/i).first().fill(stamp);
    await page.getByRole("textbox", { name: "Title" }).fill("Good morning");
    await page.getByRole("button", { name: /^Save/ }).last().click();
    await page.waitForURL((u) => u.pathname === "/brain");
    await expect(page.getByText(stamp).first()).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    // Clean up what this run created on a real deployment; a throwaway home just goes away.
    if (!REAL) return;
    const page = await browser.newPage();
    await signIn(page);
    await page.goto("/brain");
    const automation = page.getByText(stamp).first();
    if (await automation.isVisible()) {
      await automation.click();
      await page.getByRole("button", { name: /Delete/ }).click();
    }
    await page.goto("/sections");
    const space = page.getByText(stamp).first();
    if (await space.isVisible()) {
      await space.click();
      await page.getByRole("button", { name: "Space settings" }).click();
      await page.getByRole("button", { name: /Delete space/ }).click();
      await page.getByRole("button", { name: /Delete/ }).last().click();
    }
    await page.close();
  });
});
