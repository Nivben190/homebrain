# 08 - Sign-up only for invited people

**What to build:** Strangers can't create an account. A new account is allowed only for an email on the allowed list or for someone joining with the household invite code. This replaces relying on an optional setting that may be unset in production.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] Signing up with an unknown email and no invite code is refused
- [ ] Joining with a valid household invite code works
- [ ] Existing accounts sign in unchanged
- [ ] The production allowed-email setting is verified (set or intentionally empty) and documented
