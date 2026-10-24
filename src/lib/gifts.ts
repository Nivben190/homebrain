// Gift ideas jotted on a date (birthdays, anniversaries) during the year.

export const GIFTS_PROP = "_gifts";

export interface GiftIdea {
  text: string;
  done?: boolean;
}

export function readGifts(props: Record<string, unknown>): GiftIdea[] {
  const raw = props[GIFTS_PROP];
  return Array.isArray(raw) ? raw.filter((g): g is GiftIdea => !!g && typeof g.text === "string" && g.text.trim() !== "") : [];
}

const GIFTY = /birthday|b-?day|anniversary|🎂|🎁|💍|יום הולדת|יומולדת|יום נישואין|נישואים/i;

/** Dates that call for a present: anything with gift ideas, or that looks like a birthday / anniversary. */
export const wantsGift = (title: string, props: Record<string, unknown>) => readGifts(props).length > 0 || GIFTY.test(title);

/** Body of the heads-up push: the open ideas, or a nudge to think of some. */
export function giftLine(props: Record<string, unknown>, t: { giftIdeas: string; noGiftIdeas: string }): string {
  const open = readGifts(props).filter((g) => !g.done).map((g) => g.text);
  return open.length ? `${t.giftIdeas} ${open.join(", ")}` : t.noGiftIdeas;
}
