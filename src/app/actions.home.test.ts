import { beforeAll, describe, expect, it, vi } from "vitest";
import { app, homeWith, Redirect, signIn, sql, startApp } from "@/test/app";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const A = await import("./actions");

beforeAll(startApp, 120_000);

const info = (wifi: string) => ({ wifi_name: wifi, wifi_password: "secret pw", info: { notes: "Bins on Tuesday" } });

describe("home info card", () => {
  it("saves the Wi-Fi, and saves it again (the reported bug)", async () => {
    const home = await homeWith(["owner", "adult"]);
    expect(await A.saveHomeInfo(info("First"))).toEqual({ ok: true });
    signIn(home.users.adult);
    expect(await A.saveHomeInfo(info("Second"))).toEqual({ ok: true });
    expect(await sql(`select wifi_name, wifi_password, info->>'notes' as notes from home_info where household_id = $1`, [home.householdId])).toEqual([
      { wifi_name: "Second", wifi_password: "secret pw", notes: "Bins on Tuesday" },
    ]);
  });

  it("refuses children and bad input", async () => {
    const home = await homeWith(["owner", "child"]);
    signIn(home.users.child);
    expect((await A.saveHomeInfo(info("Kid"))).ok).toBe(false);
    signIn(home.users.owner);
    expect((await A.saveHomeInfo({ ...info("x"), wifi_name: "x".repeat(65) })).ok).toBe(false);
  });

  it("secrets are sealed, and only the owner reads or writes them", async () => {
    const home = await homeWith(["owner", "adult"]);
    expect(await A.saveHomeSecrets("Alarm 1234")).toEqual({ ok: true });
    const [{ secrets }] = await sql<{ secrets: string }>(`select secrets from home_info where household_id = $1`, [home.householdId]);
    expect(secrets).not.toContain("1234");
    expect(await A.readHomeSecrets()).toEqual({ ok: true, data: "Alarm 1234" });
    // Saving the card afterwards keeps the secrets.
    expect(await A.saveHomeInfo(info("Net"))).toEqual({ ok: true });
    expect(await A.readHomeSecrets()).toEqual({ ok: true, data: "Alarm 1234" });
    signIn(home.users.adult);
    expect(await A.readHomeSecrets()).toEqual({ ok: false, error: "owner only" });
    expect(await A.saveHomeSecrets("x")).toEqual({ ok: false, error: "owner only" });
  });
});

describe("profile and settings", () => {
  it("updateProfile saves the fields Settings sends", async () => {
    const home = await homeWith(["owner"]);
    expect(await A.updateProfile({ display_name: "Niv", emoji: "🦊", quiet_from: "22:00", quiet_to: "07:00", digest: true, lat: 32.1, lon: 34.8, place: "TLV" })).toEqual({ ok: true });
    expect(await sql(`select display_name, emoji, quiet_from::text, digest, place from profiles where user_id = $1`, [home.users.owner])).toEqual([
      { display_name: "Niv", emoji: "🦊", quiet_from: "22:00:00", digest: true, place: "TLV" },
    ]);
    expect((await A.updateProfile({ wake_time: "7am" })).ok).toBe(false);
  });

  it("setLocale sets the cookie and the profile", async () => {
    const home = await homeWith(["owner"]);
    await A.setLocale("he");
    expect(app.cookies.get("locale") ?? [...app.cookies.values()].at(-1)).toBe("he");
    expect(await sql(`select locale from profiles where user_id = $1`, [home.users.owner])).toEqual([{ locale: "he" }]);
  });

  it("push subscriptions save once per device", async () => {
    const home = await homeWith(["owner"]);
    const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } };
    expect(await A.savePushSubscription(sub, "iPhone")).toEqual({ ok: true });
    expect(await A.savePushSubscription(sub, "iPhone 2")).toEqual({ ok: true });
    expect(await sql(`select device_label from push_subscriptions where user_id = $1`, [home.users.owner])).toEqual([{ device_label: "iPhone 2" }]);
    expect((await A.savePushSubscription({ endpoint: "nope" }, "x")).ok).toBe(false);
    expect(await A.sendTestPush()).toEqual({ ok: true });
  });

  it("rotateHookKey revokes the old key and hands back a new one once", async () => {
    const home = await homeWith(["owner"]);
    const first = await A.rotateHookKey("capture");
    const second = await A.rotateHookKey("capture");
    expect(first.ok && second.ok && first.key !== second.key).toBe(true);
    expect(await sql(`select count(*)::int as live from hook_keys where user_id = $1 and purpose = 'capture' and revoked_at is null`, [home.users.owner])).toEqual([{ live: 1 }]);
    expect((await A.rotateHookKey("nope" as never)).ok).toBe(false);
  });
});

