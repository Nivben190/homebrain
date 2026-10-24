import type { Action } from "./types";
import { referencedSections } from "./templates";

/** Every space an automation's actions point at: open/create targets and {{random:<id>}} picks. */
export function sectionRefs(actions: Action[]): string[] {
  const ids = new Set(referencedSections(JSON.stringify(actions)));
  for (const a of actions) if (a.type === "open_section" || a.type === "create_item") ids.add(a.sectionId);
  return [...ids];
}

/**
 * The spaces an automation may read from or write into: its own household's,
 * and private ones only when they belong to the automation's owner.
 */
export function allowedSections(
  sections: { id: string; household_id: string; owner_id: string | null }[],
  automation: { household_id: string; owner_id: string },
): Set<string> {
  return new Set(
    sections
      .filter((s) => s.household_id === automation.household_id && (s.owner_id === null || s.owner_id === automation.owner_id))
      .map((s) => s.id),
  );
}
