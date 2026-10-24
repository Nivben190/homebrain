# 11 - One reminder sender

**What to build:** Prefactor. Item reminders, date reminders and tracker reminders share one path: work out who should get it (owner / household, with timezone fallback), respect quiet hours, write the card, send the push. Today two near-identical copies of this exist.

No visible change for users.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] One shared audience helper and one shared send helper are used by every reminder kind
- [ ] Quiet hours, language and card wording are unchanged
- [ ] Tests cover audience selection (private vs shared space) and quiet hours
