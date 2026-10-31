import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openToken, sealToken, sealedWithCurrentKey } from "@/lib/subs/gmail";

/** Every column the app seals with GOOGLE_TOKEN_KEY, and the key that names its row. */
const SEALED = [
  { table: "gmail_connections", column: "refresh_token", id: "section_id" },
  { table: "calendar_connections", column: "refresh_token", id: "user_id" },
  { table: "home_info", column: "secrets", id: "household_id" },
] as const;

/**
 * Rotating GOOGLE_TOKEN_KEY (docs/SECRETS.md): re-seals everything still sealed
 * with GOOGLE_TOKEN_KEY_PREVIOUS under the current key. Safe to run twice.
 * Rows neither key opens are counted, not touched.
 */
export async function resealAll(db: SupabaseClient) {
  const result: Record<string, { resealed: number; current: number; unreadable: number }> = {};
  for (const { table, column, id } of SEALED) {
    const counts = { resealed: 0, current: 0, unreadable: 0 };
    const { data, error } = await db.from(table).select(`${id},${column}`).not(column, "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      if (sealedWithCurrentKey(row[column])) {
        counts.current++;
        continue;
      }
      let plain: string;
      try {
        plain = openToken(row[column]);
      } catch {
        counts.unreadable++;
        continue;
      }
      const { error: saveError } = await db.from(table).update({ [column]: sealToken(plain) }).eq(id, row[id]);
      if (saveError) throw new Error(`${table}: ${saveError.message}`);
      counts.resealed++;
    }
    result[table] = counts;
  }
  return result;
}
