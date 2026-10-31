# 04 — The owner hears about problems first

**What to build:** The app's owner (SIGNUP_ALERT_EMAIL) gets an email when an engine phase fails, or when the engine was silent for over 5 minutes (noticed by the next run and by the half-hourly cron), at most one per hour. Every Sunday morning they get "are they staying": new homes this week, how many of those ticked something in their first day, homes active this week, and which "Help me choose" goals were picked (now recorded). Anyone can send feedback from Me, which emails the owner.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Failed phase / silent engine email, throttled to one an hour
- [ ] Weekly retention email, sent once per week
- [ ] Finder goal picks are recorded as events
- [ ] Me → Send feedback emails the owner, rate limited
