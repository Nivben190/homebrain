import { describe, expect, it } from "vitest";
import { claimWithRetry, runPhases } from "./phases";

const noWait = async () => {};

describe("runPhases", () => {
  it("keeps running the other phases when one throws, and reports which failed", async () => {
    const ran: string[] = [];
    const { outcomes, phases } = await runPhases([
      ["schedules", async () => (ran.push("schedules"), ["a"])],
      ["items", async () => {
        throw new Error("Internal server error.");
      }],
      ["jobs", async () => (ran.push("jobs"), ["b", "c"])],
    ]);
    expect(ran).toEqual(["schedules", "jobs"]);
    expect(outcomes).toEqual(["a", "b", "c"]);
    expect(phases).toEqual([
      { phase: "schedules", ok: true },
      { phase: "items", ok: false, error: "Error: Internal server error." },
      { phase: "jobs", ok: true },
    ]);
  });

  it("describes a thrown non-Error (like a Supabase error object) by its message", async () => {
    const { phases } = await runPhases([
      ["items", async () => {
        throw { message: "Internal server error." };
      }],
    ]);
    expect(phases[0]).toEqual({ phase: "items", ok: false, error: "Internal server error." });
  });
});

describe("claimWithRetry", () => {
  it("retries a failed claim once and returns the second answer", async () => {
    let calls = 0;
    const rows = await claimWithRetry(async () => (++calls === 1 ? { data: null, error: { message: "boom" } } : { data: [1, 2], error: null }), noWait);
    expect(calls).toBe(2);
    expect(rows).toEqual([1, 2]);
  });

  it("throws when the retry fails too", async () => {
    let calls = 0;
    await expect(claimWithRetry(async () => (calls++, { data: null, error: { message: "still down" } }), noWait)).rejects.toMatchObject({ message: "still down" });
    expect(calls).toBe(2);
  });

  it("treats a null result as no rows", async () => {
    expect(await claimWithRetry(async () => ({ data: null, error: null }), noWait)).toEqual([]);
  });
});
