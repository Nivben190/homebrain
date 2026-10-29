import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, Mark } from "../mark";

/** "512m" is the maskable icon: the mark sits inside Android's 80% safe zone. */
const SIZES = new Set(["96", "180", "192", "512", "512m"]);

export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size }));
}

/** App icon: the house-and-spark mark on the violet→pink gradient, rendered to PNG at build. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const key = (await params).size;
  if (!SIZES.has(key)) return new Response("Not found", { status: 404 });
  const size = parseInt(key, 10);
  const maskable = key.endsWith("m");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_GRADIENT }}>
        <Mark size={Math.round(size * (maskable ? 0.5 : 0.66))} />
      </div>
    ),
    { width: size, height: size },
  );
}
