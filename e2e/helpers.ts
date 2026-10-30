import { expect, type Browser, type Page } from "@playwright/test";

export const FAKE = "http://localhost:54329";
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
/** Against a real deployment, a dedicated account instead of throwaway homes. */
export const REAL = process.env.E2E_BASE_URL ? { email: process.env.E2E_EMAIL ?? "", password: process.env.E2E_PASSWORD ?? "" } : null;

type Person = { id: string; email: string; password: string };
export type Home = { householdId: string; people: Record<string, Person> };

/** A fresh home in the stand-in Supabase, one member per role. */
export async function newHome(roles: string[] = ["owner"]): Promise<Home> {
  const res = await fetch(`${FAKE}/__test/home`, { method: "POST", body: JSON.stringify({ roles }) });
  if (!res.ok) throw new Error(`seeding failed: ${res.status}`);
  return res.json();
}

/** Straight SQL on the stand-in database, as the service (setup and checks only). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`${FAKE}/__test/sql`, { method: "POST", body: JSON.stringify({ text, params }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.context().addCookies([{ name: "hb_locale", value: "en", url: BASE }]);
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(who.email);
  await page.getByPlaceholder("Password").fill(who.password);
  await page.getByRole("button", { name: /Sign in/ }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A second phone: its own browser context, signed in as someone else. */
export async function phone(browser: Browser, who: Person) {
  const context = await browser.newContext({ ...(await import("@playwright/test")).devices["iPhone 14"], baseURL: BASE });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

/** Page errors that matter (realtime can't connect to the stand-in, which is expected). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${new URL(page.url()).pathname}: ${e.message.split("\n")[0]}`));
  return () => expect(errors.filter((e) => !/realtime|websocket/i.test(e))).toEqual([]);
}
