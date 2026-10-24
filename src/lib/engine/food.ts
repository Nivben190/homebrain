import { diffDays } from "./habits";
import type { Pet } from "@/lib/db-types";

/** Days of food left in the current bag, or null if not tracked. */
export function foodDaysLeft(pet: Pick<Pet, "food_bag_kg" | "daily_grams" | "bag_started">, today: string): number | null {
  if (!pet.food_bag_kg || !pet.daily_grams || !pet.bag_started) return null;
  const used = Math.max(0, diffDays(pet.bag_started, today)) * pet.daily_grams;
  return Math.max(0, Math.floor((pet.food_bag_kg * 1000 - used) / pet.daily_grams));
}

/** Total days one bag lasts. */
export function bagDays(pet: Pick<Pet, "food_bag_kg" | "daily_grams">): number | null {
  if (!pet.food_bag_kg || !pet.daily_grams) return null;
  return Math.floor((pet.food_bag_kg * 1000) / pet.daily_grams);
}
