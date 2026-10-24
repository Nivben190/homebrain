import { getT } from "@/lib/session";
import { weatherEmoji, type DayWeather, type WalkAdvice } from "@/lib/weather";
import { hhmmOf, type HolyStatus } from "@/lib/jewish";
import { diffDays } from "@/lib/engine/habits";
import type { Locale } from "@/i18n";
import { fill } from "@/i18n";

/** Weather + dog-walk window + Shabbat/chag, in one glanceable card. */
export async function DayCard({ weather, advice, holy, today, locale, place }: { weather: DayWeather | null; advice: WalkAdvice | null; holy: HolyStatus; today: string; locale: Locale; place: string }) {
  const t = (await getT()).daily;
  const lines: string[] = [];
  if (holy.now && holy.havdalah) lines.push(`🕯️ ${t.shabbatShalom} · ${fill(t.havdalah, { t: hhmmOf(holy.havdalah) })}`);
  else if (holy.candles && holy.erevDay && diffDays(today, holy.erevDay) <= 1) lines.push(`🕯️ ${fill(t.candles, { t: hhmmOf(holy.candles) })}${holy.erevDay !== today ? ` (${t.tomorrow})` : ""}`);
  const chag = holy.holidays.find((h) => diffDays(today, h.day) >= 0 && diffDays(today, h.day) <= 7);
  if (chag) {
    const n = diffDays(today, chag.day);
    const name = locale === "he" ? (chag.hebrew ?? chag.title) : chag.title;
    lines.push(`🎉 ${fill(n === 0 ? t.chagToday : n === 1 ? t.chagTomorrow : t.chagIn, { name, n })}`);
  }
  const walk =
    advice?.hot && advice.windows.length
      ? fill(t.hotWalk, { w: advice.windows.map((x) => fill(x.startsWith("<") ? t.before : t.after, { t: x.slice(1) })).join(t.or) })
      : null;

  if (!weather && !lines.length) return null;
  return (
    <div className="glass mt-4 flex items-center gap-4 rounded-3xl p-4">
      {weather && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-4xl">{weatherEmoji(weather.code)}</span>
          <div>
            <p className="text-2xl font-extrabold leading-none">{weather.max}°</p>
            <p className="text-xs font-semibold text-muted">
              {weather.min}° {weather.rain >= 30 ? `· 🌧️ ${weather.rain}%` : ""}
            </p>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        {walk && <p className="font-semibold text-[#e0601b]">{walk}</p>}
        {lines.map((l) => (
          <p key={l} className="font-semibold">
            {l}
          </p>
        ))}
        {!walk && !lines.length && <p className="text-muted">📍 {place}</p>}
      </div>
    </div>
  );
}
