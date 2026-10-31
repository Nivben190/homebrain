# 02 — Reminders stop going missing when the engine runs long

**What to build:** The minute engine run finishes inside its time limit even when an outside service hangs: every call it makes out (push, Google Calendar, weather, Hebcal, email, Google sign-in) gives up after a few seconds, each phase has its own time limit, and phases that would start too late wait for the next minute instead of being cut off mid-way. When Gmail says "too many requests" even after retrying, the scan stops without touching the space (a partial read must never delete found bills) and that inbox waits an hour before the next try. Connecting Gmail returns straight away and runs the first scan in the background; the space shows it scanning.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Outgoing calls in the engine have timeouts
- [ ] A slow phase is reported as timed out and the rest still run; phases past the budget are deferred
- [ ] A rate-limited scan leaves the space's items as they were and sets a retry-after on the connection; the cron skips it until then
- [ ] The Gmail callback redirects without waiting for the scan
