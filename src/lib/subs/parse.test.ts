import { describe, expect, it } from "vitest";
import { chargesFrom, detectCycle, findAmounts, htmlToText, parseLooseDate, pickAmount, rollForward, summarize, type MailMessage } from "./parse";

const msg = (from: string, subject: string, text: string, day: string, id = `${from}-${day}`): MailMessage => ({ id, from, subject, text, date: new Date(`${day}T08:00:00Z`) });

describe("money", () => {
  it("reads prices in common formats", () => {
    expect(findAmounts("₪29.90").map((a) => [a.value, a.currency])).toEqual([[29.9, "ILS"]]);
    expect(findAmounts("סה״כ 54.90 ש״ח").map((a) => [a.value, a.currency])).toEqual([[54.9, "ILS"]]);
    expect(findAmounts("$1,299.00 USD").map((a) => a.value)).toEqual([1299]);
    expect(findAmounts("€9,99")[0].value).toBe(9.99);
    expect(findAmounts("₪0.00")).toEqual([]);
  });
  it("prefers the total over line items and tax", () => {
    expect(pickAmount("Plan ₪25.56\nSubtotal ₪25.56\nVAT ₪4.34\nTotal ₪29.90")?.value).toBe(29.9);
    expect(pickAmount("Premium Individual\n₪21.90")?.value).toBe(21.9);
  });
});

describe("dates & cycles", () => {
  it("parses dates in English, Hebrew and numeric (day first)", () => {
    expect(parseLooseDate("Renews 3 November 2026")).toBe("2026-11-03");
    expect(parseLooseDate("Renews Nov 3, 2026")).toBe("2026-11-03");
    expect(parseLooseDate("מתחדש ב-3 בנובמבר 2026")).toBe("2026-11-03");
    expect(parseLooseDate("next billing 03/11/2026")).toBe("2026-11-03");
    expect(parseLooseDate("31.02.2026")).toBeNull();
  });
  it("detects the billing cycle", () => {
    expect(detectCycle("YouTube Premium (Monthly)")).toBe("monthly");
    expect(detectCycle("iCloud+ (Annual)")).toBe("yearly");
    expect(detectCycle("מנוי שנתי")).toBe("yearly");
    expect(detectCycle("thanks!")).toBeNull();
  });
  it("rolls the next renewal forward from the last charge", () => {
    expect(rollForward("2026-09-15", "monthly", "2026-10-23")).toBe("2026-11-15");
    expect(rollForward("2026-01-31", "monthly", "2026-02-10")).toBe("2026-02-28");
    expect(rollForward("2025-12-01", "yearly", "2026-10-23")).toBe("2026-12-01");
  });
});

