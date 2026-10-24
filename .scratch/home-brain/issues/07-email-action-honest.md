# 07 - Email action reports the truth

**What to build:** The run card only says "Email sent to X" when the email actually went out. If email isn't set up, or sending fails, the card says so and the run history keeps the reason.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] With no email key configured, the card shows "not sent - email isn't set up"
- [ ] A provider error shows "couldn't send" and is recorded on the run
- [ ] A successful send still shows "Email sent to X"
