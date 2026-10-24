"use client";
import { useState, useTransition } from "react";
import { LocateFixed, Search } from "lucide-react";
import { updateProfile } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Card, Input, SectionTitle, Toggle } from "@/components/ui";

export interface DailyPrefs {
  place: string | null;
  briefing: boolean;
  wrapup: boolean;
  wrapup_time: string;
  quiet_shabbat: boolean;
  shabbat_shop: boolean;
}

/** Location + briefing / wrap-up / Shabbat preferences. Each change saves instantly. */
export function DailyBrainSettings({ initial }: { initial: DailyPrefs }) {
  const { t, locale } = useI18n();
  const s = t.settings;
  const [p, setP] = useState(initial);
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (patch: Partial<DailyPrefs> & { lat?: number; lon?: number }) => {
    setP((x) => ({ ...x, ...patch }));
    start(async () => {
      const res = await updateProfile(patch);
      setStatus(res.ok ? `✓ ${s.saved}` : res.error);
      setTimeout(() => setStatus(null), 1500);
    });
  };

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => save({ lat: Number(pos.coords.latitude.toFixed(4)), lon: Number(pos.coords.longitude.toFixed(4)), place: s.myLocation }),
      () => setStatus(s.locationDenied),
      { timeout: 10000 },
    );
  }

  async function searchCity(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) return;
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=${locale}&name=${encodeURIComponent(city.trim())}`);
    const hit = (await res.json()).results?.[0];
    if (!hit) return setStatus(s.cityNotFound);
    save({ lat: hit.latitude, lon: hit.longitude, place: hit.name });
    setCity("");
  }

  const row = (label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-3 py-1">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  );

  return (
    <>
      <SectionTitle>🧠 {s.dailyBrain}</SectionTitle>
      <Card className="space-y-3">
        <div>
          <p className="font-semibold">📍 {s.location}</p>
          <p className="text-sm text-muted">{p.place ?? "Tel Aviv"} · {s.locationHint}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="soft" onClick={useMyLocation} loading={pending}>
              <LocateFixed className="size-4" /> {s.useMyLocation}
            </Button>
          </div>
          <form onSubmit={searchCity} className="mt-2 flex gap-2">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={s.searchCity} className="h-10 flex-1" />
            <Button size="sm" variant="ghost" className="h-10" aria-label={s.searchCity}>
              <Search className="size-4" />
            </Button>
          </form>
        </div>
        <div className="divide-y divide-card-border">
          {row(`☀️ ${s.briefing}`, s.briefingHint, p.briefing, (briefing) => save({ briefing }))}
          <div className="py-1">
            {row(`🌙 ${s.wrapup}`, s.wrapupHint, p.wrapup, (wrapup) => save({ wrapup }))}
            {p.wrapup && (
              <Input type="time" value={p.wrapup_time.slice(0, 5)} onChange={(e) => e.target.value && setP({ ...p, wrapup_time: e.target.value })} onBlur={() => save({ wrapup_time: p.wrapup_time.slice(0, 5) })} className="mt-2 h-10 w-32" />
            )}
          </div>
          {row(`🛒 ${s.shabbatShop}`, s.shabbatShopHint, p.shabbat_shop, (shabbat_shop) => save({ shabbat_shop }))}
          {row(`🕯️ ${s.quietShabbat}`, s.quietShabbatHint, p.quiet_shabbat, (quiet_shabbat) => save({ quiet_shabbat }))}
        </div>
        {status && <p className="text-sm font-semibold text-accent">{status}</p>}
      </Card>
    </>
  );
}
