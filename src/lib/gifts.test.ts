import { describe, expect, it } from "vitest";
import { giftLine, readGifts, wantsGift } from "./gifts";

const t = { giftIdeas: "🎁 Ideas:", noGiftIdeas: "🎁 No gift ideas yet" };

describe("gift ideas", () => {
  it("reads ideas and drops blanks", () => {
    expect(readGifts({ _gifts: [{ text: "Book" }, { text: " " }] })).toEqual([{ text: "Book" }]);
  });
  it("knows which dates want a gift, in English and Hebrew", () => {
    expect(wantsGift("Naomi's birthday 🎂", {})).toBe(true);
    expect(wantsGift("יום הולדת לאמא", {})).toBe(true);
    expect(wantsGift("Car test", {})).toBe(false);
    expect(wantsGift("Car test", { _gifts: [{ text: "x" }] })).toBe(true);
  });
  it("lists open ideas, or nudges when there are none", () => {
    expect(giftLine({ _gifts: [{ text: "Book" }, { text: "Scarf", done: true }, { text: "Spa" }] }, t)).toBe("🎁 Ideas: Book, Spa");
    expect(giftLine({}, t)).toBe("🎁 No gift ideas yet");
  });
});
