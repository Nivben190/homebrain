import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getT, requireHome } from "@/lib/session";
import { fill } from "@/i18n";
import { IconTile } from "@/components/ui";
import type { SpaceShape } from "@/lib/space-copy";
import { AddSharedSpace } from "./AddSharedSpace";

export const dynamic = "force-dynamic";

/** A space someone shared as a template: its name, layout and item titles, and a button to add a copy here. */
export default async function SharedSpacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await requireHome();
  const t = await getT();
  const { data } = /^[0-9a-f]{24}$/.test(token) ? await createSupabaseAdmin().from("space_templates").select("shape").eq("token", token).maybeSingle<{ shape: SpaceShape }>() : { data: null };
  if (!data) return <p className="glass mt-10 rounded-3xl p-5 text-center">⌛ {t.shared.gone}</p>;
  const shape = data.shape;
  return (
    <div className="safe-top space-y-4 pt-4">
      <p className="text-sm font-semibold text-muted">{t.shared.title}</p>
      <div className="glass flex items-center gap-3 rounded-3xl p-4">
        <IconTile icon={shape.icon} color={shape.color} className="size-14 text-3xl" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{shape.title}</h1>
          <p className="text-sm text-muted">
            {t.views[shape.view]} · {fill(t.shared.items, { n: String(shape.items.length) })}
          </p>
        </div>
      </div>
      {shape.items.length > 0 && (
        <ul className="glass divide-y divide-card-border overflow-hidden rounded-3xl">
          {shape.items.slice(0, 30).map((i, n) => (
            <li key={n} className="px-4 py-3 font-medium">
              {i.title}
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-sm text-muted">{t.shared.noData}</p>
      <AddSharedSpace token={token} />
    </div>
  );
}
