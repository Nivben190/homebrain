# 03 — Database security and speed fix

**What to build:** Signed-out visitors can't call `my_household_id()` or `rls_auto_enable()`; the home-member policies that call `my_household_id()` apply to signed-in users only, so a signed-out request sees nothing rather than an error. The six role policies on spaces and automations evaluate `auth.uid()` once per query, and the 8 foreign keys the advisor lists get indexes. Applied to production; advisor warnings for these are gone.

**Blocked by:** None — can start immediately.

**Status:** done

- [ ] Migration revokes anon execute and moves those policies to `authenticated`
- [ ] Role policies use `(select auth.uid())`
- [ ] 8 FK indexes
- [ ] The functions test expects no anon-callable security-definer function at all
