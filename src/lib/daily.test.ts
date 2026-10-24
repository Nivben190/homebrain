import { describe, expect, it } from "vitest";
import { outdoorWarning, walkAdvice, weatherAt, type HourWeather } from "./weather";
import { holyStatus, type HebcalItem } from "./jewish";

const hoursFor = (day: string, feels: (h: number) => number, rain: (h: number) => number = () => 0): HourWeather[] =>
  Array.from({ length: 24 }, (_, h) => ({ time: `${day}T${String(h).padStart(2, "0")}:00`, feels: feels(h), rain: rain(h) }));

describe("walkAdvice", () => {
  it("is quiet on comfortable days", () => {
    expect(walkAdvice(hoursFor("2026-07-01", () => 25), "2026-07-01")).toMatchObject({ hot: false, windows: [] });
  });

  it("finds the morning and evening windows on a hot day", () => {
    // Comfy until 8:59, hot 9–17, comfy again from 18.
    const hours = hoursFor("2026-07-01", (h) => (h < 9 || h >= 18 ? 26 : 34));
    expect(walkAdvice(hours, "2026-07-01")).toEqual({ hot: true, windows: ["<09:00", ">18:00"], peakFeels: 34 });
  });
});

describe("outdoor warnings", () => {
  const t = { rain: "🌧️ {p}% rain", hot: "🔥 feels {t}°" };
  const hours = hoursFor("2026-07-01", (h) => (h === 13 ? 35 : 24), (h) => (h === 19 ? 80 : 10));
  it("warns about rain or heat at the session hour, otherwise nothing", () => {
    expect(outdoorWarning(weatherAt(hours, "2026-07-01", "19:00"), t)).toBe("🌧️ 80% rain");
    expect(outdoorWarning(weatherAt(hours, "2026-07-01", "13:30"), t)).toBe("🔥 feels 35°");
    expect(outdoorWarning(weatherAt(hours, "2026-07-01", "07:00"), t)).toBeNull();
  });
});

describe("holyStatus", () => {
  const items: HebcalItem[] = [
    { title: "Candle lighting: 17:47", date: "2026-10-16T17:47:00+03:00", category: "candles" },
    { title: "Havdalah: 18:43", date: "2026-10-17T18:43:00+03:00", category: "havdalah" },
    { title: "Candle lighting: 17:39", date: "2026-10-23T17:39:00+03:00", category: "candles" },
    { title: "Havdalah: 18:36", date: "2026-10-24T18:36:00+03:00", category: "havdalah" },
    { title: "Chanukah: 1 Candle", date: "2026-12-04", category: "holiday", subcat: "major" },
  ];

  it("knows it's Shabbat between candles and havdalah", () => {
    const s = holyStatus(items, new Date("2026-10-17T12:00:00+03:00"));
    expect(s.now).toBe(true);
    expect(s.havdalah).toBe("2026-10-17T18:43:00+03:00");
  });

  it("points at next Friday after havdalah", () => {
    const s = holyStatus(items, new Date("2026-10-17T19:00:00+03:00"));
    expect(s).toMatchObject({ now: false, candles: "2026-10-23T17:39:00+03:00", erevDay: "2026-10-23" });
    expect(s.holidays[0]).toMatchObject({ day: "2026-12-04" });
  });
});
