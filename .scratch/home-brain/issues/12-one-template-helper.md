# 12 - One text-template helper

**What to build:** Prefactor. All filling of {name}-style placeholders in UI text goes through one i18n helper, and the inline Hebrew/English choices in server actions and screens move into the translation files.

No visible change for users.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] The copied fill helpers are replaced by one shared helper
- [ ] No inline Hebrew-vs-English wording choices remain outside the translation files
- [ ] Both languages render the same text as before
