import { describe, expect, it } from "vitest";
import { normalizePhone, renderActions, to12h } from "./render";
import { referencedSections, renderTemplate, type TemplateContext } from "./templates";
import { automationDefSchema } from "./types";

const SECTION = "6f1c2a52-8b0e-4c47-9a83-0d5f0c6a1b11";

const ctx: TemplateContext = {
  me: { name: "Niv", phone: "050-111-2222", email: "niv@example.com" },
  partner: { name: "Naomi", phone: "052-333-4444", email: "naomi@example.com" },
  now: new Date("2026-10-18T04:15:00Z"),
  timeZone: "Asia/Jerusalem",
  locale: "en",
  pick: (id) => (id === SECTION ? "You make every morning better ❤️" : ""),
};

describe("templates", () => {
  it("renders people, time and random picks", () => {
    expect(renderTemplate("Hi {{partner}}, {{random:" + SECTION + "}} — {{me}} ({{time}})", ctx)).toBe(
      "Hi Naomi, You make every morning better ❤️ — Niv (07:15)",
    );
  });

  it("leaves unknown tokens visible", () => {
    expect(renderTemplate("{{nope}}", ctx)).toBe("{{nope}}");
  });

  it("accepts the plan's {{user.name}} and {{partner.name}} spellings", () => {
    expect(renderTemplate("{{user.name}} & {{partner.name}}", ctx)).toBe(renderTemplate("{{me}} & {{partner}}", ctx));
  });

  it("finds referenced sections", () => {
    expect(referencedSections(`a {{random:${SECTION}}} b {{ random:${SECTION} }}`)).toEqual([SECTION]);
  });
});

describe("to12h", () => {
  it.each([
    ["00:30", "12:30 AM"],
    ["08:00", "8:00 AM"],
    ["12:00", "12:00 PM"],
    ["20:05", "8:05 PM"],
  ])("%s → %s", (input, out) => expect(to12h(input)).toBe(out));
});

describe("normalizePhone", () => {
  it.each([
    ["050-111-2222", "972501112222"],
    ["+972 50 111 2222", "972501112222"],
    ["00972501112222", "972501112222"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
});

describe("renderActions", () => {
  it("builds the morning-love run: push title + WhatsApp link to partner", () => {
    const out = renderActions(
      "Morning love",
      [
        { type: "push", title: "Good morning ☀️", body: "Tell {{partner}} something nice" },
        { type: "whatsapp", to: "partner", text: "{{random:" + SECTION + "}}" },
        { type: "checkoff", label: "Sent ❤️" },
      ],
      ctx,
    );
    expect(out.title).toBe("Good morning ☀️");
    expect(out.body).toBe("Tell Naomi something nice");
    expect(out.rendered[0]).toEqual({
      kind: "link",
      icon: "💚",
      label: "WhatsApp Naomi",
      href: "https://wa.me/972523334444?text=" + encodeURIComponent("You make every morning better ❤️"),
      external: true,
    });
    expect(out.rendered.at(-1)).toEqual({ kind: "done", label: "Sent ❤️" });
  });

  it("uses the iOS sms: body format and the Shortcuts alarm scheme", () => {
    const out = renderActions(
      "x",
      [
        { type: "sms", to: "partner", text: "On my way" },
        { type: "alarm", time: "06:45" },
        { type: "alarm", time: "18:00", label: "Gym with {{partner}}" },
      ],
      ctx,
    );
    expect(out.rendered[0]).toMatchObject({ href: "sms:+972523334444&body=On%20my%20way" });
    const params = (href: string) => new URL(href).searchParams;
    const plain = out.rendered[1] as { href: string; label: string };
    expect(plain.href.startsWith("shortcuts://x-callback-url/run-shortcut?name=Brain%20Set%20Alarm&input=text&text=")).toBe(true);
    expect(params(plain.href).get("text")).toBe("6:45 AM\nHome Brain");
    expect(params(plain.href).get("x-success")).toBe("clock-alarm://");
    const named = out.rendered[2] as { href: string; label: string };
    expect(params(named.href).get("text")).toBe("6:00 PM\nGym with Naomi");
    expect(named.label).toBe("18:00 · Gym with Naomi");
  });

  it("turns email and create_item into server effects", () => {
    const out = renderActions(
      "x",
      [
        { type: "email", to: "me", subject: "Weekly", body: "Hi {{me}}" },
        { type: "create_item", sectionId: SECTION, title: "Buy dog food" },
      ],
      ctx,
    );
    expect(out.effects).toEqual([
      { kind: "email", to: "niv@example.com", subject: "Weekly", body: "Hi Niv", note: 0 },
      { kind: "create_item", sectionId: SECTION, title: "Buy dog food" },
    ]);
  });

  it("warns instead of crashing when a phone is missing", () => {
    const out = renderActions("x", [{ type: "whatsapp", to: "partner", text: "hi" }], { ...ctx, partner: null });
    expect(out.rendered[0]).toMatchObject({ kind: "note", icon: "⚠️" });
  });
});

describe("automationDefSchema", () => {
  it("accepts a valid automation and fills defaults", () => {
    const parsed = automationDefSchema.parse({
      name: "Stretch",
      trigger: { type: "event", event: "wake", delayMinutes: 5 },
      actions: [{ type: "push", title: "Stretch time 🧘" }],
    });
    expect(parsed.conditions).toEqual([]);
    expect(parsed.actions[0]).toMatchObject({ body: "" });
  });

  it("rejects malformed schedule times", () => {
    expect(
      automationDefSchema.safeParse({
        name: "x",
        trigger: { type: "schedule", days: [1], times: ["25:00"] },
        actions: [{ type: "push", title: "x" }],
      }).success,
    ).toBe(false);
  });
});

describe("notesShortcutUrl", () => {
  it("passes token + list id as the Shortcut input, so the Shortcut is the same for everyone", async () => {
    const { notesShortcutUrl } = await import("./render");
    const href = notesShortcutUrl("tok123", "6f1c2a52-8b0e-4c47-9a83-0d5f0c6a1b11");
    expect(href.startsWith("shortcuts://x-callback-url/run-shortcut?name=Brain%20Notes%20Sync&input=text&text=")).toBe(true);
    expect(JSON.parse(new URL(href).searchParams.get("text")!)).toEqual({ token: "tok123", section: "6f1c2a52-8b0e-4c47-9a83-0d5f0c6a1b11" });
  });
});
