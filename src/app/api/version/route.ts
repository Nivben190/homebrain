import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The deploy now serving; an open app compares it with the one it was loaded from (roadmap 1.11). */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
