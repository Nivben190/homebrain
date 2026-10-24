# 13 - Missing engine tests

**What to build:** The engine has the tests the original plan asked for: spring daylight-saving (the skipped hour), the wake event creating its delayed follow-ups, and a job being claimed only once by overlapping ticks.

**Blocked by:** None - can start immediately

**Status:** partial — the concurrent-claim DB test still needs a local or branch database

- [ ] A schedule at a time that doesn't exist on the spring-forward day fires once, at a sensible time
- [ ] A wake event creates the immediate run and the +N-minute follow-up jobs
- [ ] A test (against a local or branch database) shows two concurrent claims never return the same job
