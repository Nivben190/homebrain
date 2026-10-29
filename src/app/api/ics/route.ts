import { buildIcs } from "@/lib/ics";
import { createSupabaseServer } from "@/lib/supabase/server";

/** One-off .ics download for "Add to Apple Calendar" buttons. Signed-in only, so it can't be used to mint invites for anyone. */
export async function GET(request: Request) {
  const { data } = await (await createSupabaseServer()).auth.getClaims();
  if (!data?.claims?.sub) return new Response("Sign in first", { status: 401 });
  const p = new URL(request.url).searchParams;
  const title = p.get("title")?.slice(0, 200) || "Home Brain";
  const start = new Date(p.get("start") ?? "");
  const end = new Date(p.get("end") ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return new Response("Bad dates", { status: 400 });
  const allDay = p.get("allDay") === "1";
  const body = buildIcs("Home Brain", [{ uid: `${start.getTime()}-${crypto.randomUUID()}@homebrain`, title, start, end, allDay }]);
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="event.ics"` },
  });
}
