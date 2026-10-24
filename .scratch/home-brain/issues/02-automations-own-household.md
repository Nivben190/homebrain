# 02 - Automations only reach your own household

**What to build:** An automation can only point at spaces that belong to its household (and, for private spaces, that its owner can see). Today the space ids used by "create item", "open space" and random-pick templates are taken on trust, and the engine runs with full database access, so it would read from or write into any space.

Check on save, and check again in the engine before reading or writing.

**Blocked by:** None - can start immediately

**Status:** done

- [ ] Saving an automation that targets a space outside the household is refused with a clear message
- [ ] A random-pick template naming a foreign or someone else's private space renders as empty, never leaking titles
- [ ] The engine skips create-item into a space outside the automation's household and records why
- [ ] Existing automations that target your own spaces keep working unchanged
- [ ] Tests cover the save-time and run-time checks
