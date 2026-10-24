import { buildIcs } from "@/lib/ics";

/** One-off .ics download for "Add to Apple Calendar" buttons. */
export function GET(request: Request) {
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
