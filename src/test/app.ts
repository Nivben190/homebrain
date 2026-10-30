import { vi } from "vitest";
import { migratedDb, seedHome, type Db } from "./db";
import { testClient } from "./postgrest";

/**
 * Server code under test, for real: actions, routes and the engine run
 * unchanged against the migrated database through supabase-js. Only Next's
 * request scope and the outside world (push, Google, email) are stood in for.
 *
 * In a test file:
 *   vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
 *   vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
 *   vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
 *   vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
 *   vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));
 */
export const app = {
  db: null as unknown as Db,
  userId: null as string | null,
  cookies: new Map<string, string>(),
  headers: new Headers({ "x-forwarded-for": "203.0.113.7" }),
  pushes: [] as { userId: string; payload: { title: string; body: string; url?: string } }[],
  outbound: [] as string[],
  /** Canned replies for outside services, by URL; anything else gets an empty 200. */
  respond: (_url: string): unknown => undefined, // eslint-disable-line @typescript-eslint/no-unused-vars
};

process.env.GOOGLE_TOKEN_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.GOOGLE_CLIENT_ID ??= "test-client";
process.env.GOOGLE_CLIENT_SECRET ??= "test-secret";

/** A fresh database for the file, with nobody signed in. */
export async function startApp() {
  app.db = await migratedDb();
  app.userId = null;
  app.pushes = [];
  app.outbound = [];
  app.respond = () => undefined;
  // Nothing in a test talks to the internet: Google, Resend, weather all land here.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    app.outbound.push(url);
    const canned = app.respond(url);
    if (canned instanceof Response) return canned;
    return new Response(JSON.stringify(canned ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  });
  return app.db;
}

export const signIn = (userId: string | null) => {
  app.userId = userId;
};

/** A home with one member per role, the first one signed in. */
export async function homeWith(roles: string[]) {
  const home = await seedHome(app.db, roles);
  signIn(home.users[roles[0]]);
  return home;
}

export const sql = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await app.db.query<T>(text, params)).rows;

export const supabaseServerMock = {
  createSupabaseServer: async () => {
    const userId = app.userId;
    const client = testClient(app.db, userId ?? undefined);
    const email = userId ? (await sql<{ email: string }>(`select email from auth.users where id = $1`, [userId]))[0]?.email : undefined;
    // getClaims verifies the cookie session in production; here the signed-in test user is the session.
    client.auth.getClaims = (async () => ({ data: userId ? { claims: { sub: userId, email } } : null, error: null })) as never;
    client.auth.getUser = (async () => ({ data: { user: userId ? { id: userId, email } : null }, error: null })) as never;
    client.auth.signOut = (async () => ({ error: null })) as never;
    return client;
  },
  createSupabaseAdmin: () => testClient(app.db),
};

export const nextCacheMock = { revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: <T>(fn: T) => fn };

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (app.cookies.has(name) ? { name, value: app.cookies.get(name)! } : undefined),
    getAll: () => [...app.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void app.cookies.set(name, value),
    delete: (name: string) => void app.cookies.delete(name),
  }),
  headers: async () => app.headers,
};

export class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}
export const nextNavigationMock = {
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Redirect("404");
  },
};

export const pushMock = {
  sendPush: async (_db: unknown, userId: string, payload: { title: string; body: string; url?: string }) => {
    app.pushes.push({ userId, payload });
    return 1;
  },
};
