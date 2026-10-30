// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { app, homeWith, router, signIn, sql, startApp } from "@/test/app";
import { renderUi } from "@/test/ui";
import type { RequestRow } from "@/lib/db-types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { AskSheet, RequestCards } = await import("./today/Requests");
const { MembersCard } = await import("./settings/MembersCard");
const { GuestLinks } = await import("./home/GuestLinks");
const { YourDataCard } = await import("./settings/YourDataCard");
const { InviteLinkButton } = await import("./InviteLinkButton");

beforeAll(startApp, 120_000);
beforeEach(() => {
  vi.stubGlobal("confirm", () => true);
});

describe("asking someone at home", () => {
  it("picks who, writes it, sends it, and they get a push", async () => {
    const home = await homeWith(["owner", "adult", "teen"]);
    const members = [
      { id: home.users.adult, name: "Dana", emoji: "🐻" },
      { id: home.users.teen, name: "Noa", emoji: "🐱" },
    ];
    app.pushes = [];
    const { user, t } = renderUi(<AskSheet open onClose={() => {}} members={members} />);
    await user.click(screen.getByRole("button", { name: /Noa/ }));
    await user.type(screen.getByPlaceholderText(t.ask.placeholder), "Walk the dog");
    await user.click(screen.getByRole("button", { name: t.ask.tomorrow }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.ask.send) }));
    await waitFor(async () => expect(await sql(`select text, to_user, due_day is not null as dated from requests where household_id = $1`, [home.householdId])).toEqual([{ text: "Walk the dog", to_user: home.users.teen, dated: true }]));
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.teen]);
  });

  it("the one asked marks it done or can't; the asker can withdraw theirs", async () => {
    const home = await homeWith(["owner", "adult"]);
    const ask = async (text: string, from: string, to: string) =>
      (await sql<RequestRow>(`insert into requests (household_id, from_user, to_user, text) values ($1, $2, $3, $4) returning *`, [home.householdId, from, to, text]))[0];
    const a = await ask("Buy milk", home.users.owner, home.users.adult);
    const b = await ask("Call mom", home.users.owner, home.users.adult);
    const mine = await ask("Fix bike", home.users.adult, home.users.owner);
    const members = [
      { id: home.users.owner, name: "Niv", emoji: "🦊" },
      { id: home.users.adult, name: "Dana", emoji: "🐻" },
    ];
    signIn(home.users.adult);
    const { user, t } = renderUi(<RequestCards incoming={[a, b]} outgoing={[mine]} members={members} />);
    await user.click(screen.getAllByRole("button", { name: t.ask.done })[0]);
    await user.click(screen.getAllByRole("button", { name: t.ask.cant }).at(-1)!);
    await user.click(screen.getByRole("button", { name: t.common.delete }));
    await waitFor(async () =>
      expect(await sql(`select text, status from requests where household_id = $1 order by text`, [home.householdId])).toEqual([
        { text: "Buy milk", status: "done" },
        { text: "Call mom", status: "declined" },
      ]),
    );
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("members", () => {
  it("the owner changes a role, removes someone and makes a new code", async () => {
    const home = await homeWith(["owner", "adult", "child"]);
    const roster = [
      { id: home.users.owner, name: "Niv", emoji: "🦊", role: "owner" as const },
      { id: home.users.adult, name: "Dana", emoji: "🐻", role: "adult" as const },
      { id: home.users.child, name: "Noa", emoji: "🐱", role: "child" as const },
    ];
    const { user, t } = renderUi(<MembersCard members={roster} userId={home.users.owner} />);
    await user.selectOptions(screen.getAllByLabelText(t.members.role)[1], "teen");
    await user.click(screen.getAllByRole("button", { name: t.members.remove })[0]);
    await user.click(screen.getByRole("button", { name: new RegExp(t.members.rotate) }));
    await waitFor(async () => {
      expect(await sql(`select role from profiles where user_id = $1`, [home.users.child])).toEqual([{ role: "teen" }]);
      expect(await sql(`select household_id from profiles where user_id = $1`, [home.users.adult])).toEqual([{ household_id: null }]);
    });
  });

  it("everyone else sees roles but no tools", async () => {
    const home = await homeWith(["owner", "adult"]);
    const roster = [
      { id: home.users.owner, name: "Niv", emoji: "🦊", role: "owner" as const },
      { id: home.users.adult, name: "Dana", emoji: "🐻", role: "adult" as const },
    ];
    signIn(home.users.adult);
    const { t } = renderUi(<MembersCard members={roster} userId={home.users.adult} />);
    expect(screen.queryByLabelText(t.members.role)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(t.members.rotate) })).not.toBeInTheDocument();
    expect(screen.getByText(t.members.roles.owner)).toBeInTheDocument();
  });
});

describe("links to share", () => {
  it("a sitter link for one space, with its QR; then revoked", async () => {
    const home = await homeWith(["owner"]);
    const [{ id }] = await sql<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Dog walks') returning id`, [home.householdId]);
    const { user, t } = renderUi(<GuestLinks links={[]} spaces={[{ id, icon: "🐕", title: "Dog walks" }]} />);
    await user.type(screen.getByPlaceholderText(t.guest.whoPlaceholder), "Dana the sitter");
    await user.click(screen.getByRole("button", { name: new RegExp(t.guest.make) }));
    expect(await screen.findByText(/\/g\/[0-9a-f]{32}/)).toBeInTheDocument();
    const [link] = await sql<{ token: string; label: string; section_id: string }>(`select token, label, section_id from guest_links where household_id = $1`, [home.householdId]);
    expect(link).toMatchObject({ label: "Dana the sitter", section_id: id });
  });

  it("an invite link, ready to copy", async () => {
    await homeWith(["owner"]);
    const { user, t } = renderUi(<InviteLinkButton />);
    await user.click(screen.getByRole("button", { name: new RegExp(t.join.shareLink) }));
    const url = await screen.findByText(/\/join\/[0-9a-f]+/);
    await user.click(url);
    expect(await navigator.clipboard.readText()).toBe(url.textContent);
  });
});

describe("your data", () => {
  it("delete needs the exact email, then the account is gone", async () => {
    const home = await homeWith(["owner"]);
    const [{ email }] = await sql<{ email: string }>(`select email from auth.users where id = $1`, [home.users.owner]);
    const { user, t } = renderUi(<YourDataCard email={email} partners={[]} />);
    await user.click(screen.getByRole("button", { name: t.settings.deleteTitle }));
    const confirmBox = screen.getByLabelText(t.settings.deleteConfirm);
    await user.type(confirmBox, "wrong@x.com");
    expect(screen.getByRole("button", { name: t.settings.deleteButton })).toBeDisabled();
    await user.clear(confirmBox);
    await user.type(confirmBox, email.toUpperCase());
    await user.click(screen.getByRole("button", { name: t.settings.deleteButton }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(await sql(`select 1 from auth.users where id = $1`, [home.users.owner])).toEqual([]);
  });
});
