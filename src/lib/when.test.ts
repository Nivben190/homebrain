import { describe, expect, it } from "vitest";
import { parseWhen } from "./when";

// Thursday 29 Oct 2026, 15:00 local.
const today = "2026-10-29";

describe("parseWhen", () => {
  it("finds a weekday and an hour", () => expect(parseWhen("dentist Tuesday 10", today)).toEqual({ text: "dentist", day: "2026-11-03", time: "10:00" }));
  it("reads tomorrow with a clock time", () => expect(parseWhen("call mom tomorrow at 18:30", today)).toEqual({ text: "call mom", day: "2026-10-30", time: "18:30" }));
  it("reads today alone", () => expect(parseWhen("pay rent today", today)).toEqual({ text: "pay rent", day: "2026-10-29", time: null }));
  it("reads pm", () => expect(parseWhen("vet friday 4pm", today)).toEqual({ text: "vet", day: "2026-10-30", time: "16:00" }));
  it("a weekday that is today means next week", () => expect(parseWhen("gym thursday", today).day).toBe("2026-11-05"));
  it("reads Hebrew days", () => expect(parseWhen("רופא שיניים ביום שלישי ב-10", today)).toEqual({ text: "רופא שיניים", day: "2026-11-03", time: "10:00" }));
  it("reads מחר", () => expect(parseWhen("להתקשר לאמא מחר", today)).toEqual({ text: "להתקשר לאמא", day: "2026-10-30", time: null }));
  it("reads a numeric date", () => expect(parseWhen("renew passport 15/11", today)).toEqual({ text: "renew passport", day: "2026-11-15", time: null }));
  it("leaves plain text alone", () => expect(parseWhen("milk", today)).toEqual({ text: "milk", day: null, time: null }));
  it("doesn't read a bare number as a time", () => expect(parseWhen("buy 10 eggs", today)).toEqual({ text: "buy 10 eggs", day: null, time: null }));
});
