"use client";
import { useState, useTransition } from "react";
import { LocateFixed, Search } from "lucide-react";
import { updateProfile } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Card, Input, SectionTitle, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";

export interface DailyPrefs {
  place: string | null;
  briefing: boolean;
  wrapup: boolean;
  wrapup_time: string;
  quiet_shabbat: boolean;
  shabbat_shop: boolean;
  quiet_from: string | null;
  quiet_to: string | null;
  muted_sections: string[];
  digest: boolean;
}

/** Location + briefing / wrap-up / Shabbat preferences. Each change saves instantly. */
export function DailyBrainSettings({ initial, spaces }: { initial: DailyPrefs; spaces: { id: string; icon: string; title: string }[] }) {
  const { t, locale } = useI18n();
  const s = t.settings;
  const [p, setP] = useState(initial);
  const [city, setCity] = useState("");
  const toast = useToast();
  const setStatus = (m: string) => toast.error(m);
  const [pending, start] = useTransition();

  const save = (patch: Partial<DailyPrefs> & { lat?: number; lon?: number }) => {
    setP((x) => ({ ...x, ...patch }));
    start(async () => {
      const res = await updateProfile(patch);
      if (res.ok) toast.success(s.saved);
      else toast.error(t.failures[errorKey(res.error)]);
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
          <div className="py-1">
            {row(`🌜 ${s.quietHours}`, s.quietHoursHint, !!p.quiet_from, (on) => save(on ? { quiet_from: "22:00", quiet_to: "07:00" } : { quiet_from: null, quiet_to: null }))}
            {p.quiet_from && (
              <div className="mt-2 flex items-center gap-2">
                <Input type="time" aria-label={`${s.quietHours} · ${t.common.from}`} value={p.quiet_from.slice(0, 5)} onChange={(e) => e.target.value && setP({ ...p, quiet_from: e.target.value })} onBlur={() => save({ quiet_from: p.quiet_from!.slice(0, 5) })} className="h-10 w-32" />
                <span className="text-muted">–</span>
                <Input type="time" aria-label={`${s.quietHours} · ${t.common.until}`} value={(p.quiet_to ?? "07:00").slice(0, 5)} onChange={(e) => e.target.value && setP({ ...p, quiet_to: e.target.value })} onBlur={() => save({ quiet_to: (p.quiet_to ?? "07:00").slice(0, 5) })} className="h-10 w-32" />
              </div>
            )}
          </div>
          {row(`📬 ${s.digest}`, s.digestHint, p.digest, (digest) => save({ digest }))}
          {spaces.length > 0 && (
            <div className="py-2">
              <p className="font-semibold">🔕 {s.muted}</p>
              <p className="text-sm text-muted">{s.mutedHint}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {spaces.map((sp) => {
                  const muted = p.muted_sections.includes(sp.id);
                  return (
                    <button
                      key={sp.id}
                      aria-pressed={muted}
                      onClick={() => save({ muted_sections: muted ? p.muted_sections.filter((x) => x !== sp.id) : [...p.muted_sections, sp.id] })}
                      className={muted ? "rounded-full bg-fg px-3 py-1.5 text-sm font-medium text-bg" : "rounded-full bg-sunken px-3 py-1.5 text-sm font-medium"}
                    >
                      {sp.icon} {sp.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
