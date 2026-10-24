# 16 - Add to Google Calendar

**What to build:** Connect Google Calendar once in Settings, then items with dates and the calendar automation action create real events in your Google Calendar (not just an add-event link). Uses the existing Google sign-in client with a calendar scope, kept separate from Gmail connections.

**Blocked by:** 15 - Due dates trigger reminders

**Status:** done (needs the Google Calendar API enabled in the Cloud project, and the 0013 migration)

- [ ] Connect / disconnect Google Calendar from Settings, showing which account
- [ ] An item with a date can be added to Google Calendar in one tap; editing the date updates the event
- [ ] The calendar automation action creates an event when connected and falls back to the link when not
- [ ] Disconnecting doesn't affect Gmail subscription spaces
