# 10 - One table per space type

**What to build:** Prefactor. Every space type (list, checklist, notes, tracker, gallery, dates, subscriptions, pets...) is described in one place: its body view, its item sheet, its add placeholder, whether adding opens the sheet, and its icon. The space screen, item sheet, space settings and pet page read from that table instead of each repeating their own if/else chain.

No visible change for users.

**Blocked by:** None - can start immediately

**Status:** ready-for-agent

- [ ] Each space type has exactly one entry describing its UI behaviour
- [ ] The repeated view-type checks across screens are gone
- [ ] Every existing space type looks and behaves the same as before (manual pass on each)
- [ ] Type-check, lint and all tests pass
