import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "";
const password = process.env.E2E_PASSWORD ?? "";
const stamp = `e2e-${Date.now()}`;

test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for a dedicated test account");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/ }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe.serial("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: "hb_locale", value: "en", url: test.info().project.use.baseURL! }]);
    await signIn(page);
  });

  test("create a space with a custom property, add and check items", async ({ page }) => {
    await page.goto("/sections");
    await page.getByRole("button", { name: "New space" }).click();
    await page.getByRole("button", { name: /Blank/ }).first().click();
    await page.getByRole("textbox").first().fill(stamp);
    await page.getByRole("button", { name: /Checklist/ }).first().click();
    await page.getByRole("button", { name: /^Create/ }).last().click();
    await expect(page.getByRole("heading", { name: stamp })).toBeVisible();

    // Custom property from the space settings.
    await page.getByRole("button", { name: "Space settings" }).click();
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
    await page.getByRole("button", { name: /^Save/ }).last().click();
    await page.waitForURL(/\/brain/);
    await expect(page.getByText(stamp)).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    // Clean up: delete what this run created.
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
