# 04 - Stuck jobs recover

**What to build:** If a tick crashes halfway through a job, that job is picked up again a few minutes later instead of sitting in "running" forever. A job is never run twice concurrently.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] A job left running longer than a lease (a few minutes) becomes claimable again
- [ ] A job that keeps failing stops after a small number of attempts and is marked failed
- [ ] The claim still uses row locking so overlapping ticks never double-run a job
