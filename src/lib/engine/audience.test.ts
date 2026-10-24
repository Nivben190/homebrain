import { describe, expect, it } from "vitest";
import { reminderAudience } from "./audience";

const me = { user_id: "me", timezone: "Europe/London" };
const partner = { user_id: "partner", timezone: "Asia/Jerusalem" };

describe("reminderAudience", () => {
  it("reaches the whole household for a shared space", () => {
    expect(reminderAudience([me, partner], { owner_id: null }).eligible).toEqual([me, partner]);
  });
  it("reaches only the owner of a private space, in their timezone", () => {
    expect(reminderAudience([me, partner], { owner_id: "partner" })).toEqual({ eligible: [partner], timeZone: "Asia/Jerusalem" });
  });
  it("falls back to Israel time when nobody is eligible", () => {
    expect(reminderAudience([me], { owner_id: "gone" })).toEqual({ eligible: [], timeZone: "Asia/Jerusalem" });
  });
});