describe("emails → subscriptions", () => {
  const apple = htmlToText(`<table><tr><td>App Store</td></tr>
    <tr><td>YouTube: Watch, Listen, Stream</td></tr><tr><td>YouTube Premium (Monthly)</td></tr><tr><td>Renews 3 November 2026</td></tr><tr><td>Report a Problem</td></tr><tr><td>&#8362;29.90</td></tr>
    <tr><td>iCloud+</td></tr><tr><td>iCloud+ with 200 GB (Monthly)</td></tr><tr><td>Renews 5 November 2026</td></tr><tr><td>&#8362;14.90</td></tr>
    <tr><td>Subtotal</td><td>&#8362;38.21</td></tr><tr><td>VAT</td><td>&#8362;6.59</td></tr><tr><td>Total</td><td>&#8362;44.80</td></tr></table>`);

  it("splits an App Store receipt into its subscriptions", () => {
    const c = chargesFrom(msg("Apple <no_reply@email.apple.com>", "Your receipt from Apple.", apple, "2026-10-03"));
    expect(c.map((x) => [x.name, x.amount, x.cycle, x.renews])).toEqual([
      ["YouTube Premium", 29.9, "monthly", "2026-11-03"],
      ["iCloud+ with 200 GB", 14.9, "monthly", "2026-11-05"],
    ]);
  });

  it("ignores Apple mail that isn't a receipt, and one-off purchases", () => {
    expect(chargesFrom(msg("Apple <news@insideapple.apple.com>", "Meet the new iPhone", "₪4,000", "2026-10-03"))).toEqual([]);
    expect(chargesFrom(msg("Apple <no_reply@email.apple.com>", "Your receipt from Apple.", "Some Game\nReport a Problem\n₪9.90\nTotal ₪9.90", "2026-10-03"))).toEqual([]);
  });

  it("recognises known services, but not their non-billing mail", () => {
    const n = chargesFrom(msg("Netflix <info@account.netflix.com>", "Your payment was received", "Your monthly plan: Standard\nTotal: 54.90 ₪", "2026-10-10"));
    expect(n.map((x) => [x.key, x.amount, x.currency, x.cycle])).toEqual([["netflix", 54.9, "ILS", "monthly"]]);
    expect(chargesFrom(msg("Netflix <info@mailer.netflix.com>", "New on Netflix this week", "Watch now", "2026-10-11"))).toEqual([]);
    expect(chargesFrom(msg("Amazon <shipment@amazon.com>", "Your order has shipped", "Total $45.00", "2026-10-11"))).toEqual([]);
  });

  it("skips news, policy updates, failed payments and duplicate copies", () => {
    expect(chargesFrom(msg("OpenAI <noreply@email.openai.com>", "Updates to OpenAI’s Privacy Policy", "Our pro plan…", "2026-09-16"))).toEqual([]);
    expect(chargesFrom(msg("OpenAI <noreply@email.openai.com>", "New: Lower GPT-5.6 pricing and Fast mode", "$0.20 per million tokens", "2026-07-30"))).toEqual([]);
    expect(chargesFrom(msg("Anthropic <invoice@mail.anthropic.com>", "$20.00 payment to Anthropic, PBC was unsuccessful", "Amount $20.00", "2026-10-21"))).toEqual([]);
    const receipt = (id: string) => msg("Anthropic <invoice@mail.anthropic.com>", "Your receipt from Anthropic, PBC #2759", "Claude Pro\nTotal $20.00", "2026-10-23", id);
    const [claude] = summarize([...chargesFrom(receipt("a")), ...chargesFrom(receipt("b"))], "2026-10-23");
    expect([claude.name, claude.amount, claude.charges.length]).toEqual(["Claude", 20, 1]);
  });

  it("needs a regular pattern before trusting an unknown sender", () => {
    const one = [msg("Gym <billing@mygym.co.il>", "קבלה על תשלום", "סה״כ שולם 199 ₪", "2026-09-01")];
    expect(summarize(one.flatMap(chargesFrom), "2026-10-23")).toEqual([]);
    const three = ["2026-08-01", "2026-09-01", "2026-10-01"].map((d) => msg("Gym <billing@mygym.co.il>", "קבלה על תשלום", "סה״כ שולם 199 ₪", d));
    const [gym] = summarize(three.flatMap(chargesFrom), "2026-10-23");
    expect([gym.key, gym.amount, gym.cycle, gym.last, gym.next, gym.stale]).toEqual(["mail:mygym.co.il", 199, "monthly", "2026-10-01", "2026-11-01", false]);
  });

  it("uses the stated renewal date and flags ones that stopped charging", () => {
    const subs = summarize(
      [
        ...chargesFrom(msg("Apple <no_reply@email.apple.com>", "Your receipt from Apple.", apple, "2026-10-03")),
        ...chargesFrom(msg("Spotify <no-reply@spotify.com>", "Your Spotify Premium receipt", "Premium Individual\nTotal ₪21.90", "2026-05-02")),
      ],
      "2026-10-23",
    );
    const by = Object.fromEntries(subs.map((s) => [s.name, s]));
    expect(by["YouTube Premium"].next).toBe("2026-11-03");
    expect(by.Spotify.stale).toBe(true);
    expect(subs.map((s) => s.next)).toEqual(["2026-11-02", "2026-11-03", "2026-11-05"]);
  });
});
