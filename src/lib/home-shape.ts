// Who a new home is for, from the onboarding questions, and the shared spaces
// that fit it. Plain so the onboarding form and the server seed share it.

export const HOUSEHOLD_KINDS = ["solo", "couple", "family", "roommates"] as const;
export type HouseholdKind = (typeof HOUSEHOLD_KINDS)[number];

export interface HomeShape {
  who: HouseholdKind;
  dog: boolean;
  kids: boolean;
}

export const DEFAULT_HOME: HomeShape = { who: "couple", dog: false, kids: false };

/** Shared spaces the home creator starts with (keys in the template library). */
export function starterSpaces(shape: HomeShape): string[] {
  return [
    "groceries",
    "cleaning",
    ...(shape.who === "couple" ? ["important-dates"] : []),
    ...(shape.who === "roommates" ? ["subscriptions"] : []),
    ...(shape.dog ? ["dog-care"] : []),
    ...(shape.kids ? ["kids"] : []),
  ];
}