describe("people and invites", () => {
  it("owner tools: role change, removal, new code", async () => {
    const home = await homeWith(["owner", "adult", "child"]);
    const [{ invite_code: before }] = await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [home.householdId]);
    expect(await A.setMemberRole(home.users.child, "teen")).toEqual({ ok: true });
    expect(await A.removeMember(home.users.adult)).toEqual({ ok: true });
    expect(await A.rotateInvite()).toEqual({ ok: true });
    expect(await sql(`select role from profiles where user_id = $1`, [home.users.child])).toEqual([{ role: "teen" }]);
    expect(await sql(`select household_id from profiles where user_id = $1`, [home.users.adult])).toEqual([{ household_id: null }]);
    expect((await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [home.householdId]))[0].invite_code).not.toBe(before);
    signIn(home.users.child);
    expect((await A.rotateInvite()).ok).toBe(false);
  });

  it("an invite link brings a new person in as an adult; a child can't make one", async () => {
    const home = await homeWith(["owner", "child"]);
    const link = await A.createInviteLink();
    if (!link.ok) throw new Error(link.error);
    const other = await homeWith(["owner"]);
    expect(await A.acceptInvite(link.data.token, false)).toEqual({ ok: true });
    expect(await sql(`select household_id, role from profiles where user_id = $1`, [other.users.owner])).toEqual([{ household_id: home.householdId, role: "adult" }]);
    expect(await sql(`select 1 from households where id = $1`, [other.householdId])).toEqual([]);
    expect(await A.acceptInvite(link.data.token, false)).toEqual({ ok: false, error: "expired" });
    signIn(home.users.child);
    expect((await A.createInviteLink()).ok).toBe(false);
  });

  it("leaving hands the home over and sends you to onboarding", async () => {
    const home = await homeWith(["owner", "adult"]);
    await expect(A.leaveHome()).rejects.toThrow(Redirect);
    expect(await sql(`select role from profiles where user_id = $1`, [home.users.adult])).toEqual([{ role: "owner" }]);
  });

  it("setupHome creates a home with the starter spaces, or joins by code", async () => {
    const [{ id }] = await sql<{ id: string }>(`insert into auth.users (email) values ('fresh@test') returning id`);
    signIn(id);
    expect(await A.setupHome({ mode: "create", homeName: "Nest", starter: true, displayName: "Fresh", emoji: "🐣" })).toEqual({ ok: true });
    const [{ household_id }] = await sql<{ household_id: string }>(`select household_id from profiles where user_id = $1`, [id]);
    expect((await sql(`select title from sections where household_id = $1`, [household_id])).length).toBeGreaterThan(0);
    const [{ invite_code }] = await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [household_id]);
    const [{ id: joiner }] = await sql<{ id: string }>(`insert into auth.users (email) values ('joiner@test') returning id`);
    signIn(joiner);
    expect(await A.setupHome({ mode: "join", inviteCode: invite_code, starter: false, displayName: "J", emoji: "🙂" })).toEqual({ ok: true });
    expect(await sql(`select household_id from profiles where user_id = $1`, [joiner])).toEqual([{ household_id }]);
    signIn((await sql<{ id: string }>(`insert into auth.users (email) values ('lost@test') returning id`))[0].id);
    expect((await A.setupHome({ mode: "join", inviteCode: "WRONG000", starter: false, displayName: "L", emoji: "🙂" })).ok).toBe(false);
  });

  it("signed out, actions that need a home send you to log in", async () => {
    signIn(null);
    await expect(A.saveHomeInfo(info("x"))).rejects.toThrow(/login/);
    expect(await A.acceptInvite("x", false)).toEqual({ ok: false, error: "Not signed in" });
  });
});

