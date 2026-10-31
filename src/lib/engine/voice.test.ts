import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { he } from "@/i18n/he";
import { pickLine, THEMES, themeOf } from "./voice";

describe("which voice a space gets", () => {
  it("your spaces, by icon, title or template", () => {
    expect(themeOf({ title: "זואי", icon: "🐶" })).toBe("dog");
    expect(themeOf({ title: "אילוף של זואי", icon: "🦴" })).toBe("dog");
    expect(themeOf({ title: "כושר", icon: "🏋️", template: "fitness" })).toBe("workout");
    expect(themeOf({ title: "מילים טובות לבובי", icon: "❤️" })).toBe("love");
    expect(themeOf({ title: "Morning routine", icon: "☀️" })).toBe("morning");
    expect(themeOf({ title: "House projects", icon: "🛠️" })).toBe("home");
    expect(themeOf({ title: "To buy", icon: "🛒" })).toBe("general");
  });

  it("words count when the icon says nothing, in Hebrew or English", () => {
    expect(themeOf({ title: "Dog walks", icon: "📋" })).toBe("dog");
    expect(themeOf({ title: "אימונים", icon: "📋" })).toBe("workout");
    expect(themeOf({ title: "Date night ideas", icon: "📋" })).toBe("love");
    expect(themeOf({ title: "השקיית צמחים", icon: "📋" })).toBe("plants");
    expect(themeOf({ title: "Vitamins", icon: "📋" })).toBe("health");
  });

  it("the item's title decides when the space is general", () => {
    expect(themeOf({ title: "Daily", icon: "📋" }, "Gym 45 min")).toBe("workout");
    expect(themeOf({ title: "Daily", icon: "📋" }, "Read 10 pages")).toBe("learn");
    expect(themeOf({ title: "Daily", icon: "📋" }, "Run the dishwasher")).toBe("general");
  });

  it("dog training is about the dog, not a workout", () => {
    expect(themeOf({ title: "Dog training", icon: "📋" })).toBe("dog");
  });
});

describe("the lines", () => {
  it("every theme has something to say at every moment, in both languages, with the right blanks", () => {
    for (const dict of [en, he])
      for (const theme of [...THEMES, "general" as const]) {
        const v = dict.voice[theme];
        for (const moment of ["start", "streak", "nudge", "due"] as const) expect([theme, moment, v[moment].length > 0]).toEqual([theme, moment, true]);
        for (const line of v.streak) expect([theme, line.includes("{streak}")]).toEqual([theme, true]);
        for (const line of [...v.start, ...v.due]) expect([theme, /\{(item|streak)\}/.test(line)]).toEqual([theme, false]);
      }
  });

  it("the same line all day for one item, but not always the same line", () => {
    const lines = en.voice.dog.start;
    expect(pickLine(lines, "item:2026-10-31")).toBe(pickLine(lines, "item:2026-10-31"));
    const days = Array.from({ length: 30 }, (_, i) => pickLine(lines, `item:2026-11-${String(i + 1).padStart(2, "0")}`));
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});
