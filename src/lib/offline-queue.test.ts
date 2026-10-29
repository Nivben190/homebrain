import { describe, expect, it, vi } from "vitest";
import { isNetworkError, replay, type QueuedWrite, type QueueStore } from "./offline-queue";

function memory(ops: QueuedWrite[]): QueueStore & { left: () => QueuedWrite[] } {
  let rows = ops.map((op, key) => ({ key, op }));
  return {
    all: async () => rows,
    add: async (op) => void rows.push({ key: rows.length, op }),
    remove: async (key) => void (rows = rows.filter((r) => r.key !== key)),
    left: () => rows.map((r) => r.op),
  };
}
const op = (title: string): QueuedWrite => ({ table: "items", action: "upsert", values: { title } });

describe("offline queue", () => {
  it("tells a lost connection from a refused write", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError({ message: "anything" }, false)).toBe(true);
    expect(isNetworkError({ message: "violates row-level security" }, true)).toBe(false);
  });

  it("replays every write in order once back online", async () => {
    const store = memory([op("a"), op("b")]);
    const seen: string[] = [];
    expect(await replay(store, async (o) => (seen.push(String(o.values?.title)), { error: null }))).toBe(0);
    expect(seen).toEqual(["a", "b"]);
    expect(store.left()).toEqual([]);
  });

  it("stops at the first network failure and keeps the rest", async () => {
    const store = memory([op("a"), op("b"), op("c")]);
    let n = 0;
    const left = await replay(store, async () => (n++ === 1 ? { error: new TypeError("Failed to fetch") } : { error: null }));
    expect(left).toBe(2);
    expect(store.left().map((o) => o.values?.title)).toEqual(["b", "c"]);
  });

  it("drops a write the database refuses and carries on", async () => {
    const store = memory([op("a"), op("b")]);
    const dropped = vi.fn();
    const left = await replay(store, async (o) => (o.values?.title === "a" ? { error: { message: "permission denied" } } : { error: null }), dropped);
    expect(left).toBe(0);
    expect(dropped).toHaveBeenCalledOnce();
  });
});