describe("requests", () => {
  it("ask, push the recipient, answer, push the sender", async () => {
    const home = await homeWith(["owner", "adult"]);
    app.pushes = [];
    expect(await A.sendRequest({ to: home.users.adult, text: "Buy milk", due: "tomorrow" })).toEqual({ ok: true });
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.adult]);
    const [{ id }] = await sql<{ id: string }>(`select id from requests where to_user = $1`, [home.users.adult]);
    signIn(home.users.adult);
    expect(await A.setRequestStatus(id, "done")).toEqual({ ok: true });
    expect(app.pushes.map((p) => p.userId)).toEqual([home.users.adult, home.users.owner]);
    signIn(home.users.owner);
    expect(await A.setRequestStatus(id, "open")).toEqual({ ok: false, error: "permission denied" });
    expect(await A.deleteRequest(id)).toEqual({ ok: true });
    expect(await sql(`select 1 from requests where id = $1`, [id])).toEqual([]);
  });

  it("can't ask yourself, nobody, or someone outside the home", async () => {
    const home = await homeWith(["owner"]);
    const other = await homeWith(["owner"]);
    signIn(home.users.owner);
    expect((await A.sendRequest({ to: home.users.owner, text: "x", due: null })).ok).toBe(false);
    expect((await A.sendRequest({ to: other.users.owner, text: "x", due: null })).ok).toBe(false);
    expect((await A.sendRequest({ to: home.users.owner, text: "  ", due: null })).ok).toBe(false);
  });
});

describe("accounts", () => {
  it("createAccount lets invited people in and nobody else", async () => {
    const home = await homeWith(["owner"]);
    const [{ invite_code }] = await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [home.householdId]);
    expect(await A.createAccount({ email: "Friend@Example.com", password: "longenough", inviteCode: invite_code.toLowerCase() })).toEqual({ ok: true });
    expect(await sql(`select email from auth.users where email = 'friend@example.com'`)).toHaveLength(1);
    expect(await A.createAccount({ email: "friend@example.com", password: "longenough", inviteCode: invite_code })).toEqual({ ok: false, error: "exists" });
    expect(await A.createAccount({ email: "stranger@example.com", password: "longenough" })).toEqual({ ok: false, error: "not_invited" });
    expect(await A.createAccount({ email: "x@example.com", password: "ninechars" })).toEqual({ ok: false, error: "too_short" });
  });

  it("a new account emails the app's owner, and only when it really was created", async () => {
    const home = await homeWith(["owner"]);
    const [{ invite_code }] = await sql<{ invite_code: string }>(`select invite_code from households where id = $1`, [home.householdId]);
    // A fresh sign-up allowance for this test's address.
    await sql(`delete from rate_limits where bucket like 'signUp:%'`);
    const sent: { to: string[]; subject: string; text: string }[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith("https://api.resend.com/")) {
        sent.push(JSON.parse(String(init!.body)));
        return new Response("{}", { status: 200 });
      }
      return realFetch(url, init);
    });
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("SIGNUP_ALERT_EMAIL", "owner@example.com");
    try {
      expect(await A.createAccount({ email: "Newbie@Example.com", password: "longenough", inviteCode: invite_code })).toEqual({ ok: true });
      expect(await A.createAccount({ email: "newbie@example.com", password: "longenough", inviteCode: invite_code })).toEqual({ ok: false, error: "exists" });
      expect(await A.createAccount({ email: "nobody@example.com", password: "longenough" })).toEqual({ ok: false, error: "not_invited" });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@example.com"]);
    expect(sent[0].subject).toBe("New sign-up: newbie@example.com");
    expect(sent[0].text).toContain("How they got in: a home's invite code");
    expect(sent[0].text).toMatch(/Accounts now: \d+/);
  });

  it("deleteAccount needs the typed email, then removes the user and an empty home", async () => {
    const home = await homeWith(["owner"]);
    const [{ email }] = await sql<{ email: string }>(`select email from auth.users where id = $1`, [home.users.owner]);
    expect(await A.deleteAccount("wrong@x")).toEqual({ ok: false, error: "confirm" });
    expect(await A.deleteAccount(email.toUpperCase())).toEqual({ ok: true });
    expect(await sql(`select 1 from auth.users where id = $1`, [home.users.owner])).toEqual([]);
    expect(await sql(`select 1 from households where id = $1`, [home.householdId])).toEqual([]);
  });
});
