import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readMailPdf } from "@/lib/subs/mail";

export const dynamic = "force-dynamic";

/** A PDF attached to an email a bill came from (the mail page's attachment links). */
export async function GET(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const pdf = await readMailPdf(supabase, q.get("section") ?? "", q.get("message") ?? "", Number(q.get("n") ?? 0));
  if (!pdf) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
