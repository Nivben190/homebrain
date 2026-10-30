// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { app, homeWith, signIn, sql, startApp } from "@/test/app";
import { testClient } from "@/test/postgrest";
import { renderUi } from "@/test/ui";
import type { Item, Section } from "@/lib/db-types";

vi.mock("@/lib/supabase/server", () => import("@/test/app").then((m) => m.supabaseServerMock));
vi.mock("@/lib/supabase/browser", () => import("@/test/app").then((m) => m.supabaseBrowserMock));
vi.mock("next/cache", () => import("@/test/app").then((m) => m.nextCacheMock));
vi.mock("next/headers", () => import("@/test/app").then((m) => m.nextHeadersMock));
vi.mock("next/navigation", () => import("@/test/app").then((m) => m.nextNavigationMock));
vi.mock("next/link", () => import("@/test/app").then((m) => m.nextLinkMock));
vi.mock("@/lib/push", () => import("@/test/app").then((m) => m.pushMock));

const { SectionScreen } = await import("@/components/sections/SectionScreen");

beforeAll(startApp, 120_000);
beforeEach(() => {
  app.offline = false;
  app.failNext = false;
  URL.createObjectURL = () => `blob:${crypto.randomUUID()}`;
  URL.revokeObjectURL = () => {};
  // jsdom has no image decoder or canvas: a blank picture that encodes to a few bytes.
  HTMLImageElement.prototype.decode = async () => {};
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(8).fill(200) }), putImageData() {} })) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(["jpg"], { type: "image/jpeg" }));
  };
});

const objects = (prefix: string) => sql<{ name: string }>(`select name from storage.objects where name like $1 || '%' order by name`, [prefix]);
const jpg = (name = "photo.jpg") => new File(["x"], name, { type: "image/jpeg" });
const pdf = (name = "warranty.pdf") => new File(["%PDF"], name, { type: "application/pdf" });

describe("who can store and see attachments", () => {
  it("files follow their space: the home's shared ones for members, a private one for its owner only, never another home's", async () => {
    const home = await homeWith(["owner", "adult"]);
    const other = await homeWith(["owner"]);
    const [shared] = await sql<{ id: string }>(`insert into sections (household_id, title) values ($1, 'Shared') returning id`, [home.householdId]);
    const [mine] = await sql<{ id: string }>(`insert into sections (household_id, title, owner_id) values ($1, 'Mine', $2) returning id`, [home.householdId, home.users.owner]);
    const owner = testClient(app.db, home.users.owner).storage.from("attachments");
    const adult = testClient(app.db, home.users.adult).storage.from("attachments");
    const stranger = testClient(app.db, other.users.owner).storage.from("attachments");
    const at = (section: string, file: string) => `${home.householdId}/${section}/item/${file}`;

    expect((await owner.upload(at(shared.id, "a.jpg"), jpg())).error).toBeNull();
    expect((await owner.upload(at(mine.id, "b.jpg"), jpg())).error).toBeNull();
    expect((await adult.upload(at(mine.id, "c.jpg"), jpg())).error).not.toBeNull();
    expect((await stranger.upload(at(shared.id, "d.jpg"), jpg())).error).not.toBeNull();
    // A path that claims another home's id for this home's space.
    expect((await stranger.upload(`${other.householdId}/${shared.id}/item/e.jpg`, jpg())).error).not.toBeNull();

    const signed = async (client: typeof owner) => (await client.createSignedUrls([at(shared.id, "a.jpg"), at(mine.id, "b.jpg")], 60)).data!.map((d) => !!d.signedUrl);
    expect(await signed(owner)).toEqual([true, true]);
    expect(await signed(adult)).toEqual([true, false]);
    expect(await signed(stranger)).toEqual([false, false]);

    await stranger.remove([at(shared.id, "a.jpg")]);
    await adult.remove([at(mine.id, "b.jpg")]);
    expect((await objects(home.householdId)).map((o) => o.name).sort()).toEqual([at(shared.id, "a.jpg"), at(mine.id, "b.jpg")].sort());
    await adult.remove([at(shared.id, "a.jpg")]);
    expect(await objects(at(shared.id, ""))).toEqual([]);
  });
});

