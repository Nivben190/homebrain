import { describe, expect, it } from "vitest";
import type { Automation } from "@/lib/db-types";
import { planEvent } from "./events";

const wake = (id: string, delayMinutes: number) =>
  ({ id, trigger: { type: "event", event: "wake", delayMinutes } }) as unknown as Automation;

describe("planEvent", () => {
  it("fires the immediate automation now and queues the +N-minute follow-ups", () => {
    const now = new Date("2026-10-24T05:00:00Z");
    const plan = planEvent([wake("love", 0), wake("stretch", 5), wake("water", 30)], "me", "wake", now);
    expect(plan.now.map((a) => a.id)).toEqual(["love"]);
    expect(plan.jobs).toEqual([
      { automation_id: "stretch", user_id: "me", run_at: "2026-10-24T05:05:00.000Z", context: { event: "wake" } },
      { automation_id: "water", user_id: "me", run_at: "2026-10-24T05:30:00.000Z", context: { event: "wake" } },
    ]);
  });
});
