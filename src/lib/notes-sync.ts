// Apple Notes ⇄ space merge. Notes can only be read and appended to from
// Shortcuts, so the note never hears about ticks or deletes made in the app and
// its state is often stale. We therefore keep a snapshot of the note as of the
// last sync and apply only what changed *in the note* since then (three-way
// merge) for ticks: ticks/unticks made in the note are copied, stale boxes are
// ignored. For existence the note wins: every line has an item, removed lines
// delete it. Open app items missing from the note are returned to be appended.

export interface NoteLine {
  title: string;
  checked: boolean;
}

/**
 * Lines of a note's plain text, without its title (line 1). Understands Notes'
 * checklist export ("- [ ] milk", "- [x] eggs"), bullets, ☐/☑ and numbering.
 */
export function noteLines(text: string): NoteLine[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((raw) => {
      let line = raw.trim().replace(/^[-*•◦▪]\s*/u, "");
      let checked = false;
      const box = line.match(/^\[([ xX✓✔]?)\]\s*/u);
      if (box) {
        checked = box[1] !== "" && box[1] !== " ";
        line = line.slice(box[0].length);
      } else {
        const sym = line.match(/^([☐☑✅✓✔])[︎️]?\s*/u);
        if (sym) {
          checked = sym[1] !== "☐";
          line = line.slice(sym[0].length);
        }
      }
      return { title: line.replace(/^\d+[.)]\s*/, "").trim(), checked };
    })
    .filter((l) => l.title);
}

export const normTitle = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** The note as of the last sync: normalized line title → ticked. */
export type NoteState = Record<string, boolean>;

export interface MergeResult {
  /** Note lines to add to the space (ticked ones arrive done). */
  toAdd: NoteLine[];
  /** Ids of open items ticked in the note. */
  toCheck: string[];
  /** Ids of done items unticked in the note. */
  toUncheck: string[];
  /** Ids of items whose line was removed from the note. */
  toDelete: string[];
  /** Open space items the note doesn't have yet. */
  append: string[];
  /** Snapshot to keep for the next sync (the note after appending). */
  state: NoteState;
}

/**
 * Merges a note into a space. Without a previous snapshot (first sync) it only
 * adds lines and copies ticks — nothing is unticked or deleted.
 */
export function mergeNote(lines: NoteLine[], items: { id: string; title: string; done: boolean }[], prev: NoteState | null = null): MergeResult {
  const byKey = new Map<string, { id: string; title: string; done: boolean }[]>();
  for (const i of items) byKey.set(normTitle(i.title), [...(byKey.get(normTitle(i.title)) ?? []), i]);
  const now = new Map<string, NoteLine>();
  for (const l of lines) if (!now.has(normTitle(l.title))) now.set(normTitle(l.title), l);

  const toAdd: NoteLine[] = [];
  const toCheck: string[] = [];
  const toUncheck: string[] = [];
  for (const [k, l] of now) {
    const its = byKey.get(k);
    const was = prev?.[k];
    if (!its) {
      // The note is the list: a line always has an item, even one deleted in
      // the app (Shortcuts can't delete it from the note).
      toAdd.push(l);
      continue;
    }
    // New to the note (or first sync): only a tick carries over. Otherwise copy
    // the change if the note's box changed since last time.
    const changed = was === undefined ? l.checked : l.checked !== was;
    if (!changed) continue;
    for (const i of its) {
      if (l.checked && !i.done) toCheck.push(i.id);
      if (!l.checked && i.done) toUncheck.push(i.id);
    }
  }

  // A line removed from the note deletes its item. An empty note is more likely
  // a hiccup than a wish to wipe the list, so it deletes nothing.
  const toDelete: string[] = [];
  if (prev && now.size) for (const k of Object.keys(prev)) if (!now.has(k)) toDelete.push(...(byKey.get(k) ?? []).map((i) => i.id));

  const append: string[] = [];
  const appended = new Set<string>();
  for (const i of items) {
    const k = normTitle(i.title);
    if (i.done || now.has(k) || appended.has(k) || (prev && k in prev && now.size)) continue;
    appended.add(k);
    append.push(i.title);
  }

  const state: NoteState = {};
  for (const [k, l] of now) state[k] = l.checked;
  for (const k of appended) state[k] = false;
  return { toAdd, toCheck, toUncheck, toDelete, append, state };
}
