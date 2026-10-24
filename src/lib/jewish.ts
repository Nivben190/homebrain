// Shabbat & holidays from Hebcal (free, no key), Israel schedule. Cached 6 h.

export interface HebcalItem {
  title: string;
  hebrew?: string;
  date: string;
  category: string;
  subcat?: string;
  yomtov?: boolean;
}

export async function getJewishCalendar(lat: number, lon: number, timeZone: string, startDay: string, endDay: string): Promise<HebcalItem[]> {
  const params = new URLSearchParams({
    v: "1",
    cfg: "json",
    maj: "on",
    i: "on",
    c: "on",
    M: "on",
    geo: "pos",
    latitude: String(lat),
    longitude: String(lon),
    tzid: timeZone,
    start: startDay,
    end: endDay,
  });
  try {
    const res = await fetch(`https://www.hebcal.com/hebcal?${params}`, { next: { revalidate: 6 * 3600 } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.items ?? []) as HebcalItem[];
  } catch {
    return [];
  }
}

export interface HolyStatus {
  /** Inside Shabbat / yom tov right now (between candles and havdalah). */
  now: boolean;
  /** Next candle lighting (ISO with offset) and the havdalah that ends it. */
  candles: string | null;
  havdalah: string | null;
  /** Day key of the next candle lighting — the "erev" day for shopping. */
  erevDay: string | null;
  /** Major holidays starting within the window. */
  holidays: { day: string; title: string; hebrew?: string }[];
}

/** Works out the Shabbat/chag state at `now` from a Hebcal item list. */
export function holyStatus(items: HebcalItem[], now: Date): HolyStatus {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const t = now.getTime();
  const candles = sorted.filter((i) => i.category === "candles");
  const havdalot = sorted.filter((i) => i.category === "havdalah");

  // Currently inside: the latest candles before now whose following havdalah is after now.
  const lastCandles = [...candles].reverse().find((c) => Date.parse(c.date) <= t);
  const endOfLast = lastCandles ? havdalot.find((h) => Date.parse(h.date) > Date.parse(lastCandles.date)) : undefined;
  const inside = !!lastCandles && !!endOfLast && Date.parse(endOfLast.date) > t;

  const next = inside ? lastCandles! : candles.find((c) => Date.parse(c.date) > t);
  const nextEnd = next ? havdalot.find((h) => Date.parse(h.date) > Date.parse(next.date)) : undefined;

  return {
    now: inside,
    candles: next?.date ?? null,
    havdalah: nextEnd?.date ?? null,
    erevDay: next ? next.date.slice(0, 10) : null,
    holidays: sorted
      .filter((i) => i.category === "holiday" && (i.subcat === "major" || i.yomtov))
      .map((i) => ({ day: i.date.slice(0, 10), title: i.title, hebrew: i.hebrew })),
  };
}

/** "17:42" from a Hebcal ISO timestamp (already in local time). */
export function hhmmOf(iso: string): string {
  return iso.slice(11, 16);
}
