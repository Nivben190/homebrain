import type { Dict } from "@/i18n/en";
import type { SectionView } from "@/lib/db-types";

/**
 * How each space type behaves in the UI. Screens read this table instead of
 * repeating their own `view === …` checks; adding a space type means one entry
 * here (plus its body view component).
 */
export interface SpaceType {
  /** Placeholder of the quick-add bar. */
  addPlaceholder: (t: Dict) => string;
  /** A new item opens its sheet right away (to set a schedule, photos, alerts, price). */
  opensSheetOnAdd: boolean;
  /** Items can be checked off and hide under "show done". */
  checkable: boolean;
  /** Can be kept in sync with an Apple Notes list. */
  notesSync: boolean;
  /** Draws its own empty state, so the generic "nothing here" is skipped. */
  ownEmptyState: boolean;
  /** Item dates come from date properties (gallery dates are just memories). */
  datesAreDue: boolean;
  /** Sends its own reminders (shown with a bell when picking a template). */
  reminds: boolean;
  /** Shows the photos field in the item sheet. */
  photos: boolean;
  /** Has the quick-add bar (Spending fills itself from purchase texts). */
  quickAdd: boolean;
}

const base: SpaceType = {
  addPlaceholder: (t) => t.sections.addItem,
  opensSheetOnAdd: false,
  checkable: false,
  notesSync: false,
  ownEmptyState: false,
  datesAreDue: true,
  reminds: false,
  photos: false,
  quickAdd: true,
};

export const SPACE_TYPES: Record<SectionView, SpaceType> = {
  list: { ...base, notesSync: true },
  checklist: { ...base, checkable: true, notesSync: true },
  notes: base,
  tracker: { ...base, opensSheetOnAdd: true, reminds: true },
  gallery: { ...base, addPlaceholder: (t) => t.memories.addPlaceholder, opensSheetOnAdd: true, ownEmptyState: true, datesAreDue: false, photos: true },
  dates: { ...base, addPlaceholder: (t) => t.dates.addPlaceholder, opensSheetOnAdd: true, ownEmptyState: true, reminds: true },
  subscriptions: { ...base, addPlaceholder: (t) => t.subs.addPlaceholder, opensSheetOnAdd: true, ownEmptyState: true },
  commit: { ...base, addPlaceholder: (t) => t.commit.addPlaceholder, ownEmptyState: true, datesAreDue: false, reminds: true, quickAdd: false },
  fridge: { ...base, addPlaceholder: (t) => t.fridge.addPlaceholder, ownEmptyState: true, datesAreDue: false },
  spend: { ...base, ownEmptyState: true, datesAreDue: false, quickAdd: false },
  wheel: { ...base, addPlaceholder: (t) => t.wheel.addPlaceholder, ownEmptyState: true, datesAreDue: false },
};

export const spaceType = (view: SectionView): SpaceType => SPACE_TYPES[view] ?? base;
