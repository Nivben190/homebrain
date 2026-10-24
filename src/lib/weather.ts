// Weather from Open-Meteo (free, no key). Responses are cached by Next for 30 min.

export const DEFAULT_PLACE = { lat: 32.0853, lon: 34.7818, name: "Tel Aviv" };

export interface HourWeather {
  /** Local "YYYY-MM-DDTHH:00" in the requested timezone. */
  time: string;
  feels: number;
  rain: number;
}

export interface DayWeather {
  day: string;
  max: number;
  min: number;
  rain: number;
  code: number;
}

export interface Forecast {
  days: DayWeather[];
  hours: HourWeather[];
}

export async function getForecast(lat: number, lon: number, timeZone: string): Promise<Forecast | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "apparent_temperature,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: timeZone,
    forecast_days: "2",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      days: d.daily.time.map((day: string, i: number) => ({
        day,
        max: Math.round(d.daily.temperature_2m_max[i]),
        min: Math.round(d.daily.temperature_2m_min[i]),
        rain: d.daily.precipitation_probability_max[i] ?? 0,
        code: d.daily.weather_code[i],
      })),
      hours: d.hourly.time.map((time: string, i: number) => ({
        time,
        feels: Math.round(d.hourly.apparent_temperature[i]),
        rain: d.hourly.precipitation_probability[i] ?? 0,
      })),
    };
  } catch {
    return null;
  }
}

/** WMO weather code → emoji. */
export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  return "⛈️";
}

/** Too hot for paws on pavement (feels-like °C). */
export const HOT_FEELS = 30;
/** Comfortable for a walk. */
const COMFY_FEELS = 28;
const RAINY = 60;

export interface WalkAdvice {
  hot: boolean;
  /** Comfortable hours (06–22) like "before 9:00" / "after 18:00", when it's hot. */
  windows: string[];
  peakFeels: number;
}

/** When is it OK to walk the dog today? Only interesting on hot days. */
export function walkAdvice(hours: HourWeather[], day: string): WalkAdvice {
  const today = hours.filter((h) => h.time.startsWith(day));
  const daytime = today.filter((h) => {
    const hr = +h.time.slice(11, 13);
    return hr >= 6 && hr <= 22;
  });
  const peakFeels = Math.max(...daytime.map((h) => h.feels), -99);
  if (peakFeels < HOT_FEELS) return { hot: false, windows: [], peakFeels };
  const ok = daytime.filter((h) => h.feels < COMFY_FEELS).map((h) => +h.time.slice(11, 13));
  const windows: string[] = [];
  const morning = ok.filter((h) => h < 13);
  const evening = ok.filter((h) => h >= 13);
  // A morning window ends at the last comfy hour before it gets hot; an evening one starts when it cools.
  if (morning.length) windows.push(`<${String(Math.max(...morning) + 1).padStart(2, "0")}:00`);
  if (evening.length) windows.push(`>${String(Math.min(...evening)).padStart(2, "0")}:00`);
  return { hot: true, windows, peakFeels };
}

/** Weather at a given local "HH:mm" today, for outdoor routine reminders. */
export function weatherAt(hours: HourWeather[], day: string, hhmm: string): HourWeather | null {
  return hours.find((h) => h.time === `${day}T${hhmm.slice(0, 2)}:00`) ?? null;
}

/** One short line for an outdoor session, or null when the weather is fine. */
export function outdoorWarning(w: HourWeather | null, t: { rain: string; hot: string }): string | null {
  if (!w) return null;
  if (w.rain >= RAINY) return t.rain.replace("{p}", String(w.rain));
  if (w.feels >= HOT_FEELS) return t.hot.replace("{t}", String(w.feels));
  return null;
}
