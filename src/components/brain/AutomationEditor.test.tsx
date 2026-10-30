// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { app, homeWith, router, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { AutomationDef } from "@/lib/engine/types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { AutomationEditor } = await import("./AutomationEditor");

beforeAll(startApp, 120_000);

const blank: AutomationDef = { name: "", icon: "⚡", enabled: true, trigger: { type: "schedule", days: [0, 1, 2, 3, 4], times: ["09:00"] }, conditions: [], actions: [] };

async function setup(id: string | null = null, initial = blank) {
  const home = await homeWith(["owner", "adult"]);
  const members = [
    { id: home.users.owner, name: "Niv", emoji: "🦊" },
    { id: home.users.adult, name: "Dana", emoji: "🐻" },
  ];
  const ui = renderUi(<AutomationEditor id={id} initial={initial} initialTarget={home.users.owner} userId={home.users.owner} members={members} sections={[]} />);
  return { ...ui, home };
}

describe("Brain editor", () => {
  it("builds a schedule with a notification for Dana and saves it", async () => {
    const { user, t, home } = await setup();
    await user.type(screen.getByLabelText(t.brain.name), "Water plants");
    await user.click(screen.getByRole("button", { name: /Dana/ }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.brain.addAction) }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.actions.push) }));
    await user.type(screen.getByLabelText(t.actions.title), "Plants");
    await user.type(screen.getByLabelText(t.actions.body), "Water them");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/brain"));
    const [row] = await sql<{ name: string; target_user_id: string; actions: unknown[]; next_run_at: unknown }>(`select name, target_user_id, actions, next_run_at from automations where household_id = $1`, [home.householdId]);
    expect(row).toMatchObject({ name: "Water plants", target_user_id: home.users.adult, actions: [{ type: "push", title: "Plants", body: "Water them" }] });
    expect(row.next_run_at).not.toBeNull();
  });

  it("an automation with nothing to do shows why it can't be saved", async () => {
    const { user, t, home } = await setup();
    await user.type(screen.getByLabelText(t.brain.name), "Empty");
    await user.click(screen.getByRole("button", { name: t.common.save }));
    expect(await screen.findByText(/actions/)).toBeInTheDocument();
    expect(await sql(`select 1 from automations where household_id = $1`, [home.householdId])).toEqual([]);
  });

  it("an existing one: switch off and save; run now sends it", async () => {
    const home = await homeWith(["owner"]);
    const def: AutomationDef = { ...blank, name: "Hello", actions: [{ type: "push", title: "Hi", body: "There" }] };
    const [{ id }] = await sql<{ id: string }>(`insert into automations (household_id, owner_id, target_user_id, name, trigger, actions) values ($1, $2, $2, 'Hello', $3, $4) returning id`, [home.householdId, home.users.owner, def.trigger, JSON.stringify(def.actions)]);
    const { user, t } = renderUi(<AutomationEditor id={id} initial={def} initialTarget={home.users.owner} userId={home.users.owner} members={[{ id: home.users.owner, name: "Niv", emoji: "🦊" }]} sections={[]} />);
    app.pushes = [];
    await user.click(screen.getByRole("button", { name: t.brain.test }));
    expect(await screen.findByText(t.brain.tested)).toBeInTheDocument();
    expect(app.pushes).toHaveLength(1);
    await user.click(screen.getByRole("switch", { name: t.brain.active }));
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(async () => expect(await sql(`select enabled, next_run_at from automations where id = $1`, [id])).toEqual([{ enabled: false, next_run_at: null }]));
  });

  it("an event trigger with a delay, and reordering actions", async () => {
    const { user, t, home } = await setup();
    await user.type(screen.getByLabelText(t.brain.name), "Home");
    await user.click(screen.getByRole("button", { name: new RegExp(t.brain.event) }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.events.arrive_home) }));
    for (const kind of [t.actions.push, t.actions.checkoff]) {
      await user.click(screen.getByRole("button", { name: new RegExp(t.brain.addAction) }));
      await user.click(screen.getByRole("button", { name: new RegExp(kind) }));
    }
    await user.type(screen.getByLabelText(t.actions.title), "Welcome");
    await user.click(screen.getAllByRole("button", { name: t.common.moveUp }).at(-1)!);
    await user.click(screen.getByRole("button", { name: t.common.save }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const [row] = await sql<{ trigger: { event: string }; actions: { type: string }[] }>(`select trigger, actions from automations where household_id = $1`, [home.householdId]);
    expect(row.trigger.event).toBe("arrive_home");
    expect(row.actions.map((a) => a.type)).toEqual(["checkoff", "push"]);
  });
});
