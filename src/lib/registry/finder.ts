// "Help me choose": a new user says what they want to get better at, and gets
// a short list of spaces from the template library instead of the whole gallery.
import type { Locale } from "@/i18n";
import { LIVE_TEMPLATES, type SectionTemplate } from "./templates";

type L = Record<Locale, string>;

export interface FinderGoal {
  key: string;
  icon: string;
  label: L;
  /** Template keys, best first; the first one the home doesn't have yet is ticked. */
  picks: string[];
}

export const FINDER_GOALS: FinderGoal[] = [
  { key: "dog", icon: "🐶", label: { en: "Look after the dog", he: "לטפל בכלב" }, picks: ["dog-care", "dog-health", "dog-training", "dog-supplies"] },
  { key: "fit", icon: "💪", label: { en: "Get fit", he: "להיכנס לכושר" }, picks: ["training", "meds"] },
  { key: "study", icon: "📚", label: { en: "Study for a test or learn", he: "ללמוד למבחן או משהו חדש" }, picks: ["goals", "commitments"] },
  { key: "habits", icon: "✅", label: { en: "Build better habits", he: "לבנות הרגלים טובים" }, picks: ["goals", "commitments", "meds"] },
  { key: "house", icon: "🧹", label: { en: "Keep the house in order", he: "לשמור על הבית מסודר" }, picks: ["cleaning", "groceries", "maintenance", "projects"] },
  { key: "food", icon: "🍽️", label: { en: "Plan meals and eat better", he: "לתכנן ארוחות ולאכול טוב" }, picks: ["groceries", "fridge", "recipes", "wheels"] },
  { key: "money", icon: "💰", label: { en: "Get on top of money", he: "לשלוט בכסף" }, picks: ["subscriptions", "spending", "savings", "receipts"] },
  { key: "car", icon: "🚗", label: { en: "Look after the car", he: "לטפל ברכב" }, picks: ["car", "documents"] },
  { key: "safe", icon: "🛡️", label: { en: "Be ready for emergencies", he: "להיות מוכנים לחירום" }, picks: ["shelter-kit", "documents", "meds"] },
  { key: "holidays", icon: "🕯️", label: { en: "Host holidays and guests", he: "לארח בחגים" }, picks: ["holidays", "groceries", "recipes"] },
  { key: "dates", icon: "🎂", label: { en: "Never forget a date", he: "לא לשכוח תאריכים" }, picks: ["important-dates", "appointments", "documents"] },
  { key: "health", icon: "💊", label: { en: "Health and meds", he: "בריאות ותרופות" }, picks: ["meds", "appointments", "checkups"] },
  { key: "us", icon: "💑", label: { en: "More time together", he: "יותר זמן ביחד" }, picks: ["date-ideas", "us", "wheels", "watch"] },
  { key: "promises", icon: "🤝", label: { en: "Keep what we promise", he: "לעמוד במה שהבטחנו" }, picks: ["commitments", "goals"] },
  { key: "work", icon: "💼", label: { en: "Work or a side business", he: "עבודה או עסק" }, picks: ["business-launch", "business-routine", "projects"] },
  { key: "travel", icon: "✈️", label: { en: "Trips and plans", he: "טיולים ותכנונים" }, picks: ["packing", "places", "savings"] },
  { key: "memories", icon: "📸", label: { en: "Keep our memories", he: "לשמור זיכרונות" }, picks: ["moments", "places", "watch", "recipes"] },
  { key: "move", icon: "🏡", label: { en: "Move or buy a home", he: "לעבור דירה או לקנות בית" }, picks: ["moving", "home-buy", "documents", "savings"] },
];

export interface Recommendation {
  template: SectionTemplate;
  /** The chosen goals this space serves. */
  goals: FinderGoal[];
  /** Ticked to start with: the best space for at least one goal. */
  suggested: boolean;
}

/** Up to this many spaces, a home is new enough to be offered "Help me choose" (the starter set is 5). */
export const FEW_SPACES = 5;

/** At most this many come back, so a new user isn't handed the whole gallery again. */
export const MAX_RECOMMENDATIONS = 8;

/**
 * Spaces for the chosen goals, best first, leaving out ones the home already has.
 * A space scores more the higher it sits in a goal's list, and adds up across goals.
 */
export function recommend(goalKeys: string[], existing: Iterable<string> = []): Recommendation[] {
  const have = new Set(existing);
  const goals = FINDER_GOALS.filter((g) => goalKeys.includes(g.key));
  const found = new Map<string, { score: number; order: number; goals: FinderGoal[]; suggested: boolean }>();
  for (const goal of goals) {
    const picks = goal.picks.filter((key) => !have.has(key));
    picks.forEach((key, i) => {
      const entry = found.get(key) ?? { score: 0, order: found.size, goals: [], suggested: false };
      entry.score += Math.max(3 - i, 1);
      entry.goals.push(goal);
      if (i === 0) entry.suggested = true;
      found.set(key, entry);
    });
  }
  return [...found.entries()]
    .sort(([, a], [, b]) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_RECOMMENDATIONS)
    .flatMap(([key, e]) => {
      const template = LIVE_TEMPLATES.find((t) => t.key === key);
      return template ? [{ template, goals: e.goals, suggested: e.suggested }] : [];
    });
}
