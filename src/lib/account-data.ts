// Export and account deletion (roadmap 1.8): the pure parts. The export is a
// zip of data.json, one CSV per space and the attachments; deleting an account
// takes the whole home only when nobody else lives there.

/** Same key as PHOTOS_PROP in photos.ts, which is a client module. */
const PHOTOS_PROP = "_photos";

export interface ExportItem {
  section_id: string;
  title: string;
  done: boolean;
  created_at: string;
  props: Record<string, unknown>;
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.map(String).join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180 CSV with a UTF-8 BOM, so Excel shows Hebrew instead of mojibake. */
export function toCsv(columns: string[], rows: unknown[][]) {
  return "﻿" + [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** One row per item; every property any item has gets a column. Internal props (`_photos`) stay out. */
export function spaceCsv(items: ExportItem[]) {
  const keys = [...new Set(items.flatMap((i) => Object.keys(i.props ?? {})))].filter((k) => !k.startsWith("_")).sort();
  return toCsv(
    ["title", "done", "created_at", ...keys],
    items.map((i) => [i.title, i.done ? "yes" : "no", i.created_at, ...keys.map((k) => i.props?.[k])]),
  );
}

/** A file name per space, safe on Windows and iOS, numbered when two spaces share a title. */
export function fileNames(spaces: { icon: string; title: string }[]) {
  const seen = new Map<string, number>();
  return spaces.map((s) => {
    const base = `${s.icon} ${s.title}`.replace(/[\\/:*?"<>|]/g, "-").trim() || "space";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? `${base}.csv` : `${base} (${n}).csv`;
  });
}

/** Storage paths of every attachment and its thumbnail. */
export function attachmentPaths(items: Pick<ExportItem, "props">[]) {
  return items.flatMap((i) => {
    const photos = i.props?.[PHOTOS_PROP];
    if (!Array.isArray(photos)) return [];
    return photos.flatMap((p) => (p && typeof p.path === "string" ? [p.path, ...(typeof p.thumb === "string" ? [p.thumb] : [])] : []));
  });
}

/**
 * What deleting this account removes beyond the rows that cascade with the
 * user: the home itself if they're its last member, and the stored files of
 * whatever goes (everything then, otherwise only their private spaces).
 */
export function deletionPlan(input: { userId: string; otherMembers: number; sections: { id: string; owner_id: string | null }[]; items: Pick<ExportItem, "section_id" | "props">[] }) {
  const deleteHome = input.otherMembers === 0;
  const going = new Set(input.sections.filter((s) => deleteHome || s.owner_id === input.userId).map((s) => s.id));
  return { deleteHome, files: attachmentPaths(input.items.filter((i) => going.has(i.section_id))) };
}
