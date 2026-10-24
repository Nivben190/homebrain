import { describe, expect, it } from "vitest";
import { mergeNote, noteLines } from "./notes-sync";

describe("noteLines", () => {
  it("drops the title line, bullets and blanks", () => {
    expect(noteLines("Shopping\n- Milk\n• Eggs\n\n1. Tomatoes\n  Cheese  ").map((l) => l.title)).toEqual(["Milk", "Eggs", "Tomatoes", "Cheese"]);
  });

  it("reads Apple Notes checklist export with ticks", () => {
    expect(noteLines("רשימת קניות\n- [ ] ספוגים למקלחת \n- [x] קבנוס \n- [X] מיונז\n☐ חלב\n☑ ביצים")).toEqual([
      { title: "ספוגים למקלחת", checked: false },
      { title: "קבנוס", checked: true },
      { title: "מיונז", checked: true },
      { title: "חלב", checked: false },
      { title: "ביצים", checked: true },
    ]);
  });
});

describe("mergeNote", () => {
  const items = [
    { id: "m", title: "Milk", done: false },
    { id: "b", title: "Bananas", done: false },
    { id: "r", title: "Bread", done: true },
  ];
  const line = (title: string, checked = false) => ({ title, checked });

  describe("first sync (no snapshot)", () => {
    it("adds new lines (ticked ones done), ticks items ticked in the note, appends app-only open items", () => {
      const r = mergeNote([line("milk", true), line("Bread"), line("Eggs"), line("Coffee", true), line("eggs")], items);
      expect(r.toAdd).toEqual([line("Eggs"), line("Coffee", true)]);
      expect(r.toCheck).toEqual(["m"]);
      expect(r.toUncheck).toEqual([]);
      expect(r.toDelete).toEqual([]);
      expect(r.append).toEqual(["Bananas"]);
      expect(r.state).toEqual({ milk: true, bread: false, eggs: false, coffee: true, bananas: false });
    });

    it("an unticked line doesn't re-open an item done in the app", () => {
      expect(mergeNote([line("Bread")], items).toUncheck).toEqual([]);
    });
  });

  describe("later syncs (with snapshot)", () => {
    const prev = { milk: false, bananas: false, bread: true };

    it("unticking in the note re-opens the item", () => {
      const r = mergeNote([line("Milk"), line("Bananas"), line("Bread")], items, prev);
      expect(r.toUncheck).toEqual(["r"]);
      expect(r.toCheck).toEqual([]);
    });

    it("removing a line from the note deletes the item, and doesn't append it back", () => {
      const r = mergeNote([line("Milk"), line("Bread", true)], items, prev);
      expect(r.toDelete).toEqual(["b"]);
      expect(r.append).toEqual([]);
      expect(r.state).toEqual({ milk: false, bread: true });
    });

    it("a tick made in the app survives a stale unticked box in the note", () => {
      const done = items.map((i) => (i.id === "m" ? { ...i, done: true } : i));
      const r = mergeNote([line("Milk"), line("Bananas"), line("Bread", true)], done, prev);
      expect(r.toUncheck).toEqual([]);
    });

    it("the note is the list: an item deleted in the app comes back while its line is in the note", () => {
      const r = mergeNote([line("Milk"), line("Bananas"), line("Bread", true), line("Gone")], items, { ...prev, gone: false });
      expect(r.toAdd).toEqual([line("Gone")]);
    });

    it("new app items are appended and remembered as unticked note lines", () => {
      const r = mergeNote([line("Milk"), line("Bread", true)], [...items, { id: "c", title: "Cheese", done: false }], { milk: false, bread: true });
      expect(r.append).toEqual(["Bananas", "Cheese"]);
      expect(r.state).toEqual({ milk: false, bread: true, bananas: false, cheese: false });
    });

    it("an empty note deletes nothing", () => {
      expect(mergeNote([], items, prev).toDelete).toEqual([]);
    });
  });
});
