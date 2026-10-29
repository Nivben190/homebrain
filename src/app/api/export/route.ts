import { zipSync, strToU8 } from "fflate";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { PUBLIC_PROFILE_COLUMNS } from "@/lib/db-types";
import { attachmentPaths, fileNames, spaceCsv, type ExportItem } from "@/lib/account-data";
import { allow, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Me → Export my data: a zip of data.json, one CSV per space and every
 * attachment. Read with the person's own session, so it holds exactly what
 * they can see in the app: the shared home, their private spaces, and nothing
 * of their partner's private ones. Keys and Google tokens stay out.
 */
export async function GET() {
  const db = await createSupabaseServer();
  const { data: auth } = await db.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return new Response("Sign in first", { status: 401 });
  if (!(await allow(createSupabaseAdmin(), "export", userId))) return tooMany("export");

  const table = async (name: string, columns = "*") => (await db.from(name).select(columns)).data ?? [];
  const [households, members, sections, items, checkins, automations, runs, pets, petWeights, requests, events, hookKeys] = await Promise.all([
    table("households", "id,name,created_at"),
    table("profiles", PUBLIC_PROFILE_COLUMNS),
    table("sections"),
    table("items"),
    table("checkins"),
    table("automations"),
    table("runs"),
    table("pets"),
    table("pet_weights"),
    table("requests"),
    table("events"),
    table("hook_keys", "purpose,created_at,last_used_at,revoked_at"),
  ]);

  const spaces = sections as unknown as { id: string; icon: string; title: string; position: number }[];
  spaces.sort((a, b) => a.position - b.position);
  const all = items as unknown as ExportItem[];
  const files: Record<string, Uint8Array> = {
    "data.json": strToU8(
      JSON.stringify({ exportedAt: new Date().toISOString(), userId, households, members, sections, items, checkins, automations, runs, pets, petWeights, requests, events, hookKeys }, null, 2),
    ),
  };
  fileNames(spaces).forEach((name, n) => {
    files[`spaces/${name}`] = strToU8(spaceCsv(all.filter((i) => i.section_id === spaces[n].id)));
  });

  // Storage RLS lets through only files of spaces this person can see.
  const paths = attachmentPaths(all);
  for (let i = 0; i < paths.length; i += 8) {
    await Promise.all(
      paths.slice(i, i + 8).map(async (path) => {
        const { data } = await db.storage.from("attachments").download(path);
        if (data) files[`attachments/${path}`] = new Uint8Array(await data.arrayBuffer());
      }),
    );
  }

  // Photos and PDFs are already compressed; zipping them again only costs time.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level: name.startsWith("attachments/") ? 0 : 6 }]])));
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Blob([zip as Uint8Array<ArrayBuffer>]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="home-brain-${day}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
