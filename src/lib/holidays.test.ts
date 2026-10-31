import { describe, expect, it } from "vitest";
import { holidaySpaceTitle, hostingHoliday } from "./holidays";

const item = (title: string, date: string, category = "holiday") => ({ title, date, category, subcat: "major" });

describe("holiday hosting offer", () => {
  const cal = [item("Candle lighting", "2027-04-02T18:40:00+03:00", "candles"), item("Erev Pesach", "2027-04-21"), item("Pesach I", "2027-04-22"), item("Shavuot", "2027-06-11")];

  it("offers the first hosted holiday within three weeks, counting from its erev", () => {
    const h = hostingHoliday(cal, "2027-04-05", false)!;
    expect(h).toMatchObject({ key: "Pesach-2027", name: "Pesach", hebrew: "פסח", day: "2027-04-21", days: 16 });
    expect(holidaySpaceTitle(h, "he")).toBe("פסח 2027");
    expect(holidaySpaceTitle(h, "en")).toBe("Pesach 2027");
  });

  it("nothing too early, on the day itself, or right after a holiday space was made", () => {
    expect(hostingHoliday(cal, "2027-03-20", false)).toBeNull();
    expect(hostingHoliday([item("Pesach I", "2027-04-22")], "2027-04-22", false)).toBeNull();
    expect(hostingHoliday(cal, "2027-04-05", true)).toBeNull();
  });

  it("ignores holidays nobody hosts for", () => {
    expect(hostingHoliday([item("Tu BiShvat", "2027-01-23"), item("Yom HaAtzma'ut", "2027-05-12")], "2027-01-10", false)).toBeNull();
  });
});
