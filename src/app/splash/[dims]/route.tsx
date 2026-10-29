import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, Mark } from "../../icons/mark";
import { SPLASH_SIZES } from "@/lib/splash";

export function generateStaticParams() {
  return SPLASH_SIZES.map(({ w, h }) => ({ dims: `${w}x${h}` }));
}

/** iOS launch screen (apple-touch-startup-image): the mark and name on the brand gradient. */
export async function GET(_req: Request, { params }: { params: Promise<{ dims: string }> }) {
  const dims = (await params).dims;
  const size = SPLASH_SIZES.find(({ w, h }) => `${w}x${h}` === dims);
  if (!size) return new Response("Not found", { status: 404 });
  const unit = Math.min(size.w, size.h);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: unit * 0.05, background: BRAND_GRADIENT }}>
        <Mark size={Math.round(unit * 0.28)} />
        <div style={{ color: "white", fontSize: unit * 0.075, fontWeight: 800, letterSpacing: -1 }}>Home Brain</div>
      </div>
    ),
    { width: size.w, height: size.h },
  );
}
