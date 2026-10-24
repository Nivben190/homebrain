# 01 - Keep each person's tokens private

**What to build:** Each household member can see the other's name, locale and avatar, but never their secret hook token or calendar-feed token. Today any member can read every column of the other's profile, which would let them fire the other person's Shortcut events, check items in as them, and read their private spaces through the calendar feed.

Move the secrets out of reach of the household read rule (e.g. a self-only table or column-level access) and make the session loader stop pulling every column of every member.

**Blocked by:** None - can start immediately

**Status:** done

- [ ] Signed in as one member, reading the partner's profile returns no hook token and no calendar-feed token
- [ ] Each person still sees and copies their own tokens on the iPhone setup screen
- [ ] Shortcuts (wake, check-in, Notes sync) and the calendar feed keep working with the existing tokens
- [ ] A migration applies cleanly to production without rotating anyone's tokens
