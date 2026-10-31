import { getT } from "@/lib/session";
import { fill } from "@/i18n";

export interface ExpiredGoogle {
  key: string;
  /** "Google Calendar" or "Gmail in 💳 Subscriptions". */
  what: string;
  href: string;
}

/** Roadmap 1.9: an ended Google connection shows up on Today, not only inside its space. */
export async function GoogleReconnect({ expired }: { expired: ExpiredGoogle[] }) {
  if (!expired.length) return null;
  const t = await getT();
  return (
    <div className="mb-3 space-y-2">
      {expired.map((g) => (
        <div key={g.key} className="flex items-center gap-3 rounded-3xl bg-warn/15 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{fill(t.today.googleGone, { what: g.what })}</p>
            <p className="text-xs text-muted">{t.today.googleGoneHint}</p>
          </div>
          <a href={g.href} className="shrink-0 rounded-full bg-warn px-4 py-2 text-sm font-bold text-[#3a2600]">
            {t.subs.reconnect}
          </a>
        </div>
      ))}
    </div>
  );
}
