# 05 - Calendar feed uses local dates

**What to build:** All-day entries in the private calendar feed fall on the day the item is due in the owner's timezone (Asia/Jerusalem by default). Today they use the UTC date, so items timed between midnight and 03:00 Israel time show up a day early.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] An item due at 00:30 Israel time appears on that same day in Apple Calendar
- [ ] Timed entries are unchanged
- [ ] A unit test covers the midnight edge in both summer and winter time
