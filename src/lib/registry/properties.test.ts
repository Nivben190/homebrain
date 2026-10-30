import { describe, expect, it } from "vitest";
import { dueFromProps, formatPropertyValue, newPropertyId, type PropertyDef } from "./properties";

const schema: PropertyDef[] = [
  { id: "price", name: "Price", type: "price" },
  { id: "when", name: "When", type: "date" },
];

describe("dueFromProps", () => {
  it("a date alone is due at 09:00 in the home's timezone, wherever the code runs", () => {
    expect(dueFromProps(schema, { when: "2026-11-03" }, "Asia/Jerusalem")).toBe("2026-11-03T07:00:00.000Z");
    expect(dueFromProps(schema, { when: "2026-07-03" }, "Asia/Jerusalem")).toBe("2026-07-03T06:00:00.000Z");
  });
  it("keeps the time quick-add stored with the date", () => {
    expect(dueFromProps(schema, { when: "2026-11-03T10:30" }, "Asia/Jerusalem")).toBe("2026-11-03T08:30:00.000Z");
  });
  it("no date property or no value: not due", () => {
    expect(dueFromProps([schema[0]], { when: "2026-11-03" }, "Asia/Jerusalem")).toBeNull();
    expect(dueFromProps(schema, { when: "" }, "Asia/Jerusalem")).toBeNull();
    expect(dueFromProps(schema, {}, "Asia/Jerusalem")).toBeNull();
  });
});

describe("formatPropertyValue", () => {
  const def = (type: PropertyDef["type"]): PropertyDef => ({ id: "x", name: "X", type });
  it("formats each type for display", () => {
    expect(formatPropertyValue(def("price"), 1250, "en")).toBe("₪1,250");
    expect(formatPropertyValue(def("date"), "2026-11-03", "en")).toBe("Nov 3, 2026");
    expect(formatPropertyValue(def("checkbox"), true, "en")).toBe("✓");
    expect(formatPropertyValue(def("checkbox"), false, "en")).toBe("");
    expect(formatPropertyValue(def("rating"), 9, "en")).toBe("❤️❤️❤️❤️❤️");
    expect(formatPropertyValue(def("text"), "hi", "en")).toBe("hi");
    expect(formatPropertyValue(def("text"), null, "en")).toBe("");
  });
  it("new property ids are short and distinct", () => {
    const a = newPropertyId();
    expect(a).toMatch(/^[a-z0-9]{1,8}$/);
    expect(newPropertyId()).not.toBe(a);
  });
});
