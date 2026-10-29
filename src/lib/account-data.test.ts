import { describe, expect, it } from "vitest";
import { attachmentPaths, deletionPlan, fileNames, spaceCsv, toCsv } from "./account-data";

const item = (over: Partial<{ id: string; section_id: string; title: string; done: boolean; created_at: string; props: Record<string, unknown> }> = {}) => ({
  id: "i1",
  section_id: "s1",
  title: "Milk",
  done: false,
  created_at: "2026-10-29T10:00:00Z",
  props: {},
  ...over,
});

describe("account data", () => {
  it("writes CSV that Excel opens in Hebrew, quoting commas, quotes and new lines", () => {
    const csv = toCsv(["a", "b"], [["plain", 'say "hi", ok'], ["חלב", "line\nbreak"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('a,b\r\nplain,"say ""hi"", ok"\r\nחלב,"line\nbreak"\r\n');
  });

  it("turns a space's items into one row each, with a column per property", () => {
    const csv = spaceCsv([
      item({ props: { qty: 2, tags: ["dairy", "cold"], _photos: [{ path: "x" }] } }),
      item({ id: "i2", title: "Eggs", done: true, props: { due: { date: "2026-11-01" } } }),
    ]);
    const [head, first, second] = csv.slice(1).split("\r\n");
    expect(head).toBe("title,done,created_at,due,qty,tags");
    expect(first).toBe("Milk,no,2026-10-29T10:00:00Z,,2,dairy; cold");
    expect(second).toBe('Eggs,yes,2026-10-29T10:00:00Z,"{""date"":""2026-11-01""}",,');
  });

  it("names one CSV per space, safe for any file system and never twice the same", () => {
    expect(fileNames([{ icon: "🛒", title: "Groceries" }, { icon: "🛒", title: "Groceries" }, { icon: "📄", title: "a/b:c?" }])).toEqual([
      "🛒 Groceries.csv",
      "🛒 Groceries (2).csv",
      "📄 a-b-c-.csv",
    ]);
  });

  it("finds every stored file and thumbnail on items", () => {
    expect(attachmentPaths([item({ props: { _photos: [{ path: "h/s/i/a.jpg", thumb: "h/s/i/a_t.jpg" }, { path: "h/s/i/b.pdf" }, "junk"] } }), item()])).toEqual([
      "h/s/i/a.jpg",
      "h/s/i/a_t.jpg",
      "h/s/i/b.pdf",
    ]);
  });

  describe("deleting an account", () => {
    const me = "u1";
    const sections = [
      { id: "shared", owner_id: null },
      { id: "mine", owner_id: me },
    ];
    const items = [item({ section_id: "shared", props: { _photos: [{ path: "h/shared/i/a.jpg" }] } }), item({ section_id: "mine", props: { _photos: [{ path: "h/mine/i/b.jpg" }] } })];

    it("takes the whole home when nobody else lives there", () => {
      expect(deletionPlan({ userId: me, otherMembers: 0, sections, items })).toEqual({ deleteHome: true, files: ["h/shared/i/a.jpg", "h/mine/i/b.jpg"] });
    });

    it("leaves shared spaces for the partner and takes only private files", () => {
      expect(deletionPlan({ userId: me, otherMembers: 1, sections, items })).toEqual({ deleteHome: false, files: ["h/mine/i/b.jpg"] });
    });
  });
});
