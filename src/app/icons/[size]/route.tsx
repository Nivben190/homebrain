import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size: String(size) }));
}

/** App icon: a glowing brain on a violet→pink gradient, rendered to PNG at build. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7457ff 0%, #b65cff 50%, #ff6fa8 100%)",
          fontSize: size * 0.58,
        }}
      >
        🧠
      </div>
    ),
    { width: size, height: size },
  );
}