async function memories(items: { title: string; props?: Record<string, unknown> }[] = []) {
  const home = await homeWith(["owner"]);
  signIn(home.users.owner);
  const [section] = await sql<Section>(`insert into sections (household_id, title, view, template, icon) values ($1, 'Memories', 'gallery', 'memories', '📸') returning *`, [home.householdId]);
  for (const it of items) await sql(`insert into items (section_id, title, props) values ($1, $2, $3)`, [section.id, it.title, JSON.stringify(it.props ?? {})]);
  const rows = await sql<Item>(`select * from items where section_id = $1`, [section.id]);
  const ui = renderUi(
    <SectionScreen initialSection={section} initialItems={rows.map((r) => ({ ...r, created_at: String(r.created_at) }))} initialCheckins={[]} userId={home.users.owner} members={[{ id: home.users.owner, name: "Owner", emoji: "🦊" }]} timeZone="Asia/Jerusalem" launch={{ notes: "l1.notes", checkin: "l1.checkin" }} />,
  );
  return { ...ui, home, section };
}
const photosOf = async (sectionId: string) => (await sql<{ p: { path: string; thumb?: string; kind: string; name?: string }[] | null }>(`select props->'_photos' as p from items where section_id = $1`, [sectionId]))[0]?.p ?? [];
const pickers = () => document.querySelectorAll<HTMLInputElement>("input[type=file]");

describe("memories with photos", () => {
  it("a new memory opens; a photo and a scanned receipt upload with thumbnails, a PDF as it is", async () => {
    const { user, t, section } = await memories();
    await user.type(screen.getByPlaceholderText(t.memories.addPlaceholder), "Beach day{Enter}");
    await user.click(within(await screen.findByRole("group", { name: t.photos.title })).getByRole("button", { name: t.photos.add }));
    const [, scan, library, file] = pickers();
    await user.upload(library, jpg());
    await waitFor(async () => expect(await photosOf(section.id)).toHaveLength(1));
    await user.upload(scan, jpg("receipt.jpg"));
    await user.upload(file, pdf());
    await waitFor(async () => expect((await photosOf(section.id)).map((p) => p.kind)).toEqual(["image", "image", "pdf"]));
    const saved = await photosOf(section.id);
    expect(saved[0].thumb).toMatch(/_t\.jpg$/);
    expect(saved[2]).toMatchObject({ name: "warranty.pdf" });
    expect((await objects(section.household_id)).map((o) => o.name).sort()).toEqual([saved[0].path, saved[0].thumb, saved[1].path, saved[1].thumb, saved[2].path].sort());
    expect(screen.getByText("warranty.pdf")).toBeInTheDocument();
  });

  it("the viewer pages through photos and deleting one removes the file", async () => {
    const { user, t, section } = await memories([{ title: "Trip" }]);
    await user.click(screen.getByText("Trip"));
    await user.click(within(await screen.findByRole("group", { name: t.photos.title })).getByRole("button", { name: t.photos.add }));
    await user.upload(pickers()[2], [jpg("1.jpg"), jpg("2.jpg")]);
    await waitFor(async () => expect(await photosOf(section.id)).toHaveLength(2));
    const group = screen.getByRole("group", { name: t.photos.title });
    const thumbs = await waitFor(() => {
      const imgs = group.querySelectorAll<HTMLImageElement>("img[src*='/object/sign/']");
      expect(imgs).toHaveLength(2);
      return imgs;
    });
    await user.click(thumbs[0].closest("button")!);
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.common.next }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.common.previous }));
    const [first] = await photosOf(section.id);
    await user.click(within(screen.getByText("1 / 2").parentElement!).getByRole("button", { name: t.common.delete }));
    await waitFor(async () => expect(await photosOf(section.id)).toHaveLength(1));
    await waitFor(async () => expect(await objects(first.path)).toEqual([]));
  });

  it("an upload the server refuses says so in plain words", async () => {
    const { user, t, home } = await memories([{ title: "Party" }]);
    await user.click(screen.getByText("Party"));
    await user.click(within(await screen.findByRole("group", { name: t.photos.title })).getByRole("button", { name: t.photos.add }));
    // Moved out of the home meanwhile: the space isn't theirs to write to anymore.
    await sql(`update profiles set household_id = null where user_id = $1`, [home.users.owner]);
    await user.upload(pickers()[3], pdf());
    expect(await screen.findByText(t.failures.denied)).toBeInTheDocument();
  });

  it("several memories offer a surprise pick", async () => {
    const { user, t } = await memories([{ title: "One" }, { title: "Two" }]);
    await user.click(screen.getByRole("button", { name: new RegExp(t.memories.surprise) }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
